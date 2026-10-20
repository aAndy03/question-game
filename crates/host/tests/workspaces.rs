//! Workspaces (Beta 2.0): several libraries in one file, and a shared library
//! every workspace sees. What a workspace sees is its own rows and the shared
//! ones — in every read, decided in the host.

use questiongame_host::catalog::{
    ArchiveScope, CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo,
    Domain, DomainMember, Question, QuestionOption, Recipe, SearchQuery, SeedMode, Team,
};
use questiongame_host::flags::GameSettings;
use questiongame_host::{QuestionId, TeamId};

const NOW: u64 = 1_790_000_000_000;

fn team(id: &str) -> CatalogItem {
    CatalogItem::Team(Box::new(Team::new(id, id, "TM")))
}
fn shared_team(id: &str) -> CatalogItem {
    let mut t = Team::new(id, id, "TM");
    t.stamps.shared = true;
    CatalogItem::Team(Box::new(t))
}
fn question(id: &str, shared: bool) -> CatalogItem {
    let mut q = Question::new(id, format!("Question {id}"), 10);
    q.options = vec![
        QuestionOption::new(format!("{id}-a"), "Yes", true),
        QuestionOption::new(format!("{id}-b"), "No", false),
    ];
    q.stamps.shared = shared;
    CatalogItem::Question(Box::new(q))
}
fn domain(id: &str, shared: bool, questions: &[&str]) -> CatalogItem {
    let mut d = Domain::new(id, id, "DOM");
    d.questions = questions
        .iter()
        .enumerate()
        .map(|(i, q)| DomainMember {
            question_id: QuestionId::from(*q),
            sort_key: i as i64,
        })
        .collect();
    d.stamps.shared = shared;
    CatalogItem::Domain(Box::new(d))
}
fn ids(catalog: &CatalogService, kind: CatalogKind) -> Vec<String> {
    let mut v: Vec<String> = catalog
        .catalog_list(kind, ArchiveScope::All)
        .unwrap()
        .iter()
        .map(|i| i.id())
        .collect();
    v.sort();
    v
}

/// One catalog with workspaces A (the first, unnamed until named) and B.
fn two() -> (CatalogService, String, String) {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    let a = catalog.current_workspace().as_str().to_owned();
    catalog
        .workspace_rename(&a.as_str().into(), "Alpha", NOW)
        .unwrap();
    let b = catalog
        .workspace_create("Beta", None, NOW)
        .unwrap()
        .id
        .as_str()
        .to_owned();
    (catalog, a, b)
}

#[test]
fn a_new_library_has_one_unnamed_workspace_in_use() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    let (workspaces, groups) = catalog.workspace_list().unwrap();
    assert_eq!(workspaces.len(), 1);
    assert!(groups.is_empty());
    assert_eq!(
        workspaces[0].name, None,
        "the operator names it; nothing is suggested"
    );
    assert_eq!(catalog.current_workspace(), workspaces[0].id);
}

#[test]
fn rows_live_in_their_workspace_and_shared_rows_in_every_one() {
    let (catalog, a, b) = two();
    catalog.catalog_upsert(&team("a-team"), NOW).unwrap();
    catalog
        .catalog_upsert(&shared_team("everyone"), NOW)
        .unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Team), ["a-team", "everyone"]);
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Team), ["everyone"]);
    catalog.catalog_upsert(&team("b-team"), NOW).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Team), ["b-team", "everyone"]);
    catalog.workspace_switch(&a.as_str().into()).unwrap();
    assert_eq!(ids(&catalog, CatalogKind::Team), ["a-team", "everyone"]);
}

#[test]
fn another_workspaces_row_is_not_found() {
    let (catalog, _a, b) = two();
    catalog.catalog_upsert(&team("a-team"), NOW).unwrap();
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    assert!(matches!(
        catalog.catalog_get(CatalogKind::Team, "a-team"),
        Err(CatalogError::NotFound { .. })
    ));
    // and its id cannot be written over from here
    assert!(catalog.catalog_upsert(&team("a-team"), NOW).is_err());
}

#[test]
fn an_upsert_never_moves_a_row() {
    let (catalog, _a, _b) = two();
    catalog.catalog_upsert(&team("t"), NOW).unwrap();
    // Sent back with `shared: true`, as a confused client might: still local.
    catalog.catalog_upsert(&shared_team("t"), NOW + 1).unwrap();
    let CatalogItem::Team(t) = catalog.catalog_get(CatalogKind::Team, "t").unwrap() else {
        panic!()
    };
    assert!(!t.stamps.shared);
}

