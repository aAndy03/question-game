//! beta.8: *Share…* on Domains & Questions copies the picked questions as one
//! `questiongame.questions` document, complete, and *Import questions…* reads
//! it back — into another library as the same questions in the same domains,
//! into the same library as nothing new.

use questiongame_host::catalog::{
    ArchiveScope, CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Domain,
    DomainMember, Question, QuestionOption, RowStatus,
};
use questiongame_host::QuestionId;
use serde_json::Value;

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str, stem: &str, difficulty: Option<u8>, options: &[(&str, bool)]) -> Question {
    let mut q = Question::new(id, stem, 10);
    q.difficulty = difficulty;
    q.options = options
        .iter()
        .enumerate()
        .map(|(k, (text, correct))| QuestionOption::new(format!("{id}-{k}"), *text, *correct))
        .collect();
    q
}

fn member(id: &str, k: i64) -> DomainMember {
    DomainMember {
        question_id: QuestionId::from(id),
        sort_key: k,
        group_id: None,
    }
}

fn put(c: &CatalogService, item: CatalogItem) {
    c.catalog_upsert(&item, NOW).unwrap();
}

/// Two questions in History, one of them also in Science; a multiple-answer
/// question with tags and an explanation; an incomplete one with no domain.
fn sharer() -> CatalogService {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let mut rome = question("q-rome", "When did Rome fall?", Some(30), &[("476", true), ("1453", false), ("1066", false)]);
    rome.tags = vec!["Empire".into(), "Rome".into()];
    rome.explanation = Some("The Western empire, that is.".into());
    put(&c, CatalogItem::Question(Box::new(rome)));
    let primes = question("q-primes", "Which two are primes?", Some(60), &[("2", true), ("3", true), ("4", false)]);
    put(&c, CatalogItem::Question(Box::new(primes)));
    let loose = question("q-loose", "Not finished yet", None, &[("Yes", false)]);
    put(&c, CatalogItem::Question(Box::new(loose)));
    let mut history = Domain::new("dom-his", "History", "HIS_204");
    history.questions = vec![member("q-rome", 0), member("q-primes", 1)];
    put(&c, CatalogItem::Domain(Box::new(history)));
    let mut science = Domain::new("dom-sci", "Science", "SCI_300");
    science.questions = vec![member("q-primes", 0)];
    put(&c, CatalogItem::Domain(Box::new(science)));
    c
}

fn ids(list: &[&str]) -> Vec<QuestionId> {
    list.iter().map(|id| QuestionId::from(*id)).collect()
}

fn rows(text: &str) -> Vec<Value> {
    let doc: Value = serde_json::from_str(text).unwrap();
    assert_eq!(doc["format"], "questiongame.questions");
    assert_eq!(doc["version"], 1);
    doc["questions"].as_array().unwrap().clone()
}

#[test]
fn writes_every_field_the_import_reads_in_the_order_given() {
    let text = sharer().export_questions(&ids(&["q-primes", "q-rome", "q-loose"])).unwrap();
    let rows = rows(&text);
    assert_eq!(rows.len(), 3);
    // The order given, not the library's.
    assert_eq!(rows[0]["question"], "Which two are primes?");
    assert_eq!(rows[1]["question"], "When did Rome fall?");
    // Every domain a question sits in.
    assert_eq!(rows[0]["domains"], serde_json::json!(["History", "Science"]));
    // Several right answers, each said; a wrong one is its text.
    assert_eq!(rows[0]["options"], serde_json::json!([{ "text": "2", "correct": true }, { "text": "3", "correct": true }, "4"]));
    assert_eq!(rows[1]["difficulty"], 30);
    assert_eq!(rows[1]["tags"], serde_json::json!(["Empire", "Rome"]));
    assert_eq!(rows[1]["explanation"], "The Western empire, that is.");
    // Incomplete: no difficulty, no domain — the fields are left out, not null.
    assert!(rows[2].get("difficulty").is_none());
    assert!(rows[2].get("domains").is_none());
    assert!(rows[2].get("tags").is_none());
}

