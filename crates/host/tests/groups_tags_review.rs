//! The P15 host review's findings, each pinned (Opus, 2026-10-21).

use questiongame_host::catalog::{
    ArchiveScope, BulkEdit, CatalogError, CatalogItem, CatalogKind, CatalogLocation,
    CatalogService, Demo, Domain, DomainMember, Question, QuestionOption, SearchQuery, SeedMode,
    Selection,
};
use questiongame_host::{DomainGroupId, DomainId, GameSettings, QuestionId};

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
fn domain(c: &CatalogService, id: &str) -> Domain {
    match c.catalog_get(CatalogKind::Domain, id).unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    }
}
fn get_q(c: &CatalogService, id: &str) -> Question {
    match c.catalog_get(CatalogKind::Question, id).unwrap() {
        CatalogItem::Question(q) => *q,
        other => panic!("{other:?}"),
    }
}
fn ids(list: &[&str]) -> Vec<QuestionId> {
    list.iter().map(|id| QuestionId::from(*id)).collect()
}
fn history(c: &CatalogService, members: &[&str]) {
    let mut d = Domain::new("d1", "History", "HIS");
    d.questions = members
        .iter()
        .enumerate()
        .map(|(i, q)| DomainMember {
            question_id: QuestionId::from(*q),
            sort_key: i as i64,
            group_id: None,
        })
        .collect();
    c.catalog_upsert(&d.into(), NOW).unwrap();
}

#[test]
fn w20_a_group_in_a_demo_domain_is_not_an_edit_and_restore_keeps_it() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    c.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .unwrap();
    let before = c
        .seed_status(Demo::En, GameSettings::default())
        .unwrap()
        .edited;
    let CatalogItem::Domain(first) = &c
        .catalog_list(CatalogKind::Domain, ArchiveScope::Active)
        .unwrap()[0]
    else {
        panic!()
    };
    let (id, q0) = (first.id.clone(), first.questions[0].question_id.clone());
    let g = c.domain_group_create(&id, "Mine", NOW).unwrap();
    c.catalog_bulk_edit(
        std::slice::from_ref(&q0),
        &BulkEdit::Group {
            domain_id: id.clone(),
            group_id: Some(g.id.clone()),
        },
        true,
        NOW,
    )
    .unwrap();
    assert_eq!(
        c.seed_status(Demo::En, GameSettings::default())
            .unwrap()
            .edited,
        before,
        "grouping is not an edit of the game"
    );
    c.seed_demo(
        Demo::En,
        SeedMode::Overwrite,
        GameSettings::default(),
        NOW + 1,
    )
    .unwrap();
    let after = domain(&c, id.as_str());
    assert_eq!(after.groups.len(), 1);
    assert_eq!(
        after
            .questions
            .iter()
            .find(|m| m.question_id == q0)
            .unwrap()
            .group_id,
        Some(g.id)
    );
    assert_eq!(
        c.seed_status(Demo::En, GameSettings::default())
            .unwrap()
            .edited,
        0
    );
}

#[test]
fn a_deleted_groups_id_is_a_readable_refusal() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    c.catalog_upsert(&question("q1", &[]).into(), NOW).unwrap();
    let mut d = Domain::new("d1", "History", "HIS");
    d.questions = vec![DomainMember {
        question_id: QuestionId::from("q1"),
        sort_key: 0,
        group_id: Some(DomainGroupId::from("grp-gone")),
    }];
    match c.catalog_upsert(&d.into(), NOW).unwrap_err() {
        CatalogError::Invalid { reason, .. } => assert_eq!(reason, "that group no longer exists"),
        other => panic!("{other:?}"),
    }
}

#[test]
fn the_cap_refusal_says_how_many() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let twenty: Vec<String> = (0..20).map(|i| format!("t{i}")).collect();
    for id in ["q1", "q2"] {
        let mut q = question(id, &[]);
        q.tags = twenty.clone();
        c.catalog_upsert(&q.into(), NOW).unwrap();
    }
    let err = c
        .catalog_bulk_edit(
            &ids(&["q1", "q2"]),
            &BulkEdit::Tag { tag: "more".into() },
            false,
            NOW,
        )
        .unwrap_err();
    assert!(
        err.to_string()
            .contains("2 questions would have more than 20"),
        "{err}"
    );
}

