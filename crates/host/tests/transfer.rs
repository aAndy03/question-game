//! Copy and move between workspaces (Beta 2.0; no shared library since
//! beta.2): what comes along, what is reused, what refuses — and that a
//! refusal changes nothing.

use questiongame_host::catalog::{CopyOptions, 
    ArchiveScope, CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo, Domain,
    DomainMember, Question, QuestionOption, Recipe, SeedMode, Selection, Team, TransferOp,
};
use questiongame_host::flags::{FlagService, GameSettings};
use questiongame_host::catalog::BoardDomain;
use questiongame_host::{DomainId, MatchService, PlayId, QuestionId, RecipeId, TeamId, WorkspaceId};

const NOW: u64 = 1_790_000_000_000;

fn question(id: &str, difficulty: u8) -> CatalogItem {
    let mut q = Question::new(id, format!("Question {id}"), difficulty);
    q.options = vec![QuestionOption::new(format!("{id}-a"), "Yes", true), QuestionOption::new(format!("{id}-b"), "No", false)];
    CatalogItem::Question(Box::new(q))
}
fn domain(id: &str, questions: &[&str]) -> CatalogItem {
    let mut d = Domain::new(id, id, "DOM");
    d.questions = questions.iter().enumerate().map(|(i, q)| DomainMember { question_id: QuestionId::from(*q), sort_key: i as i64, group_id: None }).collect();
    CatalogItem::Domain(Box::new(d))
}
fn team(id: &str) -> CatalogItem {
    CatalogItem::Team(Box::new(Team::new(id, id, "TM")))
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

/// Workspace A (current) with a domain of three questions and a game;
/// workspace B empty.
fn setup() -> (CatalogService, WorkspaceId, WorkspaceId) {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    let a = catalog.current_workspace();
    catalog.workspace_rename(&a, "A", NOW).unwrap();
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    for item in [question("q1", 10), question("q2", 20), question("qs", 30), team("t1"), team("t2")] {
        catalog.catalog_upsert(&item, NOW).unwrap();
    }
    catalog.catalog_upsert(&domain("d1", &["q1", "q2", "qs"]), NOW).unwrap();
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
fn copying_a_domain_brings_its_questions_as_new_rows() {
    let (catalog, _a, b) = setup();
    let report = catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    assert_eq!(report.created.iter().filter(|t| t.kind == CatalogKind::Question).count(), 3);
    assert!(report.created.iter().any(|t| t.kind == CatalogKind::Domain && t.picked));
    assert!(report.created.iter().filter(|t| t.kind == CatalogKind::Question).all(|t| !t.picked), "they came along");
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d1"], "the original stays");

    catalog.workspace_switch(&b).unwrap();
    let copied = ids(&catalog, CatalogKind::Domain);
    assert_eq!(copied.len(), 1);
    let CatalogItem::Domain(d) = get(&catalog, CatalogKind::Domain, &copied[0]) else { panic!() };
    assert_eq!(d.questions.len(), 3);
    assert!(!d.questions.iter().any(|m| ["q1", "q2", "qs"].contains(&m.question_id.as_str())), "every member is a new row");
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 3, "three copies, B's own");
}

#[test]
fn copying_a_game_makes_it_work_in_the_target() {
    let (catalog, _a, b) = setup();
    let report = catalog
        .catalog_copy_to(&Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() }, &b, CopyOptions::default(), NOW)
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
    catalog.catalog_upsert(&domain("d2", &["q1"]), NOW).unwrap();
    catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    let report = catalog.catalog_copy_to(&domains(&["d2"]), &b, CopyOptions::default(), NOW).unwrap();
    assert_eq!(report.reused.len(), 1, "{report:?}");
    assert_eq!(report.reused[0].from, "q1");
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 3, "q1 is not copied twice");
}