#[test]
fn search_sees_this_workspace_and_the_shared_library() {
    let (catalog, _a, b) = two();
    catalog.catalog_upsert(&team("alpha-local"), NOW).unwrap();
    catalog
        .catalog_upsert(&shared_team("alpha-shared"), NOW)
        .unwrap();
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    catalog.catalog_upsert(&team("alpha-beta"), NOW).unwrap();
    let hits = catalog
        .catalog_search(&SearchQuery {
            text: "alpha".into(),
            kinds: vec![CatalogKind::Team],
            scope: ArchiveScope::All,
            limit: 50,
        })
        .unwrap();
    let mut found: Vec<String> = hits.iter().map(|h| h.id.clone()).collect();
    found.sort();
    assert_eq!(found, ["alpha-beta", "alpha-shared"]);
}

#[test]
fn a_shared_domain_holds_only_shared_questions() {
    let (catalog, _a, _b) = two();
    catalog
        .catalog_upsert(&question("local-q", false), NOW)
        .unwrap();
    catalog
        .catalog_upsert(&question("shared-q", true), NOW)
        .unwrap();
    assert!(matches!(
        catalog.catalog_upsert(&domain("everyone", true, &["local-q"]), NOW),
        Err(CatalogError::ScopeRule { .. })
    ));
    catalog
        .catalog_upsert(&domain("everyone", true, &["shared-q"]), NOW)
        .unwrap();
    // a local domain may hold both
    catalog
        .catalog_upsert(&domain("mine", false, &["local-q", "shared-q"]), NOW)
        .unwrap();
}

#[test]
fn a_game_uses_its_own_workspaces_rows_and_shared_ones_only() {
    let (catalog, a, b) = two();
    catalog.catalog_upsert(&team("a-team"), NOW).unwrap();
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    let mut with_a = Recipe::new("game-b", "Game B", GameSettings::default());
    with_a.teams = vec![TeamId::from("a-team")];
    assert!(
        matches!(
            catalog.recipe_upsert(&with_a, NOW),
            Err(CatalogError::ScopeRule { .. })
        ),
        "a team local to another workspace"
    );
    with_a.teams.clear();
    catalog.recipe_upsert(&with_a, NOW).unwrap();
    catalog.workspace_switch(&a.as_str().into()).unwrap();
    assert!(
        catalog.recipe_list(ArchiveScope::All).unwrap().is_empty(),
        "games are per workspace"
    );
}

#[test]
fn two_workspaces_each_hold_their_own_demo() {
    let (catalog, a, b) = two();
    catalog
        .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .unwrap();
    let in_a = ids(&catalog, CatalogKind::Team);
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    assert!(ids(&catalog, CatalogKind::Team).is_empty());
    catalog
        .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .unwrap();
    let in_b = ids(&catalog, CatalogKind::Team);
    assert_eq!(in_b.len(), in_a.len());
    assert!(
        in_b.iter().all(|id| !in_a.contains(id)),
        "{in_b:?} vs {in_a:?}"
    );
    catalog.workspace_switch(&a.as_str().into()).unwrap();
    assert_eq!(
        ids(&catalog, CatalogKind::Team),
        in_a,
        "the first Demo is untouched"
    );
}

#[test]
fn workspace_names_are_typed_unique_and_short() {
    let (catalog, _a, _b) = two();
    for bad in ["", "   ", &"x".repeat(61), "beta", " BETA "] {
        assert!(catalog.workspace_create(bad, None, NOW).is_err(), "{bad:?}");
    }
    assert_eq!(
        catalog
            .workspace_create("  Gamma  ", None, NOW)
            .unwrap()
            .name
            .as_deref(),
        Some("Gamma")
    );
}