#[test]
fn a_rename_to_the_same_spelling_touches_nothing_and_a_merge_only_what_changes() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    c.catalog_upsert(&question("q1", &["Xmas"]).into(), NOW)
        .unwrap();
    c.catalog_upsert(&question("q2", &["christmas"]).into(), NOW)
        .unwrap();
    let same = c.tag_rename("xmas", "Xmas", true, NOW + 5).unwrap();
    assert!(same.changed.is_empty());
    assert_eq!(get_q(&c, "q1").stamps.updated_at, NOW);
    // Merging Xmas into christmas: only the Xmas carrier changes; the target keeps its one spelling.
    let merge = c.tag_rename("xmas", "CHRISTMAS", true, NOW + 9).unwrap();
    assert_eq!(merge.changed, ids(&["q1"]));
    assert_eq!(get_q(&c, "q1").tags, ["christmas"]);
    assert_eq!(
        get_q(&c, "q2").stamps.updated_at,
        NOW,
        "an unchanged carrier is not touched"
    );
}

#[test]
fn membership_and_group_changes_move_updated_at() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    c.catalog_upsert(&question("q1", &[]).into(), NOW).unwrap();
    history(&c, &[]);
    c.catalog_bulk_edit(
        &ids(&["q1"]),
        &BulkEdit::AddToDomain {
            domain_id: DomainId::from("d1"),
        },
        true,
        NOW + 3,
    )
    .unwrap();
    assert_eq!(get_q(&c, "q1").stamps.updated_at, NOW + 3);
    let g = c
        .domain_group_create(&DomainId::from("d1"), "Romans", NOW + 4)
        .unwrap();
    assert_eq!(domain(&c, "d1").stamps.updated_at, NOW + 4);
    assert_eq!(
        c.domain_group_rename(&g.id, "Rome", NOW + 5).unwrap(),
        DomainId::from("d1")
    );
    assert_eq!(domain(&c, "d1").stamps.updated_at, NOW + 5);
    assert_eq!(
        c.domain_group_delete(&g.id, NOW + 6).unwrap(),
        DomainId::from("d1")
    );
    assert_eq!(domain(&c, "d1").stamps.updated_at, NOW + 6);
}

#[test]
fn search_indexes_the_tags_as_stored() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    c.catalog_upsert(&question("q1", &["Christmas"]).into(), NOW)
        .unwrap();
    // Sent as "  christmas  ": what is stored, and indexed, is "Christmas".
    c.catalog_upsert(&question("q2", &["  christmas  "]).into(), NOW)
        .unwrap();
    let hits = c
        .catalog_search(&SearchQuery {
            text: "Christmas".into(),
            kinds: vec![CatalogKind::Question],
            scope: ArchiveScope::All,
            limit: 10,
        })
        .unwrap();
    assert!(hits.iter().any(|h| h.id == "q2"), "{hits:?}");
}

#[test]
fn a_moved_question_takes_the_spelling_of_its_new_workspace() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let a = c.current_workspace();
    let b = c.workspace_create("B", None, NOW).unwrap().id;
    c.workspace_switch(&b).unwrap();
    c.catalog_upsert(&question("qb", &["Christmas"]).into(), NOW)
        .unwrap();
    c.workspace_switch(&a).unwrap();
    c.catalog_upsert(&question("qa", &["xmas", "CHRISTMAS"]).into(), NOW + 1)
        .unwrap();
    c.catalog_move_to(
        &Selection {
            questions: ids(&["qa"]),
            ..Selection::default()
        },
        &b,
        NOW + 2,
    )
    .unwrap();
    c.workspace_switch(&b).unwrap();
    assert_eq!(get_q(&c, "qa").tags, ["xmas", "Christmas"]);
}