#[test]
fn a_picked_row_is_always_new_and_an_archived_earlier_copy_is_not_reused() {
    let (catalog, a, b) = setup();
    catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    let again = catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    assert!(again.created.iter().any(|t| t.kind == CatalogKind::Domain), "the picked domain is new again");
    assert_eq!(again.reused.len(), 3, "its questions are reused");

    catalog.workspace_switch(&b).unwrap();
    for id in ids(&catalog, CatalogKind::Question) {
        catalog.catalog_archive(CatalogKind::Question, &id, NOW).unwrap();
    }
    catalog.workspace_switch(&a).unwrap();
    let third = catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    assert!(third.reused.is_empty(), "archived copies are not reused: {third:?}");
}

#[test]
fn copy_refuses_this_workspace_and_an_archived_one() {
    let (catalog, a, b) = setup();
    assert!(catalog.catalog_copy_to(&domains(&["d1"]), &a, CopyOptions::default(), NOW).is_err());
    let c = catalog.workspace_create("C", None, NOW).unwrap().id;
    catalog.workspace_archive(&c, NOW).unwrap();
    assert!(catalog.catalog_copy_to(&domains(&["d1"]), &c, CopyOptions::default(), NOW).is_err());
    let _ = b;
}

#[test]
fn copies_join_one_family_across_siblings_and_copies_of_copies() {
    let (catalog, a, b) = setup();
    let c = catalog.workspace_create("C", None, NOW).unwrap().id;
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from("q1")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    catalog.workspace_switch(&b).unwrap();
    let in_b = ids(&catalog, CatalogKind::Question).into_iter().next().unwrap();
    catalog.catalog_copy_to(&Selection { questions: vec![QuestionId::from(in_b.as_str())], ..Selection::default() }, &c, CopyOptions::default(), NOW).unwrap();
    catalog.workspace_switch(&c).unwrap();
    let in_c = ids(&catalog, CatalogKind::Question).into_iter().next().unwrap();
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
    catalog.catalog_upsert(&question("q9", 50), NOW).unwrap();
    catalog.catalog_upsert(&domain("d2", &["q9"]), NOW).unwrap();
    let report = catalog.catalog_move_to(&domains(&["d2"]), &b, NOW).unwrap();
    assert_eq!(report.moved.len(), 2, "the domain and its question");
    assert!(ids(&catalog, CatalogKind::Question).iter().all(|q| q != "q9"));
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d1"]);
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Domain), ["d2"], "the same id, another workspace");
}

#[test]
fn moving_is_refused_while_something_staying_uses_a_row_and_names_it() {
    let (catalog, _a, b) = setup();
    let before = dump(&catalog);
    let preview = catalog.transfer_preview(TransferOp::Move, &domains(&["d1"]), Some(&b), CopyOptions::default()).unwrap();
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
    assert_eq!(report.moved.len(), 7, "the game, two teams, the domain and three questions: {report:?}");
    assert!(catalog.play_list(None).unwrap().is_empty());
    assert!(ids(&catalog, CatalogKind::Team).is_empty());
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(catalog.play_list(None).unwrap().len(), 1, "its Plays went with it");
    let _ = a;
}

#[test]
fn a_preview_writes_nothing_and_matches_the_write() {
    let (catalog, _a, b) = setup();
    let before = dump(&catalog);
    let preview = catalog.transfer_preview(TransferOp::Copy, &domains(&["d1"]), Some(&b), CopyOptions::default()).unwrap();
    assert_eq!(dump(&catalog), before);
    let done = catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    assert_eq!(preview.created.len(), done.created.len());
    assert_eq!(preview.reused, done.reused);
}