#[test]
fn plays_and_statistics_are_the_workspaces_own_unless_asked_for_all() {
    use questiongame_host::flags::FlagService;
    use questiongame_host::stats::{StatsFilter, StatsQuery};
    use questiongame_host::{MatchService, PlayId, RecipeId};

    let (catalog, _a, b) = two();
    catalog
        .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .unwrap();
    let mut flags = FlagService::default();
    flags.load_recipe(GameSettings::default()).unwrap();
    let snapshot = catalog
        .build_snapshot(
            &RecipeId::from("seed-recipe-demo"),
            PlayId::from("play-a"),
            flags.freeze().unwrap(),
        )
        .unwrap();
    let mut play = MatchService::new();
    play.play_load(snapshot, 0).unwrap();
    play.play_start(0).unwrap();
    play.choose_domain(&questiongame_host::DomainId::from("seed-dom-geo"), 100)
        .unwrap();
    play.set_selection(&[questiongame_host::OptionId::from("seed-q-geo-1-a")], 200)
        .unwrap();
    play.lock_selection(300).unwrap();
    play.reveal_outcome(400).unwrap();
    catalog.play_persist(play.get_state().unwrap()).unwrap();
    assert_eq!(catalog.play_list(None).unwrap().len(), 1);

    catalog.workspace_switch(&b.as_str().into()).unwrap();
    assert!(catalog.play_list(None).unwrap().is_empty());
    let mine = catalog.stats_query(&StatsQuery::default()).unwrap();
    let all = catalog
        .stats_query(&StatsQuery {
            filter: StatsFilter {
                all_workspaces: true,
                ..StatsFilter::default()
            },
            ..StatsQuery::default()
        })
        .unwrap();
    assert_eq!(mine.play_count, 0);
    assert_eq!(all.play_count, 1);
}

mod generated {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #![proptest_config(ProptestConfig::with_cases(24))]

        /// Whatever lives where, a workspace's lists and searches return its
        /// own rows and shared ones — never another workspace's.
        #[test]
        fn no_list_or_search_in_one_workspace_returns_anothers_row(
            extra in 0usize..3,
            homes in proptest::collection::vec(proptest::option::of(0usize..3), 1..12),
        ) {
            let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
            let mut spaces = vec![catalog.current_workspace()];
            for n in 0..extra {
                spaces.push(catalog.workspace_create(&format!("W{n}"), None, NOW).unwrap().id);
            }
            for (i, home) in homes.iter().enumerate() {
                match home.map(|h| h % spaces.len()) {
                    None => {
                        catalog.catalog_upsert(&shared_team(&format!("row-shared-{i}")), NOW).unwrap();
                        catalog.catalog_upsert(&question(&format!("q-shared-{i}"), true), NOW).unwrap();
                    }
                    Some(h) => {
                        catalog.workspace_switch(&spaces[h]).unwrap();
                        catalog.catalog_upsert(&team(&format!("row-w{h}-{i}")), NOW).unwrap();
                        catalog.catalog_upsert(&question(&format!("q-w{h}-{i}"), false), NOW).unwrap();
                    }
                }
            }
            for (h, space) in spaces.iter().enumerate() {
                catalog.workspace_switch(space).unwrap();
                let mine = |id: &str| id.contains("-shared-") || id.contains(&format!("-w{h}-"));
                for kind in [CatalogKind::Team, CatalogKind::Question] {
                    for id in ids(&catalog, kind) {
                        prop_assert!(mine(&id), "workspace {h} lists {id}");
                    }
                }
                let hits = catalog
                    .catalog_search(&SearchQuery { text: "row".into(), kinds: vec![CatalogKind::Team], scope: ArchiveScope::All, limit: 100 })
                    .unwrap();
                for hit in hits {
                    prop_assert!(mine(&hit.id), "workspace {h} finds {}", hit.id);
                }
                let expected = homes.iter().filter(|home| home.map(|x| x % spaces.len()).is_none_or(|x| x == h)).count();
                prop_assert_eq!(ids(&catalog, CatalogKind::Team).len(), expected);
            }
        }
    }
}

// ------------------------------------------------------------ the verbs (Task 3)

fn backup_options(tag: &str) -> (std::path::PathBuf, questiongame_host::catalog::OpenOptions) {
    let dir = std::env::temp_dir().join(format!(
        "questiongame-ws-{tag}-{}-{}",
        std::process::id(),
        std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_nanos()
    ));
    let options = questiongame_host::catalog::OpenOptions {
        app_version: "2.0.0-beta.1".into(),
        backup_dir: dir.join("backups"),
        keep: 5,
        stamp: "20261021-120000".into(),
    };
    (dir, options)
}

#[test]
fn an_archived_workspaces_name_is_free_again_until_it_is_restored() {
    let (catalog, a, b) = two();
    catalog.workspace_archive(&b.as_str().into(), NOW).unwrap();
    catalog.workspace_create("beta", None, NOW).unwrap();
    assert!(catalog.workspace_restore(&b.as_str().into(), NOW).is_err(), "its name is taken now");
    assert!(catalog.workspace_rename(&a.as_str().into(), "BETA", NOW).is_err());
}

