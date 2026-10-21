//! Groups inside a domain and tags on a question (Beta, P15): organising only.
//! Ids in the names are from `docs/superpowers/plans/2026-10-21-groups-tags-bulk-tests.md`.

use questiongame_host::catalog::{
    ArchiveScope, CatalogItem, CatalogKind, CatalogLocation, CatalogService, CopyOptions, Domain,
    DomainMember, Question, QuestionOption, SearchQuery, Selection,
};
use questiongame_host::{DomainGroupId, DomainId, QuestionId, WorkspaceId};

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str, tags: &[&str]) -> Question {
    let mut q = Question::new(id, format!("Question {id}"), 10);
    q.options = vec![
        QuestionOption::new(format!("{id}-a"), "Yes", true),
        QuestionOption::new(format!("{id}-b"), "No", false),
    ];
    q.tags = tags.iter().map(|t| t.to_string()).collect();
    q
}
fn member(q: &str, sort: i64, group: Option<&DomainGroupId>) -> DomainMember {
    DomainMember {
        question_id: QuestionId::from(q),
        sort_key: sort,
        group_id: group.cloned(),
    }
}
fn domain(catalog: &CatalogService, id: &str) -> Domain {
    match catalog.catalog_get(CatalogKind::Domain, id).unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    }
}
fn get_q(catalog: &CatalogService, id: &str) -> Question {
    match catalog.catalog_get(CatalogKind::Question, id).unwrap() {
        CatalogItem::Question(q) => *q,
        other => panic!("{other:?}"),
    }
}
fn group_of(catalog: &CatalogService, d: &str, q: &str) -> Option<DomainGroupId> {
    domain(catalog, d)
        .questions
        .into_iter()
        .find(|m| m.question_id.as_str() == q)
        .and_then(|m| m.group_id)
}

/// D1 = {q1, q2, q3}, no groups yet.
fn setup() -> CatalogService {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    for id in ["q1", "q2", "q3"] {
        catalog
            .catalog_upsert(&question(id, &[]).into(), NOW)
            .unwrap();
    }
    let mut d = Domain::new("d1", "History", "HIS");
    d.questions = vec![
        member("q1", 0, None),
        member("q2", 1, None),
        member("q3", 2, None),
    ];
    catalog.catalog_upsert(&d.into(), NOW).unwrap();
    catalog
}

fn put_in(catalog: &CatalogService, d: &str, q: &str, group: Option<&DomainGroupId>) {
    let mut dom = domain(catalog, d);
    for m in &mut dom.questions {
        if m.question_id.as_str() == q {
            m.group_id = group.cloned();
        }
    }
    catalog.catalog_upsert(&dom.into(), NOW).unwrap();
}

// ------------------------------------------------------------------- groups

#[test]
fn g1_g2_g9_groups_are_typed_trimmed_and_in_order() {
    let catalog = setup();
    let d1 = DomainId::from("d1");
    assert!(catalog.domain_group_create(&d1, "   ", NOW).is_err());
    catalog.domain_group_create(&d1, "  Romans ", NOW).unwrap();
    catalog.domain_group_create(&d1, "Medieval", NOW).unwrap();
    let names: Vec<String> = domain(&catalog, "d1")
        .groups
        .into_iter()
        .map(|g| g.name)
        .collect();
    assert_eq!(names, ["Romans", "Medieval"]);
    assert!(
        catalog
            .domain_group_create(&d1, &"x".repeat(61), NOW)
            .is_err()
    );
}

#[test]
fn g4_g5_g6_names_are_unique_in_their_domain_ignoring_case() {
    let catalog = setup();
    let mut d2 = Domain::new("d2", "Science", "SCI");
    d2.questions = vec![];
    catalog.catalog_upsert(&d2.into(), NOW).unwrap();
    let romans = catalog
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW)
        .unwrap();
    assert!(
        catalog
            .domain_group_create(&DomainId::from("d1"), "ROMANS", NOW)
            .is_err()
    );
    catalog
        .domain_group_create(&DomainId::from("d2"), "Romans", NOW)
        .unwrap();
    catalog
        .domain_group_rename(&romans.id, "ROMANS", NOW)
        .unwrap();
    assert_eq!(domain(&catalog, "d1").groups[0].name, "ROMANS");
}

#[test]
fn g10_g11_reorder_moves_and_refuses_a_foreign_group() {
    let catalog = setup();
    let d1 = DomainId::from("d1");
    let a = catalog.domain_group_create(&d1, "A", NOW).unwrap();
    let b = catalog.domain_group_create(&d1, "B", NOW).unwrap();
    let c = catalog.domain_group_create(&d1, "C", NOW).unwrap();
    catalog
        .domain_group_reorder(&d1, &[a.id.clone(), c.id.clone(), b.id.clone()], NOW)
        .unwrap();
    let names: Vec<String> = domain(&catalog, "d1")
        .groups
        .into_iter()
        .map(|g| g.name)
        .collect();
    assert_eq!(names, ["A", "C", "B"]);
    assert!(
        catalog
            .domain_group_reorder(&d1, &[DomainGroupId::from("nope")], NOW)
            .is_err()
    );
}