#[test]
fn the_demo_can_be_copied_whole_into_another_workspace() {
    let (catalog, _a, b) = setup();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let report = catalog
        .catalog_copy_to(&Selection { recipes: vec![RecipeId::from("seed-recipe-demo")], ..Selection::default() }, &b, CopyOptions::default(), NOW)
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
    catalog.catalog_copy_to(&game, &b, CopyOptions::default(), NOW).unwrap();
    catalog.catalog_upsert(&question("q3", 40), NOW).unwrap();
    let CatalogItem::Domain(mut d1) = get(&catalog, CatalogKind::Domain, "d1") else { panic!() };
    d1.questions.push(DomainMember { question_id: QuestionId::from("q3"), sort_key: 9, group_id: None });
    catalog.catalog_upsert(&CatalogItem::Domain(d1), NOW).unwrap();

    let again = catalog.catalog_copy_to(&game, &b, CopyOptions::default(), NOW).unwrap();
    assert!(again.reused.iter().any(|t| t.kind == CatalogKind::Domain), "{again:?}");
    assert!(!again.created.iter().any(|t| t.from == "q3"), "q3 would land in no domain: {again:?}");
}


// ---------------------------------------------- copy with domains (beta.2)

fn one_question(id: &str) -> Selection {
    Selection { questions: vec![QuestionId::from(id)], ..Selection::default() }
}

#[test]
fn copy_one_question_with_domains_brings_the_domain_row_with_only_that_question() {
    let (catalog, _a, b) = setup();
    // A big domain: 300 questions, one picked.
    let many: Vec<String> = (0..300).map(|i| format!("m{i}")).collect();
    for (i, id) in many.iter().enumerate() {
        catalog.catalog_upsert(&question(id, (i % 100 + 1) as u8), NOW).unwrap();
    }
    let refs: Vec<&str> = many.iter().map(|s| s.as_str()).collect();
    catalog.catalog_upsert(&domain("big", &refs), NOW).unwrap();
    let g = catalog.domain_group_create(&DomainId::from("big"), "Kings", NOW).unwrap();
    let _other = catalog.domain_group_create(&DomainId::from("big"), "Unused", NOW).unwrap();
    let CatalogItem::Domain(mut big) = get(&catalog, CatalogKind::Domain, "big") else { panic!() };
    big.questions[0].group_id = Some(g.id.clone());
    catalog.catalog_upsert(&CatalogItem::Domain(big), NOW).unwrap();

    let report = catalog.catalog_copy_to(&one_question("m0"), &b, CopyOptions::default(), NOW).unwrap();
    assert_eq!(report.created.iter().filter(|t| t.kind == CatalogKind::Question).count(), 1);
    assert!(report.created.iter().any(|t| t.kind == CatalogKind::Domain && t.from == "big"), "{report:?}");
    catalog.workspace_switch(&b).unwrap();
    let copied = ids(&catalog, CatalogKind::Domain);
    let CatalogItem::Domain(d) = get(&catalog, CatalogKind::Domain, &copied[0]) else { panic!() };
    assert_eq!(d.questions.len(), 1, "one member, not 300");
    assert_eq!(d.groups.len(), 1, "only the group the picked question uses");
    assert_eq!(d.questions[0].group_id.as_ref(), Some(&d.groups[0].id));
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 1);
}

#[test]
fn copy_with_domains_joins_an_existing_family_copy_at_the_end_in_no_group() {
    let (catalog, _a, b) = setup();
    catalog.catalog_copy_to(&domains(&["d1"]), &b, CopyOptions::default(), NOW).unwrap();
    catalog.catalog_upsert(&question("q4", 40), NOW).unwrap();
    let CatalogItem::Domain(mut d1) = get(&catalog, CatalogKind::Domain, "d1") else { panic!() };
    d1.questions.push(DomainMember { question_id: QuestionId::from("q4"), sort_key: 9, group_id: None });
    catalog.catalog_upsert(&CatalogItem::Domain(d1), NOW).unwrap();

    let report = catalog.catalog_copy_to(&one_question("q4"), &b, CopyOptions::default(), NOW).unwrap();
    assert_eq!(report.joined.len(), 1, "{report:?}");
    assert!(!report.created.iter().any(|t| t.kind == CatalogKind::Domain));
    catalog.workspace_switch(&b).unwrap();
    let only_domain = ids(&catalog, CatalogKind::Domain);
    assert_eq!(only_domain.len(), 1, "no second copy of d1");
    let CatalogItem::Domain(d) = get(&catalog, CatalogKind::Domain, &only_domain[0]) else { panic!() };
    assert_eq!(d.questions.len(), 4);
    let last = d.questions.iter().max_by_key(|m| m.sort_key).unwrap();
    assert!(last.group_id.is_none());
    assert_eq!(report.created.iter().find(|t| t.kind == CatalogKind::Question).unwrap().id, last.question_id.as_str());
}