#[test]
fn the_current_workspace_cannot_be_archived_nor_an_archived_one_opened() {
    let (catalog, a, b) = two();
    assert!(catalog.workspace_archive(&a.as_str().into(), NOW).is_err());
    catalog.workspace_archive(&b.as_str().into(), NOW).unwrap();
    assert!(catalog.workspace_switch(&b.as_str().into()).is_err());
    let (all, _) = catalog.workspace_list().unwrap();
    assert!(all.iter().find(|w| w.id.as_str() == b).unwrap().is_archived(), "archived, still listed");
    catalog.workspace_restore(&b.as_str().into(), NOW).unwrap();
    catalog.workspace_switch(&b.as_str().into()).unwrap();
}

#[test]
fn duplicate_copies_local_rows_and_games_into_one_family_and_no_plays() {
    use questiongame_host::flags::FlagService;
    use questiongame_host::{MatchService, PlayId, RecipeId};

    let (catalog, a, _b) = two();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    catalog.catalog_upsert(&shared_team("everyone"), NOW).unwrap();
    catalog.catalog_upsert(&team("gone"), NOW).unwrap();
    catalog.catalog_archive(CatalogKind::Team, "gone", NOW).unwrap();
    let mut flags = FlagService::default();
    flags.load_recipe(GameSettings::default()).unwrap();
    let snapshot = catalog
        .build_snapshot(&RecipeId::from("seed-recipe-demo"), PlayId::from("play-a"), flags.freeze().unwrap())
        .unwrap();
    let mut play = MatchService::new();
    play.play_load(snapshot, 0).unwrap();
    play.play_start(0).unwrap();
    catalog.play_persist(play.get_state().unwrap()).unwrap();

    let copy = catalog.workspace_duplicate(&a.as_str().into(), "Alpha 2027", NOW).unwrap();
    assert_eq!(catalog.current_workspace().as_str(), a, "the operator stays where they were");
    catalog.workspace_switch(&copy.id).unwrap();
    let teams = catalog.catalog_list(CatalogKind::Team, ArchiveScope::All).unwrap();
    assert_eq!(teams.len(), 4, "two Demo teams, the archived one, and the shared one");
    assert!(teams.iter().any(|t| t.id() == "everyone"), "a shared row is not copied, it is already here");
    let local: Vec<_> = teams.iter().filter(|t| !t.is_shared()).collect();
    assert!(local.iter().all(|t| !t.id().starts_with("seed-") && t.id() != "gone"), "new ids");
    assert!(local.iter().all(|t| t.stamps().family_id.is_some()));
    assert_eq!(local.iter().filter(|t| t.stamps().is_archived()).count(), 1, "archived stays archived");

    let games = catalog.recipe_list(ArchiveScope::All).unwrap();
    assert_eq!(games.len(), 1);
    assert!(catalog.play_list(None).unwrap().is_empty(), "no Plays come along");
    let mut flags = FlagService::default();
    flags.load_recipe(games[0].settings.clone()).unwrap();
    catalog
        .build_snapshot(&games[0].id, PlayId::from("play-copy"), flags.freeze().unwrap())
        .expect("the copied game works in its new workspace");

    catalog.workspace_switch(&a.as_str().into()).unwrap();
    let CatalogItem::Team(red) = catalog.catalog_get(CatalogKind::Team, "seed-team-red").unwrap() else { panic!() };
    assert!(red.stamps.family_id.is_some(), "the original joins the family too");
    assert!(local.iter().any(|t| t.stamps().family_id == red.stamps.family_id));
}

#[test]
fn delete_permanently_takes_only_an_archived_workspace_and_never_a_shared_row() {
    let (catalog, a, b) = two();
    catalog.catalog_upsert(&shared_team("everyone"), NOW).unwrap();
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let mut game = catalog.recipe_list(ArchiveScope::All).unwrap().remove(0);
    game.teams.push(questiongame_host::TeamId::from("everyone"));
    catalog.recipe_upsert(&game, NOW).unwrap();
    catalog.workspace_switch(&a.as_str().into()).unwrap();

    let (dir, options) = backup_options("delete");
    assert!(catalog.workspace_delete(&b.as_str().into(), &options).is_err(), "an active workspace");
    catalog.workspace_archive(&b.as_str().into(), NOW).unwrap();
    let (rows, games, _) = catalog.workspace_delete_preview(&b.as_str().into()).unwrap();
    assert!(rows > 0 && games == 1);
    let report = catalog.workspace_delete(&b.as_str().into(), &options).unwrap();
    assert_eq!((report.rows, report.games), (rows, games));
    assert!(report.backup.exists(), "a copy first");
    assert!(catalog.catalog_get(CatalogKind::Team, "everyone").is_ok(), "the shared row stays");
    let (all, _) = catalog.workspace_list().unwrap();
    assert_eq!(all.len(), 1);
    let _ = std::fs::remove_dir_all(dir);
}

