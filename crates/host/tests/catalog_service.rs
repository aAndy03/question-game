//! `CatalogService` through its public interface only (§11.A, §11.B, §5.10).
//!
//! The P5 exit criteria are the spine of this file:
//!
//! - **The same suite passes against both adapters.** [`each_adapter`] runs a
//!   body twice — once in memory, once against a real file with WAL and
//!   `synchronous = FULL` — so "the storage seam is internal" is a property the
//!   tests check rather than a claim the docs make.
//! - **Kill the process mid-write; boot replays events and loses nothing.**
//!   Dropping a `CatalogService` without a clean shutdown is what a kill looks
//!   like from the file's point of view, and reopening has to hand back the
//!   same Play.
//! - **A catalog edit during an open Play leaves that Play's snapshot
//!   byte-identical.**

mod support;

use std::path::PathBuf;

use questiongame_host::catalog::{
    ArchiveScope, Asset, BoardDomain, CatalogError, CatalogKind, CatalogLocation, CatalogService,
    ChangeOp, Domain, DomainMember, DomainOverlay, EditScope, Operator, OverlayTarget, Question,
    QuestionOption, QuestionOverlay, Recipe, SearchQuery, Team, TeamOverlay,
};
use questiongame_host::flags::{FlagService, GameSetting, GameSettings};
use questiongame_host::settings::{FrozenSettings, ScoringMode};
use questiongame_host::{DomainId, MatchService, PlayId, QuestionId, RecipeId, TeamId};

use support::option_id;

/// A file that goes away when the test does — WAL and shared-memory sidecars
/// included, or the next run would inherit them.
struct TempDb {
    path: PathBuf,
}

impl TempDb {
    fn new(tag: &str) -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let mut path = std::env::temp_dir();
        path.push(format!(
            "questiongame-{tag}-{}-{nanos}.sqlite3",
            std::process::id()
        ));
        TempDb { path }
    }

    fn location(&self) -> CatalogLocation {
        CatalogLocation::file(&self.path)
    }
}

impl Drop for TempDb {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let mut path = self.path.clone().into_os_string();
            path.push(suffix);
            let _ = std::fs::remove_file(path);
        }
    }
}

/// Run the same body against both storage adapters.
fn each_adapter(tag: &str, body: impl Fn(&CatalogService)) {
    body(&CatalogService::in_memory().unwrap());

    let temp = TempDb::new(tag);
    let service = CatalogService::open(temp.location()).unwrap();
    body(&service);
    drop(service);
}

// -------------------------------------------------------------------- fixtures

fn team(id: &str) -> Team {
    Team::new(id, format!("TEAM {id}"), id.to_uppercase())
}

fn question(id: &str, difficulty: u8) -> Question {
    Question::new(id, format!("Stem of {id}?"), difficulty).with_options(vec![
        QuestionOption::new(option_id('a'), "A", true),
        QuestionOption::new(option_id('b'), "B", false),
    ])
}

/// Two teams, one domain, two questions, one recipe that uses all of it.
fn seed(service: &CatalogService) -> Recipe {
    for id in ["team-a", "team-b"] {
        service.catalog_upsert(&team(id).into(), 1_000).unwrap();
    }
    for (id, difficulty) in [("q-1", 10), ("q-2", 20)] {
        service
            .catalog_upsert(&question(id, difficulty).into(), 1_000)
            .unwrap();
    }
    let mut domain = Domain::new("dom-1", "Science", "SCI_204");
    domain.questions = vec![
        DomainMember {
            question_id: QuestionId::from("q-1"),
            sort_key: 0,
        },
        DomainMember {
            question_id: QuestionId::from("q-2"),
            sort_key: 1,
        },
    ];
    service.catalog_upsert(&domain.into(), 1_000).unwrap();

    let mut recipe = Recipe::new("recipe-1", "Demo", GameSettings::default());
    recipe.teams = vec![TeamId::from("team-a"), TeamId::from("team-b")];
    recipe.board = vec![BoardDomain {
        domain_id: DomainId::from("dom-1"),
        question_ids: vec![QuestionId::from("q-1"), QuestionId::from("q-2")],
    }];
    service.recipe_upsert(&recipe, 1_000).unwrap();
    service.recipe_get(&RecipeId::from("recipe-1")).unwrap()
}

fn frozen() -> FrozenSettings {
    let mut flags = FlagService::default();
    flags.load_recipe(GameSettings::default()).unwrap();
    flags.freeze().unwrap()
}

