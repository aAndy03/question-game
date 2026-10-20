//! Copy, move and share between workspaces (Beta 2.0): what comes along, what
//! is reused, what refuses — and that a refusal changes nothing.

use questiongame_host::catalog::{
    ArchiveScope, Asset, CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo, Domain,
    DomainMember, Question, QuestionOption, Recipe, SeedMode, Selection, Team, TransferOp,
};
use questiongame_host::flags::{FlagService, GameSettings};
use questiongame_host::catalog::BoardDomain;
use questiongame_host::{AssetId, DomainId, MatchService, PlayId, QuestionId, RecipeId, TeamId, WorkspaceId};

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str, difficulty: u8, shared: bool) -> CatalogItem {
    let mut q = Question::new(id, format!("Question {id}"), difficulty);
    q.options = vec![QuestionOption::new(format!("{id}-a"), "Yes", true), QuestionOption::new(format!("{id}-b"), "No", false)];
    q.stamps.shared = shared;
    CatalogItem::Question(Box::new(q))
}
fn domain(id: &str, questions: &[&str], shared: bool) -> CatalogItem {
    let mut d = Domain::new(id, id, "DOM");
    d.questions = questions.iter().enumerate().map(|(i, q)| DomainMember { question_id: QuestionId::from(*q), sort_key: i as i64 }).collect();
    d.stamps.shared = shared;
    CatalogItem::Domain(Box::new(d))
}
fn team(id: &str, shared: bool) -> CatalogItem {
    let mut t = Team::new(id, id, "TM");
    t.stamps.shared = shared;
    CatalogItem::Team(Box::new(t))
}
fn ids(catalog: &CatalogService, kind: CatalogKind) -> Vec<String> {
    let mut v: Vec<String> = catalog.catalog_list(kind, ArchiveScope::All).unwrap().iter().map(|i| i.id()).collect();
    v.sort();
    v
}
fn get(catalog: &CatalogService, kind: CatalogKind, id: &str) -> CatalogItem {
    catalog.catalog_get(kind, id).unwrap()
}
fn domains(list: &[&str]) -> Selection {
    Selection { domains: list.iter().map(|d| DomainId::from(*d)).collect(), ..Selection::default() }
}

/// Workspace A (current) with a local domain of two questions, a shared
/// question in it, and a game; workspace B empty.
fn setup() -> (CatalogService, WorkspaceId, WorkspaceId) {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    let a = catalog.current_workspace();
    catalog.workspace_rename(&a, "A", NOW).unwrap();
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    for item in [question("q1", 10, false), question("q2", 20, false), question("qs", 30, true), team("t1", false), team("t2", false)] {
        catalog.catalog_upsert(&item, NOW).unwrap();
    }
    catalog.catalog_upsert(&domain("d1", &["q1", "q2", "qs"], false), NOW).unwrap();
    let mut game = Recipe::new("g1", "Game One", GameSettings::default());
    game.teams = vec![TeamId::from("t1"), TeamId::from("t2")];
    game.board = vec![BoardDomain { domain_id: DomainId::from("d1"), question_ids: vec![QuestionId::from("q1"), QuestionId::from("q2"), QuestionId::from("qs")] }];
    catalog.recipe_upsert(&game, NOW).unwrap();
    (catalog, a, b)
}

/// Every row of every table, as text — what "nothing changed" is checked by.
fn dump(catalog: &CatalogService) -> String {
    let (workspaces, groups) = catalog.workspace_list().unwrap();
    let mut out = format!("{workspaces:?}{groups:?}");
    for kind in [CatalogKind::Team, CatalogKind::Domain, CatalogKind::Question, CatalogKind::Asset] {
        out.push_str(&format!("{:?}", catalog.catalog_list(kind, ArchiveScope::All).unwrap()));
    }
    out.push_str(&format!("{:?}", catalog.recipe_list(ArchiveScope::All).unwrap()));
    out.push_str(&format!("{:?}", catalog.play_list(None).unwrap()));
    out
}