#[test]
fn g12_g15_g16_deleting_a_group_leaves_its_questions_ungrouped() {
    let catalog = setup();
    let d1 = DomainId::from("d1");
    let romans = catalog.domain_group_create(&d1, "Romans", NOW).unwrap();
    let other = catalog.domain_group_create(&d1, "Other", NOW).unwrap();
    put_in(&catalog, "d1", "q1", Some(&romans.id));
    put_in(&catalog, "d1", "q2", Some(&romans.id));
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(romans.id.clone()));
    put_in(&catalog, "d1", "q2", Some(&other.id));
    assert_eq!(
        group_of(&catalog, "d1", "q2"),
        Some(other.id.clone()),
        "one group per domain"
    );
    catalog.domain_group_delete(&romans.id, NOW).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), None);
    assert_eq!(
        domain(&catalog, "d1").questions.len(),
        3,
        "the questions stay"
    );
}

#[test]
fn g17_a_group_of_another_domain_is_refused() {
    let catalog = setup();
    let mut d2 = Domain::new("d2", "Science", "SCI");
    d2.questions = vec![member("q1", 0, None)];
    catalog.catalog_upsert(&d2.into(), NOW).unwrap();
    let foreign = catalog
        .domain_group_create(&DomainId::from("d2"), "Physics", NOW)
        .unwrap();
    let mut d1 = domain(&catalog, "d1");
    d1.questions[0].group_id = Some(foreign.id);
    assert!(catalog.catalog_upsert(&d1.into(), NOW).is_err());
}

#[test]
fn s1_s2_s3_s9_membership_rewrites_keep_groups() {
    let catalog = setup();
    let d1 = DomainId::from("d1");
    let a = catalog.domain_group_create(&d1, "A", NOW).unwrap();
    put_in(&catalog, "d1", "q1", Some(&a.id));
    // Saved as it came back (the domain pane), reordered:
    let mut d = domain(&catalog, "d1");
    d.questions.reverse();
    for (i, m) in d.questions.iter_mut().enumerate() {
        m.sort_key = i as i64;
    }
    catalog.catalog_upsert(&d.into(), NOW).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.id.clone()));
    // q2 leaves and comes back ungrouped; q1 keeps its group.
    let mut d = domain(&catalog, "d1");
    d.questions.retain(|m| m.question_id.as_str() != "q2");
    catalog.catalog_upsert(&d.clone().into(), NOW).unwrap();
    d.questions.push(member("q2", 9, None));
    catalog.catalog_upsert(&d.into(), NOW).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q2"), None);
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.id.clone()));
    catalog
        .catalog_archive(CatalogKind::Domain, "d1", NOW)
        .unwrap();
    catalog.catalog_restore(CatalogKind::Domain, "d1").unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.id));
}

#[test]
fn s5_s6_another_domain_on_the_question_leaves_its_group_alone() {
    let catalog = setup();
    let a = catalog
        .domain_group_create(&DomainId::from("d1"), "A", NOW)
        .unwrap();
    put_in(&catalog, "d1", "q1", Some(&a.id));
    let mut d2 = Domain::new("d2", "Science", "SCI");
    d2.questions = vec![member("q1", 0, None)];
    catalog.catalog_upsert(&d2.clone().into(), NOW).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.id.clone()));
    d2.questions.clear();
    catalog.catalog_upsert(&d2.into(), NOW).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.id));
}

// --------------------------------------------------------------------- tags

#[test]
fn t1_t3_t4_tags_are_trimmed_deduplicated_and_kept_in_order() {
    let catalog = setup();
    catalog
        .catalog_upsert(&question("q1", &[" Rome ", "b", "ROME", "  "]).into(), NOW)
        .unwrap();
    assert_eq!(get_q(&catalog, "q1").tags, ["Rome", "b"]);
    assert!(
        catalog
            .catalog_upsert(&question("q1", &[&"x".repeat(41)]).into(), NOW)
            .is_err()
    );
    catalog
        .catalog_upsert(&question("q1", &[&"x".repeat(40)]).into(), NOW)
        .unwrap();
}

#[test]
fn t2_t7_a_tag_takes_the_spelling_already_used() {
    let catalog = setup();
    catalog
        .catalog_upsert(&question("q1", &["Christmas", "Ștefan"]).into(), NOW)
        .unwrap();
    catalog
        .catalog_upsert(&question("q2", &["christmas", "ștefan"]).into(), NOW)
        .unwrap();
    assert_eq!(get_q(&catalog, "q2").tags, ["Christmas", "Ștefan"]);
    let list = catalog.tag_list().unwrap();
    assert_eq!(list.len(), 2);
    assert!(list.iter().all(|t| t.questions == 2));
}