#[test]
fn another_library_imports_the_same_questions_in_the_same_domains() {
    let text = sharer().export_questions(&ids(&["q-rome", "q-primes", "q-loose"])).unwrap();
    let receiver = CatalogService::open(CatalogLocation::Memory).unwrap();
    // The receiver already has a History: the shared questions join it.
    put(&receiver, CatalogItem::Domain(Box::new(Domain::new("dom-mine", "History", "HIS_001"))));

    let (report, _) = receiver.import_questions(&text, true, None, NOW).unwrap();
    let statuses: Vec<RowStatus> = report.rows.iter().map(|r| r.status).collect();
    assert_eq!(statuses, [RowStatus::Complete, RowStatus::Complete, RowStatus::Incomplete]);

    let questions: Vec<Question> = receiver
        .catalog_list(CatalogKind::Question, ArchiveScope::Active)
        .unwrap()
        .into_iter()
        .filter_map(|i| i.as_question().cloned())
        .collect();
    let rome = questions.iter().find(|q| q.stem == "When did Rome fall?").unwrap();
    assert_eq!(rome.difficulty, Some(30));
    assert_eq!(rome.tags, ["Empire", "Rome"]);
    assert_eq!(rome.explanation.as_deref(), Some("The Western empire, that is."));
    assert_eq!(rome.options.iter().map(|o| (o.text.as_str(), o.correct)).collect::<Vec<_>>(), [("476", true), ("1453", false), ("1066", false)]);
    let primes = questions.iter().find(|q| q.stem == "Which two are primes?").unwrap();
    assert_eq!(primes.options.iter().filter(|o| o.correct).count(), 2);
    let loose = questions.iter().find(|q| q.stem == "Not finished yet").unwrap();
    assert_eq!(loose.difficulty, None);

    let domains: Vec<Domain> = receiver
        .catalog_list(CatalogKind::Domain, ArchiveScope::Active)
        .unwrap()
        .into_iter()
        .filter_map(|i| i.as_domain().cloned())
        .collect();
    let history = domains.iter().find(|d| d.id.as_str() == "dom-mine").unwrap();
    assert!(history.questions.iter().any(|m| m.question_id == rome.id), "joined the existing History");
    assert!(history.questions.iter().any(|m| m.question_id == primes.id));
    let science = domains.iter().find(|d| d.name == "Science").expect("a missing domain is created");
    assert!(science.questions.iter().any(|m| m.question_id == primes.id));
    assert_eq!(domains.iter().filter(|d| d.name == "History").count(), 1, "no second History");
}

#[test]
fn the_same_library_takes_nothing_new_from_its_own_share() {
    let c = sharer();
    let text = c.export_questions(&ids(&["q-rome", "q-primes"])).unwrap();
    let (report, _) = c.import_questions(&text, false, None, NOW).unwrap();
    assert!(report.rows.iter().all(|r| r.status == RowStatus::Duplicate));
}

#[test]
fn a_name_two_domains_share_is_written_as_the_code() {
    let c = sharer();
    let mut twin = Domain::new("dom-his2", "history", "HIS_999");
    twin.questions = vec![member("q-loose", 0)];
    put(&c, CatalogItem::Domain(Box::new(twin)));
    let rows = rows(&c.export_questions(&ids(&["q-rome", "q-loose"])).unwrap());
    assert_eq!(rows[0]["domains"], serde_json::json!(["HIS_204"]));
    assert_eq!(rows[1]["domains"], serde_json::json!(["HIS_999"]));
}

#[test]
fn an_archived_domain_is_not_written_and_an_archived_question_is() {
    let c = sharer();
    c.catalog_archive(CatalogKind::Domain, "dom-sci", NOW).unwrap();
    c.catalog_archive(CatalogKind::Question, "q-rome", NOW).unwrap();
    let rows = rows(&c.export_questions(&ids(&["q-primes", "q-rome"])).unwrap());
    assert_eq!(rows[0]["domains"], serde_json::json!(["History"]));
    assert_eq!(rows[1]["question"], "When did Rome fall?");
}

#[test]
fn an_id_that_is_not_in_the_library_is_refused() {
    let err = sharer().export_questions(&ids(&["q-rome", "q-gone"])).unwrap_err();
    assert!(matches!(err, CatalogError::NotFound { kind: CatalogKind::Question, ref id } if id == "q-gone"));
}