#[test]
fn copying_a_domain_brings_its_local_questions_and_keeps_shared_ones_shared() {
    let (catalog, _a, b) = setup();
    let report = catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    assert_eq!(report.created.iter().filter(|t| t.kind == CatalogKind::Question).count(), 2);
    assert!(report.created.iter().any(|t| t.kind == CatalogKind::Domain && t.picked));
    assert!(report.created.iter().filter(|t| t.kind == CatalogKind::Question).all(|t| !t.picked), "they came along");
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d1"], "the original stays");

    catalog.workspace_switch(&b).unwrap();
    let copied = ids(&catalog, CatalogKind::Domain);
    assert_eq!(copied.len(), 1);
    let CatalogItem::Domain(d) = get(&catalog, CatalogKind::Domain, &copied[0]) else { panic!() };
    assert_eq!(d.questions.len(), 3);
    assert!(d.questions.iter().any(|m| m.question_id.as_str() == "qs"), "the shared question is referenced, not copied");
    assert!(!d.questions.iter().any(|m| m.question_id.as_str() == "q1"), "a local one is a new row");
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 3, "two copies and the shared one");
}

#[test]
fn copying_a_game_makes_it_work_in_the_target() {
    let (catalog, _a, b) = setup();
    let report = catalog
        .catalog_copy_to(&Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() }, &b, NOW)
        .unwrap();
    let game = report.created.iter().find(|t| t.kind == CatalogKind::Recipe).unwrap().id.clone();
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Team).len(), 2, "the roster came along");
    let mut flags = FlagService::default();
    flags.load_recipe(GameSettings::default()).unwrap();
    catalog
        .build_snapshot(&RecipeId::from(game.as_str()), PlayId::from("p"), flags.freeze().unwrap())
        .expect("the copy plays in its new workspace");
}

#[test]
fn copying_a_second_domain_that_shares_a_question_reuses_the_first_copy() {
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&domain("d2", &["q1"], false), NOW).unwrap();
    catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    let report = catalog.catalog_copy_to(&domains(&["d2"]), &b, NOW).unwrap();
    assert_eq!(report.reused.len(), 1, "{report:?}");
    assert_eq!(report.reused[0].from, "q1");
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 3, "q1 is not copied twice");
}

#[test]
fn a_picked_row_is_always_new_and_an_archived_earlier_copy_is_not_reused() {
    let (catalog, a, b) = setup();
    catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    let again = catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    assert!(again.created.iter().any(|t| t.kind == CatalogKind::Domain), "the picked domain is new again");
    assert_eq!(again.reused.len(), 2, "its questions are reused");

    catalog.workspace_switch(&b).unwrap();
    for id in ids(&catalog, CatalogKind::Question).into_iter().filter(|q| q != "qs") {
        catalog.catalog_archive(CatalogKind::Question, &id, NOW).unwrap();
    }
    catalog.workspace_switch(&a).unwrap();
    let third = catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    assert!(third.reused.is_empty(), "archived copies are not reused: {third:?}");
}

#[test]
fn copy_refuses_this_workspace_and_an_archived_one() {
    let (catalog, a, b) = setup();
    assert!(catalog.catalog_copy_to(&domains(&["d1"]), &a, NOW).is_err());
    let c = catalog.workspace_create("C", None, NOW).unwrap().id;
    catalog.workspace_archive(&c, NOW).unwrap();
    assert!(catalog.catalog_copy_to(&domains(&["d1"]), &c, NOW).is_err());
    let _ = b;
}

#[test]
fn copies_join_one_family_across_siblings_and_copies_of_copies() {
    let (catalog, a, b) = setup();
    let c = catalog.workspace_create("C", None, NOW).unwrap().id;
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from("q1")], ..Selection::default() }, &b, NOW).unwrap();
    catalog.workspace_switch(&b).unwrap();
    let in_b = ids(&catalog, CatalogKind::Question).into_iter().find(|q| q != "qs").unwrap();
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from(in_b.as_str())], ..Selection::default() }, &c, NOW).unwrap();
    catalog.workspace_switch(&c).unwrap();
    let in_c = ids(&catalog, CatalogKind::Question).into_iter().find(|q| q != "qs").unwrap();
    let family = |catalog: &CatalogService, id: &str| get(catalog, CatalogKind::Question, id).stamps().family_id;
    let fc = family(&catalog, &in_c);
    catalog.workspace_switch(&a).unwrap();
    assert!(fc.is_some());
    assert_eq!(family(&catalog, "q1"), fc);
}