#[test]
fn t5_t6_twenty_tags_and_no_more() {
    let catalog = setup();
    let twenty: Vec<String> = (0..20).map(|i| format!("t{i}")).collect();
    let refs: Vec<&str> = twenty.iter().map(String::as_str).collect();
    catalog
        .catalog_upsert(&question("q1", &refs).into(), NOW)
        .unwrap();
    let mut more = refs.clone();
    more.push("T0"); // folds onto t0: still twenty
    catalog
        .catalog_upsert(&question("q1", &more).into(), NOW)
        .unwrap();
    more.push("t20");
    assert!(
        catalog
            .catalog_upsert(&question("q1", &more).into(), NOW)
            .is_err(),
        "refused, not trimmed"
    );
    assert_eq!(get_q(&catalog, "q1").tags.len(), 20);
}

#[test]
fn t9_an_old_payload_without_tags_reads_as_none() {
    let json = serde_json::json!({ "id": "q", "stem": "s", "mediaAssetId": null, "options": [], "explanation": null,
        "createdAt": 0, "updatedAt": 0, "archivedAt": null });
    let q: Question = serde_json::from_value(json).unwrap();
    assert!(q.tags.is_empty());
}

#[test]
fn t13_t14_t15_search_finds_a_question_by_its_tag() {
    let catalog = setup();
    catalog
        .catalog_upsert(&question("q1", &["xmas"]).into(), NOW)
        .unwrap();
    let find = |text: &str| {
        catalog
            .catalog_search(&SearchQuery {
                text: text.into(),
                kinds: vec![CatalogKind::Question],
                scope: ArchiveScope::All,
                limit: 10,
            })
            .unwrap()
            .into_iter()
            .map(|h| h.id)
            .collect::<Vec<_>>()
    };
    assert_eq!(find("XMAS"), ["q1"]);
    catalog
        .catalog_upsert(&question("q1", &["advent"]).into(), NOW)
        .unwrap();
    assert!(find("xmas").is_empty());
    assert_eq!(find("advent"), ["q1"]);
}

// --------------------------------------------------------------- workspaces

fn two(catalog: &CatalogService) -> (WorkspaceId, WorkspaceId) {
    let a = catalog.current_workspace();
    catalog.workspace_rename(&a, "A", NOW).unwrap();
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    (a, b)
}

#[test]
fn w1_w2_copying_a_domain_copies_its_groups_and_a_question_its_tags() {
    let catalog = setup();
    let (_a, b) = two(&catalog);
    let romans = catalog
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW)
        .unwrap();
    catalog
        .domain_group_create(&DomainId::from("d1"), "Later", NOW)
        .unwrap();
    put_in(&catalog, "d1", "q1", Some(&romans.id));
    catalog
        .catalog_upsert(&question("q1", &["Rome"]).into(), NOW)
        .unwrap();
    catalog
        .catalog_copy_to(
            &Selection {
                domains: vec![DomainId::from("d1")],
                ..Selection::default()
            },
            &b,
            CopyOptions::default(),
            NOW,
        )
        .unwrap();

    catalog.workspace_switch(&b).unwrap();
    let copies = catalog
        .catalog_list(CatalogKind::Domain, ArchiveScope::All)
        .unwrap();
    let CatalogItem::Domain(copy) = &copies[0] else {
        panic!()
    };
    let names: Vec<&str> = copy.groups.iter().map(|g| g.name.as_str()).collect();
    assert_eq!(names, ["Romans", "Later"]);
    assert!(copy.groups.iter().all(|g| g.id != romans.id), "new ids");
    let first = copy
        .questions
        .iter()
        .find(|m| m.group_id.is_some())
        .expect("q1's copy kept its group");
    assert_eq!(first.group_id.as_ref(), Some(&copy.groups[0].id));
    assert_eq!(get_q(&catalog, first.question_id.as_str()).tags, ["Rome"]);
}

