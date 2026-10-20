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