#[test]
fn moving_a_domain_moves_its_questions() {
    let (catalog, _a, b) = setup();
    catalog.recipe_archive(&RecipeId::from("g1"), NOW).unwrap();
    // The game still uses them, archived or not: a restored game would break.
    assert!(matches!(catalog.catalog_move_to(&domains(&["d1"]), &b, NOW), Err(CatalogError::StillUsed { .. })));

    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&domain("d2", &["qs"], false), NOW).unwrap();
    let report = catalog.catalog_move_to(&domains(&["d2"]), &b, NOW).unwrap();
    assert_eq!(report.moved.len(), 1, "a shared question is not moved");
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d1"]);
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d2"], "the same id, another workspace");
}

#[test]
fn moving_is_refused_while_something_staying_uses_a_row_and_names_it() {
    let (catalog, _a, b) = setup();
    let before = dump(&catalog);
    let preview = catalog.transfer_preview(TransferOp::Move, &domains(&["d1"]), Some(&b)).unwrap();
    assert!(preview.refused.iter().any(|r| r.used_by == "game Game One"), "{preview:?}");
    match catalog.catalog_move_to(&domains(&["d1"]), &b, NOW) {
        Err(CatalogError::StillUsed { used_by, .. }) => assert!(used_by.contains("game Game One")),
        other => panic!("{other:?}"),
    }
    assert_eq!(dump(&catalog), before, "a refusal changes nothing");
}

#[test]
fn moving_a_game_carries_its_rows_and_its_plays() {
    let (catalog, a, b) = setup();
    let mut flags = FlagService::default();
    flags.load_recipe(GameSettings::default()).unwrap();
    let snapshot = catalog.build_snapshot(&RecipeId::from("g1"), PlayId::from("p1"), flags.freeze().unwrap()).unwrap();
    let mut play = MatchService::new();
    play.play_load(snapshot, 0).unwrap();
    play.play_start(0).unwrap();
    catalog.play_persist(play.get_state().unwrap()).unwrap();

    let report = catalog.catalog_move_to(&Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() }, &b, NOW).unwrap();
    assert_eq!(report.moved.len(), 6, "the game, two teams, the domain and two local questions: {report:?}");
    assert!(catalog.play_list(None).unwrap().is_empty());
    assert!(ids(&catalog, CatalogKind::Team).is_empty());
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(catalog.play_list(None).unwrap().len(), 1, "its Plays went with it");
    let _ = a;
}

#[test]
fn make_shared_takes_a_domains_questions_and_a_teams_asset_along() {
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&CatalogItem::Asset(Box::new(Asset::new("logo", "logos/x.png", "image"))), NOW).unwrap();
    let CatalogItem::Team(mut t) = get(&catalog, CatalogKind::Team, "t1") else { panic!() };
    t.logo_asset_id = Some(AssetId::from("logo"));
    catalog.catalog_upsert(&CatalogItem::Team(t), NOW).unwrap();

    let report = catalog
        .catalog_make_shared(&Selection { domains: vec![DomainId::from("d1")], teams: vec![TeamId::from("t1")], ..Selection::default() }, NOW)
        .unwrap();
    assert_eq!(report.moved.len(), 5, "domain, two questions, team, asset: {report:?}");
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d1"], "B sees it now");
    assert!(get(&catalog, CatalogKind::Asset, "logo").is_shared());
    assert!(catalog
        .catalog_make_shared(&Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() }, NOW)
        .is_err(), "a game is never shared");
}

