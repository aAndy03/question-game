//! beta.5 on the host: a row's family, *Duplicate* here, the library check and
//! its repair, Statistics by workspace, a team's Plays in its own workspace.

use questiongame_host::catalog::{
    CatalogItem, CatalogKind, CatalogLocation, CatalogService, CopyOptions, Demo, Domain,
    DomainMember, Question, QuestionOption, SeedMode, Selection, Team,
};
use questiongame_host::flags::{FlagService, GameSettings};
use questiongame_host::stats::{StatsDimension, StatsFilter, StatsQuery};
use questiongame_host::{MatchService, PlayId, QuestionId, RecipeId, TeamId, WorkspaceId};

const NOW: u64 = 1_790_000_000_000;

fn team(id: &str, name: &str) -> CatalogItem {
    CatalogItem::Team(Box::new(Team::new(id, name, "TM")))
}
fn question(id: &str, difficulty: u8) -> CatalogItem {
    let mut q = Question::new(id, format!("Question {id}?"), difficulty);
    q.options = vec![
        QuestionOption::new(format!("{id}-a"), "Yes", true),
        QuestionOption::new(format!("{id}-b"), "No", false),
    ];
    CatalogItem::Question(Box::new(q))
}
fn names(catalog: &CatalogService, kind: CatalogKind) -> Vec<String> {
    let mut out: Vec<String> = catalog
        .catalog_list(kind, questiongame_host::catalog::ArchiveScope::All)
        .unwrap()
        .into_iter()
        .map(|item| match item {
            CatalogItem::Team(t) => t.name,
            CatalogItem::Domain(d) => d.name,
            CatalogItem::Question(q) => q.stem,
            other => panic!("{other:?}"),
        })
        .collect();
    out.sort();
    out
}

#[test]
fn a_row_names_its_copies_and_forgets_them_when_it_stops_following() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&team("t1", "Red"), NOW).unwrap();
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    assert!(
        catalog
            .catalog_family(CatalogKind::Team, "t1")
            .unwrap()
            .is_empty()
    );
    let copied = catalog
        .catalog_copy_to(
            &Selection {
                teams: vec![TeamId::from("t1")],
                ..Selection::default()
            },
            &b,
            CopyOptions::default(),
            NOW,
        )
        .unwrap();
    let there = copied.created[0].id.clone();
    let family = catalog.catalog_family(CatalogKind::Team, "t1").unwrap();
    assert_eq!(family.len(), 1);
    assert_eq!(family[0].id, there);
    assert_eq!(family[0].workspace_name.as_deref(), Some("B"));
    assert!(!family[0].archived);
    catalog.catalog_unfollow(CatalogKind::Team, "t1").unwrap();
    assert!(
        catalog
            .catalog_family(CatalogKind::Team, "t1")
            .unwrap()
            .is_empty()
    );
    catalog.catalog_unfollow(CatalogKind::Team, "t1").unwrap();
}

#[test]
fn duplicate_names_a_team_once_then_numbers_it_and_joins_no_family() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&team("t1", "Red"), NOW).unwrap();
    let (first, _) = catalog
        .catalog_duplicate(CatalogKind::Team, &["t1".into()], NOW)
        .unwrap();
    let (second, _) = catalog
        .catalog_duplicate(CatalogKind::Team, &["t1".into()], NOW)
        .unwrap();
    assert_ne!(first[0], second[0]);
    assert_eq!(
        names(&catalog, CatalogKind::Team),
        ["Red", "Red (copy 2)", "Red (copy)"]
    );
    assert!(
        catalog
            .catalog_family(CatalogKind::Team, &first[0])
            .unwrap()
            .is_empty()
    );
    assert!(
        catalog
            .catalog_family(CatalogKind::Team, "t1")
            .unwrap()
            .is_empty()
    );
}

#[test]
fn a_duplicated_question_joins_its_domains_in_the_same_group() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&question("q1", 10), NOW).unwrap();
    for id in ["d1", "d2"] {
        let mut d = Domain::new(id, id, "DOM");
        d.questions = vec![DomainMember {
            question_id: QuestionId::from("q1"),
            sort_key: 0,
            group_id: None,
        }];
        catalog
            .catalog_upsert(&CatalogItem::Domain(Box::new(d)), NOW)
            .unwrap();
    }
    let group = catalog
        .domain_group_create(&"d1".into(), "Capitals", NOW)
        .unwrap();
    let mut d1 = match catalog.catalog_get(CatalogKind::Domain, "d1").unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    };
    d1.questions[0].group_id = Some(group.id.clone());
    catalog
        .catalog_upsert(&CatalogItem::Domain(Box::new(d1)), NOW)
        .unwrap();

    let (made, _) = catalog
        .catalog_duplicate(CatalogKind::Question, &["q1".into()], NOW)
        .unwrap();
    for (id, group_id) in [("d1", Some(group.id.clone())), ("d2", None)] {
        let d = match catalog.catalog_get(CatalogKind::Domain, id).unwrap() {
            CatalogItem::Domain(d) => *d,
            other => panic!("{other:?}"),
        };
        let member = d
            .questions
            .iter()
            .find(|m| m.question_id.as_str() == made[0])
            .expect("the twin is in the domain");
        assert_eq!(member.group_id, group_id, "{id}");
        assert_eq!(
            d.questions.last().unwrap().question_id.as_str(),
            made[0],
            "at the end"
        );
    }
}