#[test]
fn deleting_a_group_leaves_its_workspaces_ungrouped() {
    let (catalog, _a, b) = two();
    let group = catalog.group_create("Seasons", NOW).unwrap();
    assert!(catalog.group_create(" seasons ", NOW).is_err());
    catalog.workspace_set_group(&b.as_str().into(), Some(&group.id), 0, NOW).unwrap();
    let (all, groups) = catalog.workspace_list().unwrap();
    assert_eq!(groups.len(), 1);
    assert_eq!(all.iter().find(|w| w.id.as_str() == b).unwrap().group_id.as_ref(), Some(&group.id));
    catalog.group_delete(&group.id).unwrap();
    let (all, groups) = catalog.workspace_list().unwrap();
    assert!(groups.is_empty());
    assert_eq!(all.iter().find(|w| w.id.as_str() == b).unwrap().group_id, None);
}

#[test]
fn groups_reorder_as_told() {
    let (catalog, _a, _b) = two();
    let one = catalog.group_create("One", NOW).unwrap();
    let two = catalog.group_create("Two", NOW).unwrap();
    catalog.group_reorder(&[two.id.clone(), one.id.clone()], NOW).unwrap();
    let (_, groups) = catalog.workspace_list().unwrap();
    assert_eq!(groups.iter().map(|g| g.name.as_str()).collect::<Vec<_>>(), ["Two", "One"]);
}

#[test]
fn a_workspace_keeps_its_own_defaults() {
    use questiongame_host::flags::{FlagService, GlobalSettings, WorkspaceDefaults};
    let (catalog, a, b) = two();
    assert_eq!(catalog.workspace_defaults(&a.as_str().into()).unwrap(), None);
    let mut flags = FlagService::new(GlobalSettings::default());
    let mut defaults: WorkspaceDefaults = flags.workspace_defaults();
    defaults.timer = questiongame_host::settings::TimerLevel::new(true, 45_000);
    catalog.workspace_set_defaults(&b.as_str().into(), &defaults, NOW).unwrap();
    assert_eq!(catalog.workspace_defaults(&b.as_str().into()).unwrap().as_ref(), Some(&defaults));
    assert_eq!(catalog.workspace_defaults(&a.as_str().into()).unwrap(), None);
    flags.adopt_workspace_defaults(defaults.clone()).unwrap();
    assert_eq!(flags.workspace_defaults(), defaults);
}

// ------------------------------------------------------- review (Opus, P14)

#[test]
fn wipe_plays_removes_only_this_workspaces_closed_plays() {
    use questiongame_host::flags::FlagService;
    use questiongame_host::{MatchService, PlayId, RecipeId};

    let (catalog, a, b) = two();
    let close_one = |catalog: &CatalogService, play: &str| {
        let recipe = catalog.recipe_list(ArchiveScope::All).unwrap().remove(0);
        let mut flags = FlagService::default();
        flags.load_recipe(GameSettings::default()).unwrap();
        let snapshot = catalog.build_snapshot(&recipe.id, PlayId::from(play), flags.freeze().unwrap()).unwrap();
        let mut service = MatchService::new();
        service.play_load(snapshot, 0).unwrap();
        service.play_start(0).unwrap();
        service.abandon(10).unwrap();
        catalog.play_persist(service.get_state().unwrap()).unwrap();
    };
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    close_one(&catalog, "play-a");
    catalog.workspace_switch(&b.as_str().into()).unwrap();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    close_one(&catalog, "play-b");

    assert_eq!(catalog.wipe_plays().unwrap().removed, 1);
    assert!(catalog.play_list(None).unwrap().is_empty());
    catalog.workspace_switch(&a.as_str().into()).unwrap();
    assert_eq!(catalog.play_list(None).unwrap().len(), 1, "A's Play is A's to wipe");
    let _ = RecipeId::from("unused");
}

#[test]
fn restore_sample_game_works_after_the_first_demo_moved_away() {
    use questiongame_host::RecipeId;
    use questiongame_host::catalog::Selection;
    let (catalog, _a, b) = two();
    catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    catalog
        .catalog_move_to(&Selection { recipes: vec![RecipeId::from("seed-recipe-demo")], ..Selection::default() }, &b.as_str().into(), NOW)
        .unwrap();
    let again = catalog.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    assert!(again.inserted > 0);
    assert_eq!(catalog.recipe_list(ArchiveScope::All).unwrap().len(), 1);
    assert!(catalog.seed_status(Demo::En, GameSettings::default()).unwrap().missing == 0);
}