#[test]
fn make_local_is_refused_while_another_workspace_uses_it() {
    let (catalog, a, b) = setup();
    catalog.workspace_switch(&b).unwrap();
    // B's own domain uses the shared question.
    catalog.catalog_upsert(&domain("db", &["qs"], false), NOW).unwrap();
    catalog.workspace_switch(&a).unwrap();
    let pick = Selection { questions: vec![QuestionId::from("qs")], ..Selection::default() };
    match catalog.catalog_make_local(&pick, NOW) {
        Err(CatalogError::StillUsed { used_by, .. }) => assert!(used_by.contains("domain db in workspace B"), "{used_by}"),
        other => panic!("{other:?}"),
    }
    catalog.workspace_switch(&b).unwrap();
    catalog.catalog_upsert(&domain("db", &[], false), NOW).unwrap();
    catalog.workspace_switch(&a).unwrap();
    catalog.catalog_make_local(&pick, NOW).unwrap();
    assert!(!get(&catalog, CatalogKind::Question, "qs").is_shared());
    catalog.workspace_switch(&b).unwrap();
    assert!(catalog.catalog_get(CatalogKind::Question, "qs").is_err(), "B no longer sees it");
}

#[test]
fn a_shared_question_in_a_shared_domain_cannot_become_local() {
    let (catalog, _a, _b) = setup();
    catalog.catalog_upsert(&domain("ds", &["qs"], true), NOW).unwrap();
    let report = catalog
        .transfer_preview(TransferOp::MakeLocal, &Selection { questions: vec![QuestionId::from("qs")], ..Selection::default() }, None)
        .unwrap();
    assert!(report.refused.iter().any(|r| r.used_by == "domain ds (shared)"), "{report:?}");
}

#[test]
fn a_preview_writes_nothing_and_matches_the_write() {
    let (catalog, _a, b) = setup();
    let before = dump(&catalog);
    let preview = catalog.transfer_preview(TransferOp::Copy, &domains(&["d1"]), Some(&b)).unwrap();
    assert_eq!(dump(&catalog), before);
    let done = catalog.catalog_copy_to(&domains(&["d1"]), &b, NOW).unwrap();
    assert_eq!(preview.created.len(), done.created.len());
    assert_eq!(preview.reused, done.reused);
}

#[test]
fn the_demo_can_be_copied_whole_into_another_workspace() {
    let (catalog, _a, b) = setup();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let report = catalog
        .catalog_copy_to(&Selection { recipes: vec![RecipeId::from("seed-recipe-demo")], ..Selection::default() }, &b, NOW)
        .unwrap();
    assert!(report.refused.is_empty());
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(catalog.recipe_list(ArchiveScope::All).unwrap().len(), 1);
}

// ------------------------------------------------------- review (Opus, P14)

#[test]
fn a_reused_domain_does_not_leave_its_new_questions_behind_in_no_domain() {
    let (catalog, _a, b) = setup();
    let game = Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() };
    catalog.catalog_copy_to(&game, &b, NOW).unwrap();
    catalog.catalog_upsert(&question("q3", 40, false), NOW).unwrap();
    let CatalogItem::Domain(mut d1) = get(&catalog, CatalogKind::Domain, "d1") else { panic!() };
    d1.questions.push(DomainMember { question_id: QuestionId::from("q3"), sort_key: 9 });
    catalog.catalog_upsert(&CatalogItem::Domain(d1), NOW).unwrap();

    let again = catalog.catalog_copy_to(&game, &b, NOW).unwrap();
    assert!(again.reused.iter().any(|t| t.kind == CatalogKind::Domain), "{again:?}");
    assert!(!again.created.iter().any(|t| t.from == "q3"), "q3 would land in no domain: {again:?}");
}

#[test]
fn a_picked_shared_row_a_move_cannot_take_is_reported_unchanged() {
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&domain("ds", &["qs"], true), NOW).unwrap();
    let report = catalog.catalog_move_to(&domains(&["ds"]), &b, NOW).unwrap();
    assert!(report.moved.is_empty());
    assert_eq!(report.unchanged.len(), 1, "{report:?}");
    let shared = catalog.catalog_make_shared(&domains(&["ds"]), NOW).unwrap();
    assert_eq!(shared.unchanged.len(), 1, "already shared");
}