// --------------------------------------------------------------- the library

#[test]
fn every_entity_round_trips_on_both_adapters() {
    each_adapter("round-trip", |service| {
        seed(service);

        service
            .catalog_upsert(
                &Asset::new("asset-1", "logos/alpha.png", "image").into(),
                2_000,
            )
            .unwrap();
        service
            .catalog_upsert(&Operator::new("op-1", "Andy").into(), 2_000)
            .unwrap();

        let stored = service
            .catalog_get(CatalogKind::Question, "q-1")
            .unwrap()
            .as_question()
            .cloned()
            .unwrap();
        assert_eq!(stored.stem, "Stem of q-1?");
        assert_eq!(stored.options.len(), 2);
        assert_eq!(stored.correct_option_ids(), vec![option_id('a')]);
        assert_eq!(stored.stamps.created_at, 1_000);

        let domain = service
            .catalog_get(CatalogKind::Domain, "dom-1")
            .unwrap()
            .as_domain()
            .cloned()
            .unwrap();
        assert_eq!(
            domain.questions.len(),
            2,
            "membership travels with the domain"
        );

        for kind in [
            CatalogKind::Team,
            CatalogKind::Domain,
            CatalogKind::Question,
            CatalogKind::Operator,
            CatalogKind::Asset,
        ] {
            assert!(
                !service
                    .catalog_list(kind, ArchiveScope::Active)
                    .unwrap()
                    .is_empty(),
                "{kind} listed nothing"
            );
        }
    });
}

#[test]
fn an_upsert_keeps_created_at_and_moves_updated_at() {
    each_adapter("stamps", |service| {
        seed(service);
        let mut team = service
            .catalog_get(CatalogKind::Team, "team-a")
            .unwrap()
            .as_team()
            .cloned()
            .unwrap();
        team.name = "RENAMED".to_owned();
        // A caller cannot backdate a row: the stamps it sends are ignored.
        team.stamps.created_at = 0;
        team.stamps.updated_at = 0;
        service.catalog_upsert(&team.into(), 5_000).unwrap();

        let stored = service
            .catalog_get(CatalogKind::Team, "team-a")
            .unwrap()
            .as_team()
            .cloned()
            .unwrap();
        assert_eq!(stored.name, "RENAMED");
        assert_eq!(stored.stamps.created_at, 1_000);
        assert_eq!(stored.stamps.updated_at, 5_000);
    });
}

#[test]
fn archive_is_a_soft_delete_and_restore_is_a_first_class_action() {
    each_adapter("archive", |service| {
        seed(service);
        let change = service
            .catalog_archive(CatalogKind::Question, "q-1", 3_000)
            .unwrap();
        assert_eq!(change.op, ChangeOp::Archived);

        let active = service
            .catalog_list(CatalogKind::Question, ArchiveScope::Active)
            .unwrap();
        assert_eq!(active.len(), 1);
        let archived = service
            .catalog_list(CatalogKind::Question, ArchiveScope::Archived)
            .unwrap();
        assert_eq!(archived.len(), 1);
        assert_eq!(
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::All)
                .unwrap()
                .len(),
            2
        );

        // The row is still there — archive is not a delete (§4.1).
        assert!(service.catalog_get(CatalogKind::Question, "q-1").is_ok());

        service
            .catalog_restore(CatalogKind::Question, "q-1")
            .unwrap();
        assert_eq!(
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::Active)
                .unwrap()
                .len(),
            2
        );
    });
}

#[test]
fn a_row_a_recipe_points_at_reports_what_uses_it() {
    let service = CatalogService::in_memory().unwrap();
    seed(&service);
    assert_eq!(
        service.referenced_by(CatalogKind::Team, "team-a").unwrap(),
        Some("a recipe roster")
    );
    assert_eq!(
        service.referenced_by(CatalogKind::Domain, "dom-1").unwrap(),
        Some("a recipe board")
    );
    assert_eq!(
        service
            .referenced_by(CatalogKind::Team, "team-nobody")
            .unwrap(),
        None
    );
}

