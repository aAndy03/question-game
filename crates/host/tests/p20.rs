//! P20, the interface pass: the host halves of the managers, the game labels,
//! the import overrides and Statistics' order. The design is
//! `docs/superpowers/specs/2026-10-22-p20-interface-pass-design.md`.

use questiongame_host::catalog::{
    ArchiveScope, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Domain, DomainMember,
    Question, QuestionOption, Recipe, RecipeEdit, SearchQuery,
};
use questiongame_host::flags::GameSettings;
use questiongame_host::ids::RecipeId;
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

// ------------------------------------------------------------- game labels

fn game(c: &CatalogService, id: &str, folder: Option<&str>, tags: &[&str]) {
    let mut r = Recipe::new(id, format!("Game {id}"), GameSettings::default());
    r.folder = folder.map(str::to_owned);
    r.tags = tags.iter().map(|t| t.to_string()).collect();
    c.recipe_upsert(&r, NOW).unwrap();
}
fn get(c: &CatalogService, id: &str) -> Recipe {
    c.recipe_get(&RecipeId::from(id)).unwrap()
}
fn ids(list: &[&str]) -> Vec<RecipeId> {
    list.iter().map(|i| RecipeId::from(*i)).collect()
}
fn folder(f: Option<&str>) -> RecipeEdit {
    RecipeEdit::SetFolder { folder: f.map(str::to_owned) }
}
fn tag(t: &str) -> RecipeEdit {
    RecipeEdit::Tag { tag: t.to_owned() }
}
fn untag(t: &str) -> RecipeEdit {
    RecipeEdit::Untag { tag: t.to_owned() }
}

#[test]
fn set_folder_sets_it_on_every_selected_game_and_reports_who_changed() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "g1", None, &[]);
    game(&c, "g2", Some("Finals"), &[]);
    game(&c, "g3", None, &[]);
    let r = c.recipe_bulk_edit(&ids(&["g1", "g2", "g3"]), &[folder(Some("Finals"))], true, NOW + 1).unwrap();
    assert_eq!(r.changed, ids(&["g1", "g3"]));
    assert_eq!(r.unchanged, ids(&["g2"]));
    for g in ["g1", "g2", "g3"] {
        assert_eq!(get(&c, g).folder.as_deref(), Some("Finals"));
    }
    let r = c.recipe_bulk_edit(&ids(&["g1", "g2"]), &[folder(None)], true, NOW + 2).unwrap();
    assert_eq!(r.changed.len(), 2);
    assert_eq!(get(&c, "g1").folder, None);
}

#[test]
fn a_folder_is_trimmed_not_empty_and_at_most_sixty() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "g1", None, &[]);
    c.recipe_bulk_edit(&ids(&["g1"]), &[folder(Some("  Finals "))], true, NOW).unwrap();
    assert_eq!(get(&c, "g1").folder.as_deref(), Some("Finals"));
    assert!(c.recipe_bulk_edit(&ids(&["g1"]), &[folder(Some("   "))], true, NOW).is_err());
    assert!(c.recipe_bulk_edit(&ids(&["g1"]), &[folder(Some(&"x".repeat(61)))], true, NOW).is_err());
    assert!(c.recipe_bulk_edit(&ids(&["g1"]), &[folder(Some(&"x".repeat(60)))], true, NOW).is_ok());
}

#[test]
fn tag_adds_once_ignoring_case_in_the_spelling_in_view_and_untag_ignores_case() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "g1", None, &["Finals", "Kids"]);
    game(&c, "g2", None, &[]);
    let r = c.recipe_bulk_edit(&ids(&["g1", "g2"]), &[tag("finals")], true, NOW).unwrap();
    assert_eq!(r.unchanged, ids(&["g1"]));
    assert_eq!(get(&c, "g2").tags, ["Finals"]);
    c.recipe_bulk_edit(&ids(&["g1", "g2"]), &[untag("FINALS")], true, NOW).unwrap();
    assert_eq!(get(&c, "g1").tags, ["Kids"]);
    assert!(get(&c, "g2").tags.is_empty());
}

