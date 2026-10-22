//! P20, the interface pass: the host halves of the managers, the game labels,
//! the import overrides and Statistics' order. The design is
//! `docs/superpowers/specs/2026-10-22-p20-interface-pass-design.md`.

use questiongame_host::catalog::{
    CatalogItem, CatalogKind, CatalogLocation, CatalogService, Domain, DomainMember, Question,
    QuestionOption,
};
use questiongame_host::{DomainGroupId, DomainId, QuestionId};

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str) -> Question {
    let mut q = Question::new(id, format!("Question {id}"), 10);
    q.options = vec![
        QuestionOption::new(format!("{id}-a"), "Yes", true),
        QuestionOption::new(format!("{id}-b"), "No", false),
    ];
    q
}

fn domain(catalog: &CatalogService, id: &str) -> Domain {
    match catalog.catalog_get(CatalogKind::Domain, id).unwrap() {
        CatalogItem::Domain(d) => *d,
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

/// `d1` = {q1, q2, q3} in groups A (q1, q2) and B (q3); `d2` = {q1} in group C.
fn library() -> (CatalogService, DomainGroupId, DomainGroupId, DomainGroupId) {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    for id in ["q1", "q2", "q3"] {
        catalog.catalog_upsert(&question(id).into(), NOW).unwrap();
    }
    let mut d1 = Domain::new("d1", "History", "HIS");
    let mut d2 = Domain::new("d2", "Science", "SCI");
    let member = |q: &str, sort: i64| DomainMember {
        question_id: QuestionId::from(q),
        sort_key: sort,
        group_id: None,
    };
    d1.questions = vec![member("q1", 0), member("q2", 1), member("q3", 2)];
    d2.questions = vec![member("q1", 0)];
    catalog.catalog_upsert(&d1.into(), NOW).unwrap();
    catalog.catalog_upsert(&d2.into(), NOW).unwrap();
    let a = catalog.domain_group_create(&DomainId::from("d1"), "A", NOW).unwrap().id;
    let b = catalog.domain_group_create(&DomainId::from("d1"), "B", NOW).unwrap().id;
    let c = catalog.domain_group_create(&DomainId::from("d2"), "C", NOW).unwrap().id;
    let mut dom = domain(&catalog, "d1");
    for m in &mut dom.questions {
        m.group_id = Some(if m.question_id.as_str() == "q3" { b.clone() } else { a.clone() });
    }
    catalog.catalog_upsert(&dom.into(), NOW).unwrap();
    let mut dom = domain(&catalog, "d2");
    dom.questions[0].group_id = Some(c.clone());
    catalog.catalog_upsert(&dom.into(), NOW).unwrap();
    (catalog, a, b, c)
}

// ------------------------------------------------------------ domain groups

#[test]
fn merging_a_domain_group_moves_its_questions_and_deletes_it_in_one_write() {
    let (catalog, a, b, _) = library();
    catalog.domain_group_delete_into(&a, Some(&b), NOW + 1).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(b.clone()));
    assert_eq!(group_of(&catalog, "d1", "q2"), Some(b.clone()));
    assert_eq!(group_of(&catalog, "d1", "q3"), Some(b.clone()));
    let names: Vec<String> = domain(&catalog, "d1").groups.into_iter().map(|g| g.name).collect();
    assert_eq!(names, ["B"]);
}

#[test]
fn a_merge_into_another_domains_group_is_refused_and_changes_nothing() {
    let (catalog, a, _, c) = library();
    assert!(catalog.domain_group_delete_into(&a, Some(&c), NOW + 1).is_err());
    assert_eq!(group_of(&catalog, "d1", "q1"), Some(a.clone()));
    assert_eq!(domain(&catalog, "d1").groups.len(), 2);
    assert_eq!(group_of(&catalog, "d2", "q1"), Some(c));
}

#[test]
fn a_merge_into_itself_is_refused() {
    let (catalog, a, _, _) = library();
    assert!(catalog.domain_group_delete_into(&a, Some(&a), NOW + 1).is_err());
    assert_eq!(domain(&catalog, "d1").groups.len(), 2);
}

#[test]
fn deleting_without_a_target_still_leaves_the_questions_ungrouped() {
    let (catalog, a, _, _) = library();
    catalog.domain_group_delete_into(&a, None, NOW + 1).unwrap();
    assert_eq!(group_of(&catalog, "d1", "q1"), None);
    assert_eq!(domain(&catalog, "d1").questions.len(), 3);
}