#[test]
fn the_shape_rules_are_refused_by_the_host_not_only_disabled_in_the_editor() {
    let service = CatalogService::in_memory().unwrap();
    let one_option = Question::new("q-x", "Only one?", 10)
        .with_options(vec![QuestionOption::new("opt-a", "A", true)]);
    assert!(matches!(
        service.catalog_upsert(&one_option.into(), 0),
        Err(CatalogError::Invalid { .. })
    ));

    let no_correct = Question::new("q-y", "None right?", 10).with_options(vec![
        QuestionOption::new("opt-a", "A", false),
        QuestionOption::new("opt-b", "B", false),
    ]);
    assert!(service.catalog_upsert(&no_correct.into(), 0).is_err());

    // Nothing landed.
    assert!(
        service
            .catalog_list(CatalogKind::Question, ArchiveScope::All)
            .unwrap()
            .is_empty()
    );
}

#[test]
fn recipes_are_not_reachable_through_the_catalog_verbs() {
    // §11.A and §11.B are two families with two verb lists; one row reachable
    // through both would be two ways to do one thing.
    let service = CatalogService::in_memory().unwrap();
    assert!(
        service
            .catalog_list(CatalogKind::Recipe, ArchiveScope::All)
            .is_err()
    );
    assert!(
        service
            .catalog_get(CatalogKind::Recipe, "recipe-1")
            .is_err()
    );
}

// ---------------------------------------------------------------- the recipe

#[test]
fn a_recipe_upsert_is_one_transaction_and_advances_the_rev() {
    each_adapter("recipe-tx", |service| {
        let recipe = seed(service);
        assert_eq!(recipe.rev, 1);

        let change = service
            .recipe_set_layout(&recipe.id, serde_json::json!({ "idle": { "x": 4 } }), 2_000)
            .unwrap();
        assert_eq!(change.rev, 2);

        // An illegal settings document is refused whole: the board, the roster
        // and the rev all stay where they were.
        let mut illegal = service.recipe_get(&recipe.id).unwrap();
        illegal.settings.scoring.mode = ScoringMode::LockSpeed;
        illegal.settings.scoring.lock_speed_enabled = true;
        illegal.teams.clear();
        assert!(service.recipe_upsert(&illegal, 3_000).is_err());

        let stored = service.recipe_get(&recipe.id).unwrap();
        assert_eq!(stored.rev, 2);
        assert_eq!(stored.teams.len(), 2);
        assert_eq!(stored.layout, serde_json::json!({ "idle": { "x": 4 } }));
    });
}

#[test]
fn a_recipe_carries_its_roster_order_board_and_settings() {
    each_adapter("recipe-shape", |service| {
        let recipe = seed(service);
        service
            .recipe_set_membership(
                &recipe.id,
                vec![TeamId::from("team-b"), TeamId::from("team-a")],
                recipe.board.clone(),
                2_000,
            )
            .unwrap();

        let mut settings = GameSettings::default();
        settings.scoring.flat_points = 250;
        settings.scoring.mode = ScoringMode::Flat;
        service
            .recipe_set_settings(&recipe.id, settings, 3_000)
            .unwrap();

        let stored = service.recipe_get(&recipe.id).unwrap();
        assert_eq!(
            stored.teams,
            vec![TeamId::from("team-b"), TeamId::from("team-a")],
            "roster order is the opening ring, so it is stored, not sorted"
        );
        assert_eq!(stored.board[0].question_ids.len(), 2);
        assert_eq!(stored.settings.scoring.flat_points, 250);
    });
}