#[test]
fn a_full_game_refuses_the_batch_whole() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let twenty: Vec<String> = (0..20).map(|i| format!("t{i}")).collect();
    let refs: Vec<&str> = twenty.iter().map(String::as_str).collect();
    game(&c, "full", None, &refs);
    game(&c, "ok", None, &[]);
    assert!(c.recipe_bulk_edit(&ids(&["ok", "full"]), &[tag("new")], true, NOW).is_err());
    assert!(get(&c, "ok").tags.is_empty(), "refused whole");
    assert!(c.recipe_bulk_edit(&ids(&["ok"]), &[tag(" ")], true, NOW).is_err());
    assert!(c.recipe_bulk_edit(&ids(&["ok"]), &[tag(&"y".repeat(41))], true, NOW).is_err());
}

#[test]
fn a_rename_is_untag_then_tag_in_one_call_and_a_game_with_both_keeps_one() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "a", None, &["demo"]);
    game(&c, "b", None, &["demo", "showcase"]);
    c.recipe_bulk_edit(&ids(&["a", "b"]), &[untag("demo"), tag("Showcase")], true, NOW).unwrap();
    assert_eq!(get(&c, "a").tags, ["showcase"], "the spelling in view");
    assert_eq!(get(&c, "b").tags, ["showcase"]);
}

#[test]
fn a_preview_writes_nothing_a_missing_game_refuses_whole_and_nothing_selected_is_refused() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "g1", None, &[]);
    let rev = get(&c, "g1").rev;
    let preview = c.recipe_bulk_edit(&ids(&["g1", "g1"]), &[folder(Some("F"))], false, NOW).unwrap();
    assert_eq!(preview.changed, ids(&["g1"]), "a repeated id counts once");
    assert_eq!(get(&c, "g1").folder, None);
    assert_eq!(get(&c, "g1").rev, rev);
    assert!(c.recipe_bulk_edit(&ids(&["g1", "missing"]), &[folder(Some("F"))], true, NOW).is_err());
    assert_eq!(get(&c, "g1").folder, None);
    assert!(c.recipe_bulk_edit(&[], &[folder(Some("F"))], true, NOW).is_err());
}

#[test]
fn search_finds_a_game_by_its_new_folder_and_tag() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    game(&c, "g1", None, &[]);
    c.recipe_bulk_edit(&ids(&["g1"]), &[folder(Some("Semifinals")), tag("Juniors")], true, NOW).unwrap();
    for text in ["Semifinals", "Juniors"] {
        let hits = c
            .catalog_search(&SearchQuery { text: text.into(), kinds: vec![CatalogKind::Recipe], scope: ArchiveScope::Active, limit: 10 })
            .unwrap();
        assert!(hits.iter().any(|h| h.id == "g1"), "{text}");
    }
}

#[test]
fn a_recipe_write_refuses_labels_the_editor_could_not_have_made() {
    let c = CatalogService::open(CatalogLocation::Memory).unwrap();
    let mut r = Recipe::new("g", "Game", GameSettings::default());
    r.tags = vec!["a".into(), "A".into()];
    assert!(c.recipe_upsert(&r, NOW).is_err());
    r.tags = vec![];
    r.folder = Some("  ".into());
    assert!(c.recipe_upsert(&r, NOW).is_err());
}

// ------------------------------------------------------------ import overrides

mod import {
    use super::NOW;
    use questiongame_host::catalog::{
        ArchiveScope, CatalogKind, CatalogLocation, CatalogService, ImportOverrides, RowStatus,
    };
    use serde_json::json;

