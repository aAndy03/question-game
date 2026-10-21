//! beta.3: the import preview says where each row lands, its tags, and what a
//! duplicate repeats; two domains of one name resolve to the oldest, said.

use questiongame_host::catalog::{
    CatalogItem, CatalogLocation, CatalogService, Domain, Question, QuestionOption, RowStatus,
};

const NOW: u64 = 1_790_000_000_000;

fn catalog() -> CatalogService {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let mut q = Question::new("q1", "Who built Rome?", 10);
    q.options = vec![
        QuestionOption::new("q1-a", "Romulus", true),
        QuestionOption::new("q1-b", "Remus", false),
    ];
    c.catalog_upsert(&CatalogItem::Question(Box::new(q)), NOW)
        .unwrap();
    let mut old = Domain::new("dom-old", "History", "HIS_100");
    old.stamps.created_at = 1;
    c.catalog_upsert(&CatalogItem::Domain(Box::new(old)), 1)
        .unwrap();
    c.catalog_upsert(
        &CatalogItem::Domain(Box::new(Domain::new("dom-new", "History", "HIS_200"))),
        NOW + 5,
    )
    .unwrap();
    c
}

#[test]
fn the_preview_says_where_a_row_lands_its_tags_and_what_a_duplicate_repeats() {
    let c = catalog();
    let text = r#"[
      {"question": "When did Rome fall?", "options": [{"text": "476", "correct": true}, {"text": "1453"}], "domains": ["history"], "tags": [" Empire ", "empire", "Rome"]},
      {"question": "Who built Rome?", "options": [{"text": "Romulus", "correct": true}, {"text": "Remus"}]},
      {"question": "Name a river", "options": [{"text": "Tiber", "correct": true}, {"text": "Nile"}], "domains": ["Geography"]},
      {"question": "When did Rome fall?", "options": [{"text": "476", "correct": true}, {"text": "1453"}]}
    ]"#;
    let (report, _) = c.import_questions(text, false, None, NOW).unwrap();
    let rows = &report.rows;
    assert_eq!(
        rows[0].landing,
        ["History (HIS_100), the oldest of 2 named History"]
    );
    assert_eq!(rows[0].tags, ["Empire", "Rome"]);
    assert_eq!(rows[1].status, RowStatus::Duplicate);
    assert_eq!(rows[1].duplicate_of.as_deref(), Some("Who built Rome?"));
    assert_eq!(rows[2].landing, ["Geography (new)"]);
    assert_eq!(rows[3].duplicate_of, None);
    assert_eq!(rows[3].duplicate_row, Some(1));
}

#[test]
fn a_code_always_names_exactly_one_domain() {
    let c = catalog();
    let text = r#"[{"question": "Q", "options": [{"text": "A", "correct": true}, {"text": "B"}], "domains": ["HIS_200"]}]"#;
    let (report, _) = c.import_questions(text, false, None, NOW).unwrap();
    assert_eq!(
        report.rows[0].landing,
        ["History (HIS_200), one of 2 named History"]
    );
}