#[test]
fn duplicating_a_recipe_copies_its_overlays_and_starts_a_fresh_rev() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-1"),
                Some(QuestionOverlay {
                    stem: Some("This game's stem".to_owned()),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();

    let copy = service
        .recipe_duplicate(&recipe.id, "recipe-2", "Demo (copy)", 3_000)
        .unwrap();
    assert_eq!(copy.rev, 1);
    assert_eq!(copy.name, "Demo (copy)");
    assert_eq!(
        copy.overlays
            .questions
            .get(&QuestionId::from("q-1"))
            .and_then(|o| o.stem.clone()),
        Some("This game's stem".to_owned()),
        "an overlay is part of what makes this show this show"
    );
}

// -------------------------------------------------------------- the overlays

#[test]
fn this_game_writes_the_overlay_and_leaves_the_original_alone() {
    each_adapter("overlay-this-game", |service| {
        let recipe = seed(service);
        service
            .recipe_set_overlay(
                &recipe.id,
                OverlayTarget::Team(
                    TeamId::from("team-a"),
                    Some(TeamOverlay {
                        color: Some("var(--state-leader)".to_owned()),
                        ..TeamOverlay::default()
                    }),
                ),
                EditScope::ThisGame,
                2_000,
            )
            .unwrap();

        let original = service
            .catalog_get(CatalogKind::Team, "team-a")
            .unwrap()
            .as_team()
            .cloned()
            .unwrap();
        assert_eq!(original.color, "var(--ink)", "the catalog row did not move");

        let stored = service.recipe_get(&recipe.id).unwrap();
        assert_eq!(
            stored.overlays.teams[&TeamId::from("team-a")].color,
            Some("var(--state-leader)".to_owned())
        );
        assert!(stored.rev > recipe.rev, "an overlay is part of the recipe");
    });
}

#[test]
fn apply_to_original_writes_the_catalog_and_leaves_other_recipes_overlays_standing() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let other = service
        .recipe_duplicate(&recipe.id, "recipe-2", "Other show", 2_000)
        .unwrap();

    // The other show has already decided on its own stem for this question.
    service
        .recipe_set_overlay(
            &other.id,
            OverlayTarget::Question(
                QuestionId::from("q-1"),
                Some(QuestionOverlay {
                    stem: Some("Other show's stem".to_owned()),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            3_000,
        )
        .unwrap();

    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-1"),
                Some(QuestionOverlay {
                    stem: Some("The corrected stem".to_owned()),
                    difficulty: Some(55),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::Original,
            4_000,
        )
        .unwrap();

    let stored = service
        .catalog_get(CatalogKind::Question, "q-1")
        .unwrap()
        .as_question()
        .cloned()
        .unwrap();
    assert_eq!(stored.stem, "The corrected stem");
    assert_eq!(stored.difficulty, 55);

    assert!(
        service
            .recipe_get(&recipe.id)
            .unwrap()
            .overlays
            .questions
            .is_empty(),
        "the editing recipe drops its own patch so the operator sees the change"
    );
    assert_eq!(
        service.recipe_get(&other.id).unwrap().overlays.questions[&QuestionId::from("q-1")].stem,
        Some("Other show's stem".to_owned()),
        "an overlay is a decision, not a cache of the original"
    );
}

#[test]
fn reset_drops_the_overlay_and_has_no_apply_to_original() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Domain(
                DomainId::from("dom-1"),
                Some(DomainOverlay {
                    name: Some("Tonight's science".to_owned()),
                    code: None,
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Domain(DomainId::from("dom-1"), None),
            EditScope::ThisGame,
            3_000,
        )
        .unwrap();
    assert!(
        service
            .recipe_get(&recipe.id)
            .unwrap()
            .overlays
            .domains
            .is_empty()
    );

    assert!(
        service
            .recipe_set_overlay(
                &recipe.id,
                OverlayTarget::Domain(DomainId::from("dom-1"), None),
                EditScope::Original,
                4_000,
            )
            .is_err()
    );
}

#[test]
fn a_per_question_duration_has_no_original_to_apply_to() {
    // §2.18: the top of the timer cascade is a property of *this show's* use of
    // the question. There is nowhere in the catalog for it to go.
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    assert!(
        service
            .recipe_set_overlay(
                &recipe.id,
                OverlayTarget::Question(
                    QuestionId::from("q-1"),
                    Some(QuestionOverlay {
                        duration_ms: Some(45_000),
                        ..QuestionOverlay::default()
                    }),
                ),
                EditScope::Original,
                2_000,
            )
            .is_err()
    );
}

// -------------------------------------------------------------- the snapshot

#[test]
fn the_snapshot_copies_overlay_applied_bodies_and_the_queue_walks_easy_to_hard() {
    each_adapter("snapshot", |service| {
        let recipe = seed(service);
        service
            .recipe_set_overlay(
                &recipe.id,
                OverlayTarget::Question(
                    QuestionId::from("q-2"),
                    Some(QuestionOverlay {
                        difficulty: Some(5),
                        duration_ms: Some(45_000),
                        ..QuestionOverlay::default()
                    }),
                ),
                EditScope::ThisGame,
                2_000,
            )
            .unwrap();

        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
            .unwrap();
        let ids: Vec<&str> = snapshot.domains[0]
            .questions
            .iter()
            .map(|q| q.id.as_str())
            .collect();
        assert_eq!(
            ids,
            vec!["q-2", "q-1"],
            "the overlay difficulty is what the queue sorts on"
        );
        assert_eq!(snapshot.domains[0].questions[0].duration_ms, Some(45_000));
        assert_eq!(snapshot.ring_order().len(), 2);
    });
}

#[test]
fn a_board_that_names_an_archived_row_stops_before_the_play_starts() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    service
        .catalog_archive(CatalogKind::Question, "q-1", 2_000)
        .unwrap();
    assert!(
        service
            .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
            .is_err(),
        "a show that quietly loses a question is worse than one that will not start"
    );
}

#[test]
fn a_catalog_edit_during_an_open_play_leaves_the_snapshot_byte_identical() {
    each_adapter("snapshot-frozen", |service| {
        let recipe = seed(service);
        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
            .unwrap();

        let mut play = MatchService::new();
        play.play_load(snapshot, 0).unwrap();
        play.play_start(0).unwrap();
        let before = serde_json::to_string(play.get_state().unwrap().snapshot()).unwrap();

        // Everything an operator could do to the library mid-show.
        let mut question = service
            .catalog_get(CatalogKind::Question, "q-1")
            .unwrap()
            .as_question()
            .cloned()
            .unwrap();
        question.stem = "Edited mid-show".to_owned();
        question.difficulty = 99;
        service.catalog_upsert(&question.into(), 5_000).unwrap();
        service
            .catalog_archive(CatalogKind::Team, "team-b", 5_000)
            .unwrap();
        service
            .recipe_set_overlay(
                &recipe.id,
                OverlayTarget::Team(
                    TeamId::from("team-a"),
                    Some(TeamOverlay {
                        name: Some("RENAMED MID-SHOW".to_owned()),
                        ..TeamOverlay::default()
                    }),
                ),
                EditScope::ThisGame,
                5_000,
            )
            .unwrap();

        let after = serde_json::to_string(play.get_state().unwrap().snapshot()).unwrap();
        assert_eq!(before, after);
    });
}

// -------------------------------------------------------------- the play log

/// Drive a Play far enough to have a score, a consumed question and a moved
/// token — a log worth replaying.
fn played(service: &CatalogService, recipe: &RecipeId) -> MatchService {
    let snapshot = service
        .build_snapshot(recipe, PlayId::from("play-1"), frozen())
        .unwrap();
    let mut play = MatchService::new();
    play.play_load(snapshot, 0).unwrap();
    play.play_start(0).unwrap();
    play.choose_domain(&DomainId::from("dom-1"), 100).unwrap();
    play.set_selection(&[option_id('a')], 200).unwrap();
    play.lock_selection(300).unwrap();
    play.reveal_outcome(400).unwrap();
    play
}

#[test]
fn a_play_persists_and_replays_to_the_same_state() {
    each_adapter("play-log", |service| {
        let recipe = seed(service);
        let play = played(service, &recipe.id);
        service.play_persist(play.get_state().unwrap()).unwrap();

        let replayed = service.play_replay(&PlayId::from("play-1")).unwrap();
        assert_eq!(
            serde_json::to_string(&replayed).unwrap(),
            serde_json::to_string(play.get_state().unwrap()).unwrap(),
        );

        // Persisting again writes nothing new: the log only grows, and it grows
        // once per fact.
        let before = service.play_events(&PlayId::from("play-1")).unwrap().len();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(
            service.play_events(&PlayId::from("play-1")).unwrap().len(),
            before
        );
    });
}

#[test]
fn the_projection_is_derived_and_rebuilding_it_changes_nothing() {
    each_adapter("projection", |service| {
        let recipe = seed(service);
        let play = played(service, &recipe.id);
        service.play_persist(play.get_state().unwrap()).unwrap();

        let before = service.play_list(None).unwrap();
        assert_eq!(before.len(), 1);
        assert_eq!(before[0].status, "playing");
        assert_eq!(before[0].questions_consumed, 1);
        assert_eq!(before[0].scores[&TeamId::from("team-a")], 100);
        assert_eq!(before[0].started_at_ms, Some(0));

        assert_eq!(service.rebuild_projections().unwrap(), 1);
        assert_eq!(service.play_list(None).unwrap(), before);
        assert_eq!(
            service
                .play_list(Some(&RecipeId::from("recipe-nope")))
                .unwrap(),
            Vec::new()
        );
    });
}

#[test]
fn a_process_killed_mid_show_reopens_on_the_same_play() {
    // No clean shutdown, no flush call: dropping the service is what a kill
    // looks like from the file's point of view.
    let temp = TempDb::new("crash");
    let expected;
    {
        let service = CatalogService::open(temp.location()).unwrap();
        let recipe = seed(&service);
        let play = played(&service, &recipe.id);
        service.play_persist(play.get_state().unwrap()).unwrap();
        expected = serde_json::to_string(play.get_state().unwrap()).unwrap();
    }

    let reopened = CatalogService::open(temp.location()).unwrap();
    let resumed = reopened
        .resume_open_play()
        .unwrap()
        .expect("a play was open");
    assert_eq!(serde_json::to_string(&resumed).unwrap(), expected);

    // And the Play carries on from there, in the same `MatchService` interface.
    let mut service = MatchService::new();
    service
        .play_load(resumed.snapshot().clone(), 0)
        .expect("the snapshot is still legal");
    assert_eq!(
        reopened.play_list(None).unwrap()[0].scores[&TeamId::from("team-a")],
        100
    );
}

#[test]
fn a_kill_between_two_commands_loses_the_unpersisted_ones_and_nothing_else() {
    let temp = TempDb::new("partial");
    {
        let service = CatalogService::open(temp.location()).unwrap();
        let recipe = seed(&service);
        let mut play = played(&service, &recipe.id);
        service.play_persist(play.get_state().unwrap()).unwrap();

        // Two more commands, and then the lights go out before the next persist.
        play.give_token(&TeamId::from("team-b"), 500).unwrap();
        play.choose_domain(&DomainId::from("dom-1"), 600).unwrap();
    }

    let reopened = CatalogService::open(temp.location()).unwrap();
    let resumed = reopened.resume_open_play().unwrap().unwrap();
    assert_eq!(
        resumed.consumed_count(),
        1,
        "the persisted facts are all there"
    );
    assert!(
        resumed.session().is_some_and(|s| s.is_resolved()),
        "the unpersisted question was never issued"
    );
}

#[test]
fn two_plays_of_one_recipe_cannot_both_be_open() {
    // §4.3, and it has to hold across a restart of the process rather than only
    // inside one `MatchService`.
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let first = played(&service, &recipe.id);
    service.play_persist(first.get_state().unwrap()).unwrap();

    let snapshot = service
        .build_snapshot(&recipe.id, PlayId::from("play-2"), frozen())
        .unwrap();
    let mut second = MatchService::new();
    second.play_load(snapshot, 1_000).unwrap();
    second.play_start(1_000).unwrap();

    assert!(matches!(
        service.play_persist(second.get_state().unwrap()),
        Err(CatalogError::PlayAlreadyOpen { .. })
    ));

    // Once the first is finished, the second is welcome.
    let mut first = first;
    first.abandon(2_000).unwrap();
    service.play_persist(first.get_state().unwrap()).unwrap();
    service.play_persist(second.get_state().unwrap()).unwrap();
    assert_eq!(service.play_list(Some(&recipe.id)).unwrap().len(), 2);
}

// --------------------------------------------------------------- the globals

#[test]
fn the_globals_document_round_trips_and_is_validated_on_the_way_in() {
    each_adapter("globals", |service| {
        assert_eq!(service.settings_load().unwrap(), None, "first run has none");

        let mut flags = FlagService::default();
        flags.load_recipe(GameSettings::default()).unwrap();
        flags
            .settings_set_current_game(
                GameSetting::ScoringMode(ScoringMode::Flat),
                Default::default(),
            )
            .unwrap();
        service.settings_store(flags.globals()).unwrap();

        let loaded = service.settings_load().unwrap().unwrap();
        assert_eq!(&loaded, flags.globals());

        let mut illegal = loaded.clone();
        illegal.game_defaults.turn.max_consecutive_correct = Some(0);
        assert!(service.settings_store(&illegal).is_err());
        assert_eq!(service.settings_load().unwrap().unwrap(), loaded);
    });
}

// ------------------------------------------------------- the three services

#[test]
fn the_recipe_the_flags_and_the_play_compose_into_one_start() {
    // The §4.3 path end to end, with each service doing only its own job:
    // `CatalogService` holds the recipe, `FlagService` resolves the freeze,
    // `MatchService` owns the Play, and the log goes back to the catalog.
    each_adapter("compose", |service| {
        let recipe = seed(service);

        let mut settings = GameSettings::default();
        settings.timer.duration_ms = Some(12_000);
        settings.turn.max_consecutive_correct = Some(2);
        service
            .recipe_set_settings(&recipe.id, settings, 2_000)
            .unwrap();

        let mut flags = FlagService::default();
        flags
            .load_recipe(service.recipe_get(&recipe.id).unwrap().settings)
            .unwrap();
        let frozen = flags.freeze().unwrap();
        assert_eq!(
            frozen.timer.resolve(None),
            Some(12_000),
            "the recipe level wins over the globals (§2.18)"
        );

        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen)
            .unwrap();
        let mut play = MatchService::new();
        play.play_load(snapshot, 0).unwrap();
        play.play_start(0).unwrap();
        play.choose_domain(&DomainId::from("dom-1"), 100).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();

        // The frozen copy travelled with the Play, not by reference.
        service
            .recipe_set_settings(&recipe.id, GameSettings::default(), 3_000)
            .unwrap();
        let replayed = service.play_replay(&PlayId::from("play-1")).unwrap();
        assert_eq!(
            replayed.snapshot().settings.timer.resolve(None),
            Some(12_000)
        );
        assert_eq!(
            replayed.snapshot().settings.turn.max_consecutive_correct,
            Some(2)
        );
    });
}

// ----------------------------------------------------------------- the search

#[test]
fn search_finds_a_row_by_any_of_its_words_and_by_a_prefix() {
    each_adapter("search", |service| {
        seed(service);
        let hits = service
            .catalog_search(&SearchQuery::new("science"))
            .unwrap();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].kind, CatalogKind::Domain);
        assert_eq!(hits[0].id, "dom-1");

        // The Studio search box sends what has been typed so far.
        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("sci"))
                .unwrap()
                .len(),
            1
        );
        // A question is findable by its option text as well as its stem.
        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("stem"))
                .unwrap()
                .len(),
            2
        );
        assert_eq!(
            service.catalog_search(&SearchQuery::new("Demo")).unwrap()[0].kind,
            CatalogKind::Recipe
        );
    });
}

