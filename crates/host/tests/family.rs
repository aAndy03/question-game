//! Families of copies and edits that follow them (Beta 2.0).

use questiongame_host::catalog::{CopyOptions, 
    ArchiveScope, BoardDomain, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Domain, DomainMember,
    Question, QuestionOption, Recipe, Selection,
};
use questiongame_host::flags::GameSettings;
use questiongame_host::{DomainId, QuestionId, WorkspaceId};

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str, difficulty: u8) -> Question {
    let mut q = Question::new(id, format!("Question {id}"), difficulty);
    q.options = vec![QuestionOption::new(format!("{id}-a"), "Yes", true), QuestionOption::new(format!("{id}-b"), "No", false)];
    q
}
fn domain(id: &str, questions: &[&str]) -> Domain {
    let mut d = Domain::new(id, id, "DOM");
    d.questions = questions.iter().enumerate().map(|(i, q)| DomainMember { question_id: QuestionId::from(*q), sort_key: i as i64, group_id: None }).collect();
    d
}
fn get_question(catalog: &CatalogService, id: &str) -> Question {
    match catalog.catalog_get(CatalogKind::Question, id).unwrap() {
        CatalogItem::Question(q) => *q,
        other => panic!("{other:?}"),
    }
}
fn get_domain(catalog: &CatalogService, id: &str) -> Domain {
    match catalog.catalog_get(CatalogKind::Domain, id).unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    }
}
fn only(catalog: &CatalogService, kind: CatalogKind) -> String {
    let ids: Vec<String> = catalog.catalog_list(kind, ArchiveScope::All).unwrap().iter().map(|i| i.id()).collect();
    assert_eq!(ids.len(), 1, "{ids:?}");
    ids[0].clone()
}

/// A holds d1 = {q1 (10), q2 (20)}; B holds a copy of d1.
fn setup() -> (CatalogService, WorkspaceId, WorkspaceId) {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    let a = catalog.current_workspace();
    catalog.workspace_rename(&a, "A", NOW).unwrap();
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    catalog.catalog_upsert(&question("q1", 10).into(), NOW).unwrap();
    catalog.catalog_upsert(&question("q2", 20).into(), NOW).unwrap();
    catalog.catalog_upsert(&domain("d1", &["q1", "q2"]).into(), NOW).unwrap();
    catalog
        .catalog_copy_to(&Selection { domains: vec![DomainId::from("d1")], ..Selection::default() }, &b, CopyOptions::default(), NOW)
        .unwrap();
    (catalog, a, b)
}

/// The copy of q1 in B.
fn copy_of_q1(catalog: &CatalogService, a: &WorkspaceId, b: &WorkspaceId) -> String {
    catalog.workspace_switch(b).unwrap();
    let d = get_domain(catalog, &only(catalog, CatalogKind::Domain));
    let first = d.questions[0].question_id.to_string();
    catalog.workspace_switch(a).unwrap();
    first
}

#[test]
fn an_edit_can_follow_its_copies_and_save_here_only_touches_nothing_else() {
    let (catalog, a, b) = setup();
    let copy = copy_of_q1(&catalog, &a, &b);
    let mut edited = question("q1", 10);
    edited.stem = "Edited once".into();
    catalog.catalog_upsert(&edited.clone().into(), NOW).unwrap();
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(get_question(&catalog, &copy).stem, "Question q1", "save here only");
    catalog.workspace_switch(&a).unwrap();

    let preview = catalog.propagation_preview(&edited.clone().into()).unwrap();
    assert_eq!(preview.update.len(), 1);
    assert_eq!(preview.update[0].workspace_name.as_deref(), Some("B"));
    edited.stem = "Edited twice".into();
    let (_, done) = catalog.catalog_upsert_propagating(&edited.into(), NOW).unwrap();
    assert_eq!(done.update.len(), 1);
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(get_question(&catalog, &copy).stem, "Edited twice");
}