    const FILE: &str = r#"{ "format": "questiongame.questions", "version": 1, "questions": [
        { "question": "Capital of Australia?", "options": [ { "text": "Canberra", "correct": true }, "Sydney" ], "difficulty": 40, "tags": ["Capitals"], "domains": ["Geography"] },
        { "question": "Capital of France?", "options": [ { "text": "Paris", "correct": true }, "Lyon" ] },
        { "question": "Capital of France?", "options": [ { "text": "Paris", "correct": true }, "Lyon" ] }
    ] }"#;

    fn stems(c: &CatalogService) -> Vec<String> {
        let mut out: Vec<String> = c
            .catalog_list(CatalogKind::Question, ArchiveScope::Active)
            .unwrap()
            .into_iter()
            .filter_map(|i| i.as_question().map(|q| q.stem.clone()))
            .collect();
        out.sort();
        out
    }

    #[test]
    fn a_row_carries_its_body_as_read_and_a_duplicate_keeps_its_tags_and_domains() {
        let c = CatalogService::open(CatalogLocation::Memory).unwrap();
        let (report, _) = c.import_questions(FILE, false, None, NOW).unwrap();
        let body = report.rows[0].body.as_ref().unwrap();
        assert_eq!(body.question, "Capital of Australia?");
        assert_eq!(body.options.len(), 2);
        assert!(body.options[0].correct);
        assert_eq!(body.difficulty, Some(40));
        assert_eq!(body.domains, ["Geography"]);
        assert_eq!(body.tags, ["Capitals"]);
        assert_eq!(report.rows[2].status, RowStatus::Duplicate);
        assert!(report.rows[2].body.is_some());
    }

    #[test]
    fn an_edit_replaces_the_row_before_it_is_read_and_the_import_writes_the_edit() {
        let c = CatalogService::open(CatalogLocation::Memory).unwrap();
        let mut overrides = ImportOverrides::default();
        overrides.edits.insert(
            2,
            json!({ "question": "Capital of Germany?", "options": [ { "text": "Berlin", "correct": true }, "Bonn" ], "difficulty": 30 }),
        );
        let (preview, _) = c.import_questions_with(FILE, false, None, &overrides, NOW).unwrap();
        assert_eq!(preview.rows[1].stem, "Capital of Germany?");
        assert!(preview.rows[1].edited);
        assert_eq!(preview.rows[2].status, RowStatus::Incomplete, "row 3 no longer repeats row 2");
        c.import_questions_with(FILE, true, None, &overrides, NOW).unwrap();
        assert_eq!(stems(&c), ["Capital of Australia?", "Capital of France?", "Capital of Germany?"]);
    }

    #[test]
    fn a_skipped_row_is_reported_never_written_and_never_a_duplicates_original() {
        let c = CatalogService::open(CatalogLocation::Memory).unwrap();
        let mut overrides = ImportOverrides::default();
        overrides.skip.insert(2);
        let (preview, _) = c.import_questions_with(FILE, false, None, &overrides, NOW).unwrap();
        assert!(preview.rows[1].skipped);
        assert_eq!(preview.rows[2].status, RowStatus::Incomplete, "row 3 is no duplicate of a skipped row");
        assert_eq!(preview.counts.skipped, 1);
        assert_eq!(preview.counts.complete + preview.counts.incomplete, 2);
        c.import_questions_with(FILE, true, None, &overrides, NOW).unwrap();
        assert_eq!(stems(&c), ["Capital of Australia?", "Capital of France?"]);
    }

    #[test]
    fn an_override_for_a_row_that_is_not_in_the_file_refuses_the_import_whole() {
        let c = CatalogService::open(CatalogLocation::Memory).unwrap();
        let mut overrides = ImportOverrides::default();
        overrides.skip.insert(4);
        assert!(c.import_questions_with(FILE, true, None, &overrides, NOW).is_err());
        let mut overrides = ImportOverrides::default();
        overrides.edits.insert(0, json!({ "question": "Q?" }));
        assert!(c.import_questions_with(FILE, true, None, &overrides, NOW).is_err());
        assert!(stems(&c).is_empty());
    }
}