#[test]
fn copy_without_domains_lands_in_no_domain_and_the_preview_says_so() {
    let (catalog, _a, b) = setup();
    let off = CopyOptions { with_domains: false };
    let preview = catalog.transfer_preview(TransferOp::Copy, &one_question("q1"), Some(&b), off).unwrap();
    assert!(preview.created.iter().all(|t| t.kind == CatalogKind::Question) && preview.joined.is_empty(), "{preview:?}");
    catalog.catalog_copy_to(&one_question("q1"), &b, off, NOW).unwrap();
    catalog.workspace_switch(&b).unwrap();
    assert!(ids(&catalog, CatalogKind::Domain).is_empty());
    assert_eq!(ids(&catalog, CatalogKind::Question).len(), 1);
}

#[test]
fn copy_with_domains_ignores_an_archived_source_domain() {
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&domain("old", &["q1"]), NOW).unwrap();
    catalog.catalog_archive(CatalogKind::Domain, "old", NOW).unwrap();
    let report = catalog.catalog_copy_to(&one_question("q1"), &b, CopyOptions::default(), NOW).unwrap();
    let domains_made: Vec<_> = report.created.iter().filter(|t| t.kind == CatalogKind::Domain).map(|t| t.from.clone()).collect();
    assert_eq!(domains_made, ["d1"]);
}

#[test]
fn a_copied_game_overlay_shows_the_targets_logo() {
    use questiongame_host::catalog::{Asset, TeamOverlay};
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&CatalogItem::Asset(Box::new(Asset::new("logo", "logo.png", "image"))), NOW).unwrap();
    let mut game = catalog.recipe_get(&RecipeId::from("g1")).unwrap();
    game.overlays.teams.insert(TeamId::from("t1"), TeamOverlay { logo_asset_id: Some(questiongame_host::AssetId::from("logo")), ..TeamOverlay::default() });
    catalog.recipe_upsert(&game, NOW).unwrap();
    let report = catalog.catalog_copy_to(&Selection { recipes: vec![RecipeId::from("g1")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    let copy = report.created.iter().find(|t| t.kind == CatalogKind::Recipe).unwrap().id.clone();
    catalog.workspace_switch(&b).unwrap();
    let copied = catalog.recipe_get(&RecipeId::from(copy.as_str())).unwrap();
    let logo = copied.overlays.teams.values().find_map(|o| o.logo_asset_id.clone()).unwrap();
    assert_ne!(logo.as_str(), "logo");
    assert!(catalog.catalog_get(CatalogKind::Asset, logo.as_str()).is_ok(), "B's own asset");
}

#[test]
fn a_home_domain_is_named_apart_from_a_domain_a_game_brings() {
    let (catalog, _a, b) = setup();
    catalog.catalog_upsert(&question("q5", 50), NOW).unwrap();
    catalog.catalog_upsert(&domain("solo", &["q5"]), NOW).unwrap();
    let sel = Selection { questions: vec![QuestionId::from("q5")], recipes: vec![RecipeId::from("g1")], ..Selection::default() };
    let report = catalog.transfer_preview(TransferOp::Copy, &sel, Some(&b), CopyOptions::default()).unwrap();
    let homes: Vec<_> = report.homes.iter().map(|t| t.from.as_str()).collect();
    assert_eq!(homes, ["solo"], "d1 came whole with the game: {report:?}");
    assert!(report.created.iter().any(|t| t.kind == CatalogKind::Domain && t.from == "d1"));
}