#[test]
fn propagation_carries_the_body_and_never_membership_or_archive_state() {
    let (catalog, a, b) = setup();
    catalog.workspace_switch(&b).unwrap();
    let copy = only(&catalog, CatalogKind::Domain);
    let mut theirs = get_domain(&catalog, &copy);
    theirs.questions.truncate(1);
    catalog.catalog_upsert(&theirs.into(), NOW).unwrap();
    catalog.catalog_archive(CatalogKind::Domain, &copy, NOW).unwrap();
    catalog.workspace_switch(&a).unwrap();

    let mut mine = get_domain(&catalog, "d1");
    mine.name = "Renamed".into();
    mine.description = Some("New words".into());
    let (_, done) = catalog.catalog_upsert_propagating(&mine.into(), NOW).unwrap();
    assert!(done.update[0].archived, "archived copies are updated too");

    catalog.workspace_switch(&b).unwrap();
    let after = get_domain(&catalog, &copy);
    assert_eq!(after.name, "Renamed");
    assert_eq!(after.description.as_deref(), Some("New words"));
    assert_eq!(after.questions.len(), 1, "membership is the copy's own");
    assert!(after.stamps.is_archived(), "and so is its archive state");
}

#[test]
fn a_copy_whose_board_would_break_is_skipped_and_named() {
    let (catalog, a, b) = setup();
    catalog.workspace_switch(&b).unwrap();
    let d = get_domain(&catalog, &only(&catalog, CatalogKind::Domain));
    let mut game = Recipe::new("gb", "B's game", GameSettings::default());
    game.board = vec![BoardDomain {
        domain_id: d.id.clone(),
        question_ids: d.questions.iter().map(|m| m.question_id.clone()).collect(),
    }];
    catalog.recipe_upsert(&game, NOW).unwrap();
    catalog.workspace_switch(&a).unwrap();

    // In A, q1 is on no board; in B its copy sits beside q2's copy at 20.
    let mut edited = question("q1", 20);
    edited.stem = "Now twenty".into();
    let preview = catalog.propagation_preview(&edited.clone().into()).unwrap();
    assert!(preview.update.is_empty());
    assert_eq!(preview.skipped.len(), 1);
    assert!(preview.skipped[0].reason.starts_with("on the board of B's game"), "{}", preview.skipped[0].reason);
    catalog.catalog_upsert_propagating(&edited.into(), NOW).unwrap();
    assert_eq!(get_question(&catalog, "q1").difficulty, Some(20), "the save itself happens");
    let copy = copy_of_q1(&catalog, &a, &b);
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(get_question(&catalog, &copy).difficulty, Some(10), "the copy is left as it was");
}

#[test]
fn a_family_spans_copies_of_copies_and_unfollow_leaves_it() {
    let (catalog, a, b) = setup();
    let c = catalog.workspace_create("C", None, NOW).unwrap().id;
    catalog.workspace_switch(&b).unwrap();
    let in_b = only(&catalog, CatalogKind::Domain);
    catalog
        .catalog_copy_to(&Selection { domains: vec![DomainId::from(in_b.as_str())], ..Selection::default() }, &c, CopyOptions::default(), NOW)
        .unwrap();
    catalog.workspace_switch(&a).unwrap();
    let mine = get_domain(&catalog, "d1");
    let preview = catalog.propagation_preview(&mine.clone().into()).unwrap();
    let mut names: Vec<_> = preview.update.iter().filter_map(|c| c.workspace_name.clone()).collect();
    names.sort();
    assert_eq!(names, ["B", "C"], "the copy of the copy is family too");

    catalog.catalog_unfollow(CatalogKind::Domain, "d1").unwrap();
    assert!(catalog.propagation_preview(&mine.into()).unwrap().update.is_empty());
    catalog.workspace_switch(&b).unwrap();
    let theirs = get_domain(&catalog, &in_b);
    let preview = catalog.propagation_preview(&theirs.into()).unwrap();
    assert_eq!(preview.update.len(), 1, "B and C stay one family without A");
}

#[test]
fn a_row_never_copied_has_no_one_to_update() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&question("alone", 10).into(), NOW).unwrap();
    let preview = catalog.propagation_preview(&question("alone", 10).into()).unwrap();
    assert!(preview.update.is_empty() && preview.skipped.is_empty());
}

// ------------------------------------------------------- review (Opus, P14)

use questiongame_host::catalog::{Asset, Team, TransferOp};
use questiongame_host::{AssetId, TeamId};