#[test]
fn a_duplicated_domain_holds_the_same_questions_in_copied_groups() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&question("q1", 10), NOW).unwrap();
    let mut d = Domain::new("d1", "Bible", "BIB");
    d.questions = vec![DomainMember {
        question_id: QuestionId::from("q1"),
        sort_key: 0,
        group_id: None,
    }];
    catalog
        .catalog_upsert(&CatalogItem::Domain(Box::new(d)), NOW)
        .unwrap();
    let group = catalog
        .domain_group_create(&"d1".into(), "Old", NOW)
        .unwrap();
    let mut d1 = match catalog.catalog_get(CatalogKind::Domain, "d1").unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    };
    d1.questions[0].group_id = Some(group.id.clone());
    catalog
        .catalog_upsert(&CatalogItem::Domain(Box::new(d1)), NOW)
        .unwrap();

    let (made, _) = catalog
        .catalog_duplicate(CatalogKind::Domain, &["d1".into()], NOW)
        .unwrap();
    let copy = match catalog.catalog_get(CatalogKind::Domain, &made[0]).unwrap() {
        CatalogItem::Domain(d) => *d,
        other => panic!("{other:?}"),
    };
    assert_eq!(copy.name, "Bible (copy)");
    assert_eq!(
        copy.questions[0].question_id.as_str(),
        "q1",
        "a member, not a copy"
    );
    assert_eq!(copy.groups.len(), 1);
    assert_ne!(copy.groups[0].id, group.id, "its own group");
    assert_eq!(
        copy.questions[0].group_id.as_ref(),
        Some(&copy.groups[0].id)
    );
    assert_eq!(names(&catalog, CatalogKind::Question).len(), 1);
}

#[test]
fn duplicate_is_every_row_or_none() {
    let catalog = CatalogService::open(CatalogLocation::Memory).unwrap();
    catalog.catalog_upsert(&team("t1", "Red"), NOW).unwrap();
    assert!(
        catalog
            .catalog_duplicate(CatalogKind::Team, &["t1".into(), "gone".into()], NOW)
            .is_err()
    );
    assert_eq!(names(&catalog, CatalogKind::Team), ["Red"]);
}

#[test]
fn the_library_check_counts_cross_workspace_references_and_repair_removes_only_them() {
    let dir = std::env::temp_dir().join(format!("qg-beta5-repair-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("questiongame.sqlite3");
    let catalog = CatalogService::open(CatalogLocation::file(&path)).unwrap();
    catalog
        .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
        .unwrap();
    assert_eq!(catalog.library_check().unwrap(), 0, "a clean library");
    let (none, _) = catalog.library_repair(NOW).unwrap();
    assert_eq!(none, 0);

    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    let before_teams = names(&catalog, CatalogKind::Team);
    // A question and a team moved to B under the table's feet: the Demo's
    // Geography and its game now point across workspaces.
    let raw = rusqlite::Connection::open(&path).unwrap();
    raw.execute(
        "UPDATE questions SET workspace_id = ?1 WHERE id = 'seed-q-geo-1'",
        [b.as_str()],
    )
    .unwrap();
    raw.execute(
        "UPDATE teams SET workspace_id = ?1 WHERE id = 'seed-team-red'",
        [b.as_str()],
    )
    .unwrap();
    drop(raw);
    // One domain member, one board question, one roster entry.
    assert_eq!(catalog.library_check().unwrap(), 3);
    let (removed, games) = catalog.library_repair(NOW + 1).unwrap();
    assert_eq!(removed, 3);
    assert_eq!(games.len(), 1, "the Demo game's rev moved");
    assert_eq!(catalog.library_check().unwrap(), 0);
    // Nothing else went: the rows themselves are all still there.
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(names(&catalog, CatalogKind::Team), ["Red"]);
    catalog
        .workspace_switch(&WorkspaceId::from("ws-1"))
        .unwrap();
    assert_eq!(
        names(&catalog, CatalogKind::Team).len(),
        before_teams.len() - 1
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn statistics_group_by_workspace_and_a_teams_plays_are_its_workspaces() {
    let dir = std::env::temp_dir().join(format!("qg-beta5-stats-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let path = dir.join("questiongame.sqlite3");
    let catalog = CatalogService::open(CatalogLocation::file(&path)).unwrap();
    catalog
        .workspace_rename(&catalog.current_workspace(), "Club", NOW)
        .unwrap();
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

    let by = catalog
        .stats_query(&StatsQuery {
            group_by: StatsDimension::Workspace,
            filter: StatsFilter {
                all_workspaces: true,
                ..StatsFilter::default()
            },
            ..StatsQuery::default()
        })
        .unwrap();
    assert_eq!(by.rows.len(), 1);
    assert_eq!(by.rows[0].label, "Club");

    let red = |catalog: &CatalogService| match catalog
        .catalog_get(CatalogKind::Team, "seed-team-red")
        .unwrap()
    {
        CatalogItem::Team(t) => t.play_count,
        other => panic!("{other:?}"),
    };
    assert_eq!(red(&catalog), 1);
    // The team alone in B (its game stayed): the season it played is Club's, not B's.
    let b = catalog.workspace_create("B", None, NOW).unwrap().id;
    rusqlite::Connection::open(&path)
        .unwrap()
        .execute(
            "UPDATE teams SET workspace_id = ?1 WHERE id = 'seed-team-red'",
            [b.as_str()],
        )
        .unwrap();
    catalog.workspace_switch(&b).unwrap();
    assert_eq!(
        red(&catalog),
        0,
        "another workspace's Plays are not counted here"
    );
    let _ = std::fs::remove_dir_all(&dir);
}