#[test]
fn w4_a_reused_domain_keeps_its_groups_and_arrivals_have_none() {
    let catalog = setup();
    let (_a, b) = two(&catalog);
    let d = Selection {
        domains: vec![DomainId::from("d1")],
        ..Selection::default()
    };
    let game = {
        let mut r = questiongame_host::catalog::Recipe::new(
            "g1",
            "Game",
            questiongame_host::flags::GameSettings::default(),
        );
        r.board = vec![questiongame_host::catalog::BoardDomain {
            domain_id: DomainId::from("d1"),
            question_ids: vec![QuestionId::from("q1")],
        }];
        catalog.recipe_upsert(&r, NOW).unwrap();
        Selection {
            recipes: vec![questiongame_host::RecipeId::from("g1")],
            ..Selection::default()
        }
    };
    catalog
        .catalog_copy_to(&d, &b, CopyOptions::default(), NOW)
        .unwrap();
    catalog
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW)
        .unwrap();
    let report = catalog
        .catalog_copy_to(&game, &b, CopyOptions::default(), NOW)
        .unwrap();
    assert!(report.reused.iter().any(|t| t.kind == CatalogKind::Domain));
    catalog.workspace_switch(&b).unwrap();
    let CatalogItem::Domain(copy) = &catalog
        .catalog_list(CatalogKind::Domain, ArchiveScope::All)
        .unwrap()[0]
    else {
        panic!()
    };
    assert!(
        copy.groups.is_empty(),
        "groups are never matched or merged into a reused domain"
    );
}

#[test]
fn w11_duplicate_copies_a_domains_groups() {
    let catalog = setup();
    let (a, b) = two(&catalog);
    let romans = catalog
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW)
        .unwrap();
    put_in(&catalog, "d1", "q1", Some(&romans.id));
    catalog
        .catalog_upsert(&question("q2", &["Rome"]).into(), NOW)
        .unwrap();
    let copy = catalog.workspace_duplicate(&a, "A copy", NOW).unwrap();
    catalog.workspace_switch(&copy.id).unwrap();
    let CatalogItem::Domain(dup) = &catalog
        .catalog_list(CatalogKind::Domain, ArchiveScope::All)
        .unwrap()[0]
    else {
        panic!()
    };
    assert_eq!(dup.groups[0].name, "Romans");
    assert!(
        dup.questions
            .iter()
            .any(|m| m.group_id.as_ref() == Some(&dup.groups[0].id))
    );
    assert_eq!(catalog.tag_list().unwrap()[0].tag, "Rome");
    let _ = b;
}

#[test]
fn w12_propagation_carries_tags_and_never_groups() {
    let catalog = setup();
    let (_a, b) = two(&catalog);
    let romans = catalog
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW)
        .unwrap();
    put_in(&catalog, "d1", "q1", Some(&romans.id));
    catalog
        .catalog_copy_to(
            &Selection {
                domains: vec![DomainId::from("d1")],
                ..Selection::default()
            },
            &b,
            CopyOptions::default(),
            NOW,
        )
        .unwrap();
    catalog
        .catalog_upsert_propagating(&question("q1", &["Rome", "Empire"]).into(), NOW)
        .unwrap();
    catalog.workspace_switch(&b).unwrap();
    let CatalogItem::Domain(copy) = &catalog
        .catalog_list(CatalogKind::Domain, ArchiveScope::All)
        .unwrap()[0]
    else {
        panic!()
    };
    let grouped = copy
        .questions
        .iter()
        .find(|m| m.group_id.is_some())
        .unwrap();
    assert_eq!(
        get_q(&catalog, grouped.question_id.as_str()).tags,
        ["Rome", "Empire"]
    );
    assert_eq!(
        copy.questions
            .iter()
            .filter(|m| m.group_id.is_some())
            .count(),
        1,
        "its membership stays its own"
    );
}

#[test]
fn t18_t19_t20_the_import_file_may_carry_tags() {
    let catalog = setup();
    catalog
        .catalog_upsert(&question("q1", &["Christmas"]).into(), NOW)
        .unwrap();
    let text = r#"{ "questions": [
        { "question": "A?", "options": [{ "text": "x", "correct": true }, { "text": "y" }], "difficulty": 10, "tags": [" christmas ", "Snow", "snow"] },
        { "question": "B?", "options": [{ "text": "x", "correct": true }, { "text": "y" }], "difficulty": 20, "tags": "nope" },
        { "question": "C?", "options": [{ "text": "x", "correct": true }, { "text": "y" }], "difficulty": 30, "tags": ["1","2","3","4","5","6","7","8","9","10","11","12","13","14","15","16","17","18","19","20","21"] }
    ] }"#;
    let (report, _) = catalog.import_questions(text, true, None, NOW).unwrap();
    assert_eq!(report.counts.incomplete, 3, "in no domain: {report:?}");
    let all: Vec<Question> = catalog
        .catalog_list(CatalogKind::Question, ArchiveScope::All)
        .unwrap()
        .into_iter()
        .filter_map(|i| match i {
            CatalogItem::Question(q) => Some(*q),
            _ => None,
        })
        .collect();
    let tags_of = |stem: &str| all.iter().find(|q| q.stem == stem).unwrap().tags.clone();
    assert_eq!(
        tags_of("A?"),
        ["Christmas", "Snow"],
        "the spelling in view, one per fold"
    );
    assert!(tags_of("B?").is_empty());
    assert!(
        tags_of("C?").is_empty(),
        "over the cap: dropped whole, not trimmed"
    );
}