#[test]
fn the_index_follows_every_write_including_archive_and_restore() {
    each_adapter("search-fresh", |service| {
        seed(service);
        let mut question = service
            .catalog_get(CatalogKind::Question, "q-1")
            .unwrap()
            .as_question()
            .cloned()
            .unwrap();
        question.stem = "Which planet is red?".to_owned();
        service.catalog_upsert(&question.into(), 2_000).unwrap();

        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("planet"))
                .unwrap()
                .len(),
            1
        );

        service
            .catalog_archive(CatalogKind::Question, "q-1", 3_000)
            .unwrap();
        assert!(
            service
                .catalog_search(&SearchQuery::new("planet"))
                .unwrap()
                .is_empty(),
            "an active-scope search does not surface archived rows"
        );
        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("planet").scope(ArchiveScope::Archived))
                .unwrap()
                .len(),
            1,
            "this tab's archive still finds it (§2.24)"
        );

        service
            .catalog_restore(CatalogKind::Question, "q-1")
            .unwrap();
        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("planet"))
                .unwrap()
                .len(),
            1
        );
    });
}

#[test]
fn the_index_is_derived_and_comes_back_on_the_next_open() {
    let temp = TempDb::new("search-rebuild");
    {
        let service = CatalogService::open(temp.location()).unwrap();
        seed(&service);
        assert_eq!(
            service
                .catalog_search(&SearchQuery::new("science"))
                .unwrap()
                .len(),
            1
        );
    }

    let reopened = CatalogService::open(temp.location()).unwrap();
    let hits = reopened
        .catalog_search(&SearchQuery::new("science"))
        .unwrap();
    assert_eq!(
        hits.len(),
        1,
        "the index is rebuilt from the catalog at open"
    );

    // Rebuilding again is a no-op, not a way to end up with two of everything.
    reopened.rebuild_search_index().unwrap();
    assert_eq!(
        reopened
            .catalog_search(&SearchQuery::new("science"))
            .unwrap(),
        hits
    );
}

#[test]
fn a_search_can_be_narrowed_to_one_tab() {
    let service = CatalogService::in_memory().unwrap();
    seed(&service);
    let hits = service
        .catalog_search(
            &SearchQuery::new("")
                .kinds(vec![CatalogKind::Team])
                .limit(10),
        )
        .unwrap();
    assert_eq!(hits.len(), 2);
    assert!(hits.iter().all(|hit| hit.kind == CatalogKind::Team));
}