fn asset(id: &str) -> CatalogItem {
    CatalogItem::Asset(Box::new(Asset::new(id, format!("media/{id}.png"), "image")))
}

#[test]
fn a_changed_asset_follows_to_the_copy_as_the_copys_own() {
    let (catalog, a, b) = setup();
    catalog.catalog_upsert(&asset("a1"), NOW).unwrap();
    catalog.catalog_upsert(&asset("a2"), NOW).unwrap();
    let mut q = question("qm", 30);
    q.media_asset_id = Some(AssetId::from("a1"));
    catalog.catalog_upsert(&q.clone().into(), NOW).unwrap();
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from("qm")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    // a2 has its own copy in B too.
    let mut holder = question("holder", 40);
    holder.media_asset_id = Some(AssetId::from("a2"));
    catalog.catalog_upsert(&holder.into(), NOW).unwrap();
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from("holder")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();

    q.media_asset_id = Some(AssetId::from("a2"));
    catalog.catalog_upsert_propagating(&q.into(), NOW).unwrap();

    catalog.workspace_switch(&b).unwrap();
    let in_b: Vec<Question> = catalog
        .catalog_list(CatalogKind::Question, ArchiveScope::All)
        .unwrap()
        .into_iter()
        .filter_map(|i| match i { CatalogItem::Question(q) => Some(*q), _ => None })
        .collect();
    let copy = in_b.iter().find(|q| q.stem == "Question qm").unwrap();
    let holder_copy = in_b.iter().find(|q| q.stem == "Question holder").unwrap();
    assert_eq!(copy.media_asset_id, holder_copy.media_asset_id, "a2's copy in B, not a1's");
    let _ = a;
}

#[test]
fn a_copy_keeps_its_workspaces_asset_and_the_preview_matches_the_save() {
    let (catalog, a, b) = setup();
    catalog.catalog_upsert(&asset("logo"), NOW).unwrap();
    let mut t = Team::new("t1", "Lions", "LIO");
    t.logo_asset_id = Some(AssetId::from("logo"));
    catalog.catalog_upsert(&CatalogItem::Team(Box::new(t.clone())), NOW).unwrap();
    catalog.catalog_copy_to(&Selection { teams: vec![TeamId::from("t1")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    catalog.workspace_switch(&b).unwrap();
    let copy = only(&catalog, CatalogKind::Team);
    catalog.workspace_switch(&a).unwrap();

    t.name = "Lions FC".into();
    let preview = catalog.propagation_preview(&CatalogItem::Team(Box::new(t.clone()))).unwrap();
    assert_eq!(preview.update.len(), 1);
    catalog.catalog_upsert_propagating(&CatalogItem::Team(Box::new(t)), NOW).expect("the save the preview promised");
    catalog.workspace_switch(&b).unwrap();
    let CatalogItem::Team(updated) = catalog.catalog_get(CatalogKind::Team, &copy).unwrap() else { panic!() };
    assert_eq!(updated.name, "Lions FC");
    assert_ne!(updated.logo_asset_id.as_ref().map(|a| a.as_str()), Some("logo"), "B's own asset, not A's");
    let _ = TransferOp::Copy;
}

#[test]
fn a_copy_on_another_workspaces_board_is_skipped_when_it_would_break_it() {
    let (catalog, a, b) = setup();
    // q1's copy and q2's copy in B, both on B's board.
    catalog.workspace_switch(&b).unwrap();
    let d = get_domain(&catalog, &only(&catalog, CatalogKind::Domain));
    let ids: Vec<QuestionId> = d.questions.iter().map(|m| m.question_id.clone()).collect();
    let mut game = Recipe::new("gb", "B's game", GameSettings::default());
    game.board = vec![BoardDomain { domain_id: d.id.clone(), question_ids: ids.clone() }];
    catalog.recipe_upsert(&game, NOW).unwrap();
    catalog.workspace_switch(&a).unwrap();

    let mut edited = question("q1", 20);
    edited.stem = "Now twenty".into();
    let preview = catalog.propagation_preview(&edited.into()).unwrap();
    assert!(preview.update.is_empty(), "{preview:?}");
    assert_eq!(preview.skipped.len(), 1);
}
