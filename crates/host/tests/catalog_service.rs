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
    ChangeOp, Demo, Domain, DomainMember, DomainOverlay, EditScope, ImportCounts, Operator,
    OverlayTarget, Question, QuestionOption, QuestionOverlay, Recipe, SearchQuery, SeedMode, Team,
    TeamOverlay,
};
use questiongame_host::flags::{FlagService, GameSetting, GameSettings};
use questiongame_host::settings::{FrozenSettings, ScoringMode};
use questiongame_host::stats::{StatsFilter, StatsQuery};
use questiongame_host::{DomainId, MatchService, OperatorId, PlayId, QuestionId, RecipeId, TeamId};

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
            group_id: None,
        },
        DomainMember {
            question_id: QuestionId::from("q-2"),
            sort_key: 1,
            group_id: None,
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
        service
            .referenced_by(CatalogKind::Team, "team-a")
            .unwrap()
            .as_deref(),
        Some("the game Demo")
    );
    assert_eq!(
        service
            .referenced_by(CatalogKind::Domain, "dom-1")
            .unwrap()
            .as_deref(),
        Some("the game Demo")
    );
    assert_eq!(
        service
            .referenced_by(CatalogKind::Team, "team-nobody")
            .unwrap(),
        None
    );
}

#[test]
fn a_selection_is_asked_about_at_once_in_one_sentence() {
    let service = CatalogService::in_memory().unwrap();
    seed(&service);
    let ids: Vec<String> = (0..60)
        .map(|n| format!("team-none-{n}"))
        .chain(["team-a".to_owned()])
        .collect();
    // The used row is the 61st: a bulk archive past 50 rows still names its game.
    assert_eq!(
        service
            .referenced_by_many(CatalogKind::Team, &ids)
            .unwrap()
            .as_deref(),
        Some("the game Demo")
    );
    assert_eq!(
        service
            .referenced_by_many(CatalogKind::Team, &["team-nobody".to_owned()])
            .unwrap(),
        None
    );
}

#[test]
fn the_floor_is_refused_by_the_host_not_only_disabled_in_the_editor() {
    // §2.32: one option, or no correct mark, is an *incomplete* question — the
    // library stores it (see the P11.17 block below). What the host refuses
    // is the floor: a row that is nothing at all, or says something no edit
    // can mean.
    let service = CatalogService::in_memory().unwrap();
    let nothing = Question::new("q-x", "   ", 10);
    assert!(matches!(
        service.catalog_upsert(&nothing.into(), 0),
        Err(CatalogError::Invalid { .. })
    ));

    let blank_option = Question::new("q-y", "A blank option?", 10).with_options(vec![
        QuestionOption::new("opt-a", "A", true),
        QuestionOption::new("opt-b", "  ", false),
    ]);
    assert!(service.catalog_upsert(&blank_option.into(), 0).is_err());

    let mut out_of_range = question("q-z", 10);
    out_of_range.difficulty = Some(101);
    assert!(service.catalog_upsert(&out_of_range.into(), 0).is_err());

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
    assert_eq!(stored.difficulty, Some(55));

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

// ------------------------------------------- one question per difficulty (P11.13)

/// `seed` plus a third question in the same domain at the *same* difficulty as
/// `q-1`. The library is allowed to hold it; the board is not allowed to select
/// both.
fn seed_with_a_twin(service: &CatalogService) -> Recipe {
    let recipe = seed(service);
    service
        .catalog_upsert(&question("q-3", 10).into(), 1_000)
        .unwrap();
    let mut domain = match service.catalog_get(CatalogKind::Domain, "dom-1").unwrap() {
        questiongame_host::catalog::CatalogItem::Domain(domain) => *domain,
        other => panic!("expected a domain, got {other:?}"),
    };
    domain.questions.push(DomainMember {
        question_id: QuestionId::from("q-3"),
        sort_key: 2,
        group_id: None,
    });
    service.catalog_upsert(&domain.into(), 1_000).unwrap();
    recipe
}

#[test]
fn a_domain_may_hold_many_questions_at_one_difficulty_and_a_board_may_select_one() {
    each_adapter("one-per-difficulty", |service| {
        let recipe = seed_with_a_twin(service);
        let rev_before = service.recipe_get(&recipe.id).unwrap().rev;

        let error = service
            .recipe_set_membership(
                &recipe.id,
                recipe.teams.clone(),
                vec![BoardDomain {
                    domain_id: DomainId::from("dom-1"),
                    question_ids: vec![
                        QuestionId::from("q-1"),
                        QuestionId::from("q-2"),
                        QuestionId::from("q-3"),
                    ],
                }],
                2_000,
            )
            .unwrap_err();
        assert!(
            matches!(&error, CatalogError::Invalid { target_path, .. }
                if target_path == "recipe.recipe-1.board.dom-1.difficulty.10"),
            "expected the clash named, got {error:?}"
        );
        assert_eq!(
            service.recipe_get(&recipe.id).unwrap().rev,
            rev_before,
            "a refused write changes nothing"
        );

        // Swapping one for the other is the whole point of the rule.
        service
            .recipe_set_membership(
                &recipe.id,
                recipe.teams.clone(),
                vec![BoardDomain {
                    domain_id: DomainId::from("dom-1"),
                    question_ids: vec![QuestionId::from("q-3"), QuestionId::from("q-2")],
                }],
                3_000,
            )
            .unwrap();
    });
}

#[test]
fn a_difficulty_override_that_would_collide_is_refused_too() {
    // The checkbox is not the only door into the board's difficulties: the
    // inline override is the other one, and it does not go through
    // `recipe_upsert`.
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);

    let error = service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-2"),
                Some(QuestionOverlay {
                    difficulty: Some(10),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap_err();
    assert!(
        matches!(&error, CatalogError::Invalid { target_path, .. }
            if target_path == "recipe.recipe-1.board.dom-1.difficulty.10"),
        "expected the clash named, got {error:?}"
    );
    assert!(
        service
            .recipe_get(&recipe.id)
            .unwrap()
            .overlays
            .questions
            .is_empty(),
        "a refused overlay is not written"
    );
}

#[test]
fn applying_a_difficulty_to_the_original_is_refused_on_the_same_rule() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);

    let error = service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-2"),
                Some(QuestionOverlay {
                    difficulty: Some(10),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::Original,
            2_000,
        )
        .unwrap_err();
    assert!(
        matches!(&error, CatalogError::Invalid { target_path, .. }
            if target_path == "recipe.recipe-1.board.dom-1.difficulty.10"),
        "expected the clash named, got {error:?}"
    );
    let question = match service.catalog_get(CatalogKind::Question, "q-2").unwrap() {
        questiongame_host::catalog::CatalogItem::Question(question) => *question,
        other => panic!("expected a question, got {other:?}"),
    };
    assert_eq!(
        question.difficulty,
        Some(20),
        "the catalog row is untouched"
    );
}

// ------------------------------- repeated difficulties, when the game allows (P12.7)

fn allow_repeats(
    service: &CatalogService,
    recipe: &Recipe,
    allow: bool,
) -> Result<(), CatalogError> {
    let mut settings = service.recipe_get(&recipe.id).unwrap().settings;
    settings.board.allow_repeated_difficulty = allow;
    service
        .recipe_set_settings(&recipe.id, settings, 1_500)
        .map(|_| ())
}

fn board_of_all_three() -> Vec<BoardDomain> {
    vec![BoardDomain {
        domain_id: DomainId::from("dom-1"),
        question_ids: vec![
            QuestionId::from("q-1"),
            QuestionId::from("q-2"),
            QuestionId::from("q-3"),
        ],
    }]
}

#[test]
fn a_board_may_repeat_a_difficulty_when_the_game_allows_it() {
    each_adapter("repeats-allowed", |service| {
        let recipe = seed_with_a_twin(service);
        allow_repeats(service, &recipe, true).unwrap();
        service
            .recipe_set_membership(
                &recipe.id,
                recipe.teams.clone(),
                board_of_all_three(),
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
            vec!["q-1", "q-3", "q-2"],
            "two at one difficulty are asked one after the other, lower id first"
        );
    });
}

#[test]
fn turning_the_switch_off_on_a_repeating_board_is_refused() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed_with_a_twin(&service);
    allow_repeats(&service, &recipe, true).unwrap();
    service
        .recipe_set_membership(
            &recipe.id,
            recipe.teams.clone(),
            board_of_all_three(),
            2_000,
        )
        .unwrap();
    let rev_before = service.recipe_get(&recipe.id).unwrap().rev;

    let error = allow_repeats(&service, &recipe, false).unwrap_err();
    assert!(
        matches!(&error, CatalogError::Invalid { target_path, .. }
            if target_path == "recipe.recipe-1.board.dom-1.difficulty.10"),
        "expected the clash named, got {error:?}"
    );
    let after = service.recipe_get(&recipe.id).unwrap();
    assert_eq!(after.rev, rev_before, "a refused write changes nothing");
    assert!(after.settings.board.allow_repeated_difficulty);
}

#[test]
fn a_this_game_override_may_repeat_a_difficulty_when_allowed() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    allow_repeats(&service, &recipe, true).unwrap();
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-2"),
                Some(QuestionOverlay {
                    difficulty: Some(10),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();
}

#[test]
fn a_recipe_written_before_the_switch_existed_reads_it_as_off() {
    let json = serde_json::to_value(GameSettings::default()).unwrap();
    let mut old = json.as_object().unwrap().clone();
    old.remove("board");
    let settings: GameSettings = serde_json::from_value(old.into()).unwrap();
    assert!(!settings.board.allow_repeated_difficulty);
}

#[test]
fn a_difficulty_override_on_a_question_the_board_does_not_hold_is_none_of_the_rules_business() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed_with_a_twin(&service);

    // `q-3` is a member of the domain but is not on the board, so it may sit
    // at `q-1`'s difficulty for as long as it likes.
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-3"),
                Some(QuestionOverlay {
                    difficulty: Some(10),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();
}

// ------------------------------------------- incomplete questions (P11.17)

#[test]
fn an_unset_difficulty_round_trips_on_both_adapters() {
    each_adapter("no-difficulty", |service| {
        let mut open = question("q-open", 10);
        open.difficulty = None;
        service.catalog_upsert(&open.into(), 1_000).unwrap();
        let stored = service
            .catalog_get(CatalogKind::Question, "q-open")
            .unwrap();
        assert_eq!(stored.as_question().unwrap().difficulty, None);
        assert!(
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::Active)
                .unwrap()
                .iter()
                .any(|item| item.id() == "q-open"),
            "an incomplete question lists like any other"
        );
    });
}

#[test]
fn the_library_stores_an_incomplete_question_and_refuses_an_empty_one() {
    each_adapter("floor", |service| {
        service
            .catalog_upsert(&Question::new("q-stem", "Only a stem?", 10).into(), 1_000)
            .unwrap();
        let nothing = Question::new("q-nothing", "   ", 10);
        assert!(matches!(
            service.catalog_upsert(&nothing.into(), 1_000),
            Err(CatalogError::Invalid { .. })
        ));
    });
}

/// `seed` plus `q-open`, a member of `dom-1` with no difficulty — in the
/// library, not on the board.
fn seed_with_an_incomplete_member(service: &CatalogService) -> Recipe {
    let recipe = seed(service);
    let mut open = question("q-open", 30);
    open.difficulty = None;
    service.catalog_upsert(&open.into(), 1_000).unwrap();
    let mut domain = match service.catalog_get(CatalogKind::Domain, "dom-1").unwrap() {
        questiongame_host::catalog::CatalogItem::Domain(domain) => *domain,
        other => panic!("expected a domain, got {other:?}"),
    };
    domain.questions.push(DomainMember {
        question_id: QuestionId::from("q-open"),
        sort_key: 2,
        group_id: None,
    });
    service.catalog_upsert(&domain.into(), 1_000).unwrap();
    recipe
}

/// A board of `dom-1` holding exactly these questions.
fn dom_1(ids: &[&str]) -> Vec<BoardDomain> {
    vec![BoardDomain {
        domain_id: DomainId::from("dom-1"),
        question_ids: ids.iter().map(|id| QuestionId::from(*id)).collect(),
    }]
}

#[test]
fn a_board_cannot_select_an_incomplete_question() {
    each_adapter("incomplete-board", |service| {
        let recipe = seed_with_an_incomplete_member(service);
        let rev = service.recipe_get(&recipe.id).unwrap().rev;
        let error = service
            .recipe_set_membership(
                &recipe.id,
                recipe.teams.clone(),
                dom_1(&["q-1", "q-2", "q-open"]),
                2_000,
            )
            .unwrap_err();
        assert!(
            matches!(&error, CatalogError::Invalid { target_path, .. }
                if target_path == "recipe.recipe-1.board.dom-1.question.q-open"),
            "expected the question named, got {error:?}"
        );
        assert_eq!(
            service.recipe_get(&recipe.id).unwrap().rev,
            rev,
            "a refused write changes nothing"
        );
    });
}

#[test]
fn a_this_game_difficulty_completes_a_question_for_this_show_only() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed_with_an_incomplete_member(&service);
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-open"),
                Some(QuestionOverlay {
                    difficulty: Some(30),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();
    service
        .recipe_set_membership(
            &recipe.id,
            recipe.teams.clone(),
            dom_1(&["q-1", "q-2", "q-open"]),
            3_000,
        )
        .unwrap();
    let snapshot = service
        .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
        .unwrap();
    assert_eq!(snapshot.total_questions(), 3);
    let open = service
        .catalog_get(CatalogKind::Question, "q-open")
        .unwrap();
    assert_eq!(
        open.as_question().unwrap().difficulty,
        None,
        "the library row is still incomplete"
    );
}

#[test]
fn an_original_edit_that_empties_the_correct_marks_is_refused_while_the_board_holds_it() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let error = service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(
                QuestionId::from("q-1"),
                Some(QuestionOverlay {
                    options: Some(vec![
                        QuestionOption::new("x", "X", false),
                        QuestionOption::new("y", "Y", false),
                    ]),
                    ..QuestionOverlay::default()
                }),
            ),
            EditScope::Original,
            2_000,
        )
        .unwrap_err();
    assert!(
        matches!(&error, CatalogError::Invalid { target_path, .. }
            if target_path == "recipe.recipe-1.board.dom-1.question.q-1"),
        "got {error:?}"
    );
    let stored = service.catalog_get(CatalogKind::Question, "q-1").unwrap();
    assert!(
        stored.as_question().unwrap().options[0].correct,
        "the catalog row is untouched"
    );
}

#[test]
fn a_question_made_incomplete_in_the_library_stops_load_and_the_preview_counts_it() {
    each_adapter("incomplete-load", |service| {
        let recipe = seed(service);
        let mut q = service
            .catalog_get(CatalogKind::Question, "q-2")
            .unwrap()
            .as_question()
            .cloned()
            .unwrap();
        q.difficulty = None;
        // The library does not veto an edit on a recipe's behalf (§2.31).
        service.catalog_upsert(&q.into(), 2_000).unwrap();

        let error = service
            .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
            .unwrap_err();
        assert!(
            matches!(&error, CatalogError::Invalid { target_path, .. }
                if target_path == "recipe.recipe-1.board.dom-1.question.q-2"),
            "got {error:?}"
        );
        let board = service.preview_board(&recipe.id).unwrap();
        assert_eq!(board.domains[0].questions.len(), 1);
        assert_eq!(board.domains[0].incomplete, 1);
    });
}

// --------------------------------------------------------- two Demos (P11.17)

#[test]
fn the_two_demos_are_restored_and_counted_apart() {
    let service = CatalogService::in_memory().unwrap();
    service
        .seed_demo(Demo::Ro, SeedMode::Missing, GameSettings::default(), 1_000)
        .unwrap();
    let ro = service
        .seed_status(Demo::Ro, GameSettings::default())
        .unwrap();
    assert_eq!((ro.present, ro.missing, ro.edited), (23, 0, 0));
    let en = service
        .seed_status(Demo::En, GameSettings::default())
        .unwrap();
    assert_eq!((en.present, en.missing), (0, 11));

    service
        .seed_demo(
            Demo::En,
            SeedMode::Overwrite,
            GameSettings::default(),
            2_000,
        )
        .unwrap();
    let ro = service
        .seed_status(Demo::Ro, GameSettings::default())
        .unwrap();
    assert_eq!(
        (ro.present, ro.edited),
        (23, 0),
        "restoring English does not touch a Romanian row"
    );
    let snapshot = service
        .build_snapshot(
            &RecipeId::from("seed-recipe-demo-ro"),
            PlayId::from("play-ro"),
            frozen(),
        )
        .unwrap();
    assert_eq!(snapshot.total_questions(), 15);
}

// ------------------------------------------------------------ import (P11.17)

#[test]
fn an_import_preview_writes_nothing_and_the_commit_writes_what_it_showed() {
    each_adapter("import", |service| {
        seed(service);
        let text = r#"{ "format": "questiongame.questions", "version": 1, "questions": [
            { "question": "Capitala Australiei?",
              "options": [{ "text": "Canberra", "correct": true }, "Sydney"],
              "difficulty": 50, "domains": ["Science"] },
            { "question": "Doar textul?" },
            { "question": "Domeniu nou?", "options": ["A", "B"], "domains": ["Istorie"] },
            { "difficulty": 10 }
        ] }"#;
        let active = |service: &CatalogService| {
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::Active)
                .unwrap()
                .len()
        };
        let before = active(service);

        let (preview, changes) = service.import_questions(text, false, None, 2_000).unwrap();
        assert!(!preview.committed);
        assert!(changes.is_empty());
        assert_eq!(active(service), before, "a preview writes nothing");

        let (report, changes) = service.import_questions(text, true, None, 3_000).unwrap();
        assert!(report.committed);
        assert_eq!(
            report.rows, preview.rows,
            "the commit is the plan the preview showed"
        );
        assert_eq!(
            report.counts,
            ImportCounts {
                complete: 1,
                incomplete: 2,
                duplicate: 0,
                rejected: 1,
                skipped: 0,
            }
        );
        assert_eq!(active(service), before + 3);
        assert!(!changes.is_empty());

        let science = service
            .catalog_get(CatalogKind::Domain, "dom-1")
            .unwrap()
            .as_domain()
            .cloned()
            .unwrap();
        assert_eq!(
            science.questions.len(),
            3,
            "appended to the existing domain"
        );
        let istorie = service
            .catalog_list(CatalogKind::Domain, ArchiveScope::Active)
            .unwrap()
            .into_iter()
            .filter_map(|item| item.as_domain().cloned())
            .find(|d| d.name == "Istorie")
            .expect("a new domain");
        assert_eq!(istorie.questions.len(), 1);
    });
}

#[test]
fn importing_the_same_file_twice_imports_it_once() {
    let service = CatalogService::in_memory().unwrap();
    let text = r#"[ { "question": "Q?", "options": ["A", { "text": "B", "correct": true }] } ]"#;
    service.import_questions(text, true, None, 1_000).unwrap();
    let (again, changes) = service.import_questions(text, true, None, 2_000).unwrap();
    assert_eq!(again.counts.duplicate, 1);
    assert!(changes.is_empty(), "nothing to write, nothing to announce");
    assert_eq!(
        service
            .catalog_list(CatalogKind::Question, ArchiveScope::Active)
            .unwrap()
            .len(),
        1
    );
}

#[test]
fn a_file_the_import_cannot_read_is_refused_and_writes_nothing() {
    let service = CatalogService::in_memory().unwrap();
    let error = service
        .import_questions(
            "{ \"questions\": [ { \"question\": \"Q?\" } ",
            true,
            None,
            1_000,
        )
        .unwrap_err();
    assert!(error.to_string().starts_with("import: "), "{error}");
    assert!(
        service
            .catalog_list(CatalogKind::Question, ArchiveScope::All)
            .unwrap()
            .is_empty()
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
        question.difficulty = Some(99);
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

/// §12.1: "Plays run" on an operator's card. The number was a stored counter
/// nothing ever incremented, so it read 0 for an operator who had run a dozen
/// shows. It is now a count over the `plays` projection, keyed by the
/// `OperatorSwitched` the app appends at `play_load` — which means it survives
/// a projection rebuild, and a Play that was loaded but never started is not
/// one anybody ran.
#[test]
fn a_team_counts_the_plays_the_log_says_it_played() {
    each_adapter("team-plays", |service| {
        let recipe = seed(service);
        // In the library, on no roster — the count is participation, not
        // existence.
        service
            .catalog_upsert(&team("team-c").into(), 1_000)
            .unwrap();

        let read = |service: &CatalogService, id: &str| {
            let row = service.catalog_get(CatalogKind::Team, id).unwrap();
            let team = row.as_team().unwrap().clone();
            (team.play_count, team.last_play_at)
        };
        assert_eq!(
            read(service, "team-a"),
            (0, None),
            "nothing has been played"
        );

        // Loaded but never started: a game put down before it began is not a
        // Play anyone played, the same rule the operator count keeps.
        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-loaded"), frozen())
            .unwrap();
        let mut play = MatchService::new();
        play.play_load(snapshot, 0).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(read(service, "team-a"), (0, None));

        play.play_start(10_000).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(read(service, "team-a"), (1, Some(10_000)));
        assert_eq!(
            read(service, "team-b"),
            (1, Some(10_000)),
            "the whole roster"
        );
        assert_eq!(
            read(service, "team-c"),
            (0, None),
            "a team that was not in the Play did not play"
        );

        // Derived, not stored: throw the projection away and rebuild it from
        // the log, and the number is the same.
        service.rebuild_projections().unwrap();
        assert_eq!(read(service, "team-a"), (1, Some(10_000)));

        // A rename does not touch it — `catalog_upsert` writes the row the
        // editor sent, and the count is not on that row.
        let mut renamed = team("team-a");
        renamed.name = "The Reds".to_owned();
        service.catalog_upsert(&renamed.into(), 2_000).unwrap();
        assert_eq!(read(service, "team-a"), (1, Some(10_000)));

        // A second show: the count grows and the last play is the later one.
        // The first has to be closed — two Plays of one recipe cannot both be
        // open — and an abandoned Play still happened.
        play.abandon(15_000).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(read(service, "team-a"), (1, Some(10_000)));

        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-2"), frozen())
            .unwrap();
        let mut play = MatchService::new();
        play.play_load(snapshot, 20_000).unwrap();
        play.play_start(20_000).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(read(service, "team-a"), (2, Some(20_000)));
    });
}

#[test]
fn an_operator_counts_the_plays_the_log_says_they_ran() {
    each_adapter("operator-plays", |service| {
        let recipe = seed(service);
        service
            .catalog_upsert(&Operator::new("op-andy", "Andy").into(), 1_000)
            .unwrap();

        let count = |service: &CatalogService| {
            service
                .catalog_get(CatalogKind::Operator, "op-andy")
                .unwrap()
                .as_operator()
                .unwrap()
                .plays_run
        };
        assert_eq!(count(service), 0, "nothing has been run yet");

        // Loaded, with an operator at the keyboard, but not started.
        let snapshot = service
            .build_snapshot(&recipe.id, PlayId::from("play-loaded"), frozen())
            .unwrap();
        let mut play = MatchService::new();
        play.play_load(snapshot, 0).unwrap();
        play.operator_switched(OperatorId::from("op-andy"), 0)
            .unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(count(service), 0, "a game put down before it began");

        play.play_start(10).unwrap();
        service.play_persist(play.get_state().unwrap()).unwrap();
        assert_eq!(count(service), 1);
        assert_eq!(
            service.play_list(None).unwrap()[0].operator_id,
            Some(OperatorId::from("op-andy")),
            "the projection carries who ran it"
        );

        // Derived, not stored: throwing the projection away and rebuilding it
        // from the log lands on the same number.
        assert_eq!(service.rebuild_projections().unwrap(), 1);
        assert_eq!(count(service), 1);

        // A rename does not touch it — `catalog_upsert` writes the row the
        // editor sent, and the count is not on that row.
        service
            .catalog_upsert(&Operator::new("op-andy", "Andy M.").into(), 2_000)
            .unwrap();
        assert_eq!(count(service), 1);
    });
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

/// P11 exit criterion, the host half: `stats_query` reads the logs and
/// answers; nothing about it can write, and the numbers are the Play's own.
#[test]
fn stats_query_reads_the_logs_and_writes_nothing() {
    each_adapter("stats", |service| {
        let recipe = seed(service);
        let play = played(service, &recipe.id);
        service.play_persist(play.get_state().unwrap()).unwrap();

        let before = service.play_events(&PlayId::from("play-1")).unwrap().len();
        let result = service.stats_query(&StatsQuery::default()).unwrap();
        assert_eq!(
            service.play_events(&PlayId::from("play-1")).unwrap().len(),
            before,
            "a query grew the log"
        );

        // One resolved turn, and it is the one the scoreboard shows.
        assert_eq!(result.turn_count, 1);
        assert_eq!(result.play_count, 1);
        let row = result
            .rows
            .iter()
            .find(|row| row.key == "team-a")
            .expect("the team that answered");
        assert_eq!(row.label, "TEAM team-a");
        assert_eq!(row.values[0], Some(1.0), "turns");
        assert_eq!(row.values[3], Some(100.0), "points, as in the projection");
        assert_eq!(
            service.play_list(None).unwrap()[0].scores[&TeamId::from("team-a")],
            100,
            "the projection and the statistics agree"
        );

        // §12: renaming the team renames the row, without touching the log.
        let mut renamed = team("team-a");
        renamed.name = "The Reds".to_owned();
        service.catalog_upsert(&renamed.into(), 2_000).unwrap();
        let after = service.stats_query(&StatsQuery::default()).unwrap();
        assert_eq!(
            after.rows.iter().find(|r| r.key == "team-a").unwrap().label,
            "The Reds"
        );

        // A filter that names a Play reads only that Play's log.
        let elsewhere = StatsQuery {
            filter: StatsFilter {
                play_ids: vec![PlayId::from("play-none")],
                ..StatsFilter::default()
            },
            ..StatsQuery::default()
        };
        assert_eq!(service.stats_query(&elsewhere).unwrap().turn_count, 0);
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

    // And the Play carries on from there — `adopt` is the boot path, and it
    // keeps the score the log earned rather than reloading an empty snapshot.
    let mut service = MatchService::new();
    service.adopt(resumed).expect("the snapshot is still legal");
    assert_eq!(
        service.get_state().unwrap().score(&TeamId::from("team-a")),
        100,
        "boot loses nothing",
    );
    assert!(service.can_undo(), "the Timeline reaches the resumed turn");
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

// ---------------------------------------------------------------------- bulk

/// §2.19: a bulk edit gets one confirm, so it gets one transaction. These
/// assert the *atomicity* the batching buys; the fsync it saves is why it
/// exists (one ~2.5 ms commit for the batch instead of one per row).
#[test]
fn a_bulk_upsert_is_one_transaction_and_an_illegal_row_writes_none_of_it() {
    each_adapter("bulk-upsert", |service| {
        let good: Vec<_> = (0..5)
            .map(|i| question(&format!("q-bulk-{i}"), 10).into())
            .collect();
        let changes = service.catalog_upsert_many(&good, 1_000).unwrap();
        assert_eq!(changes.len(), 5);
        assert!(changes.iter().all(|c| c.op == ChangeOp::Upserted));
        assert_eq!(
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::Active)
                .unwrap()
                .len(),
            5,
        );

        // One bad row at the end: nothing before it lands either.
        let mut broken: Vec<_> = (5..8)
            .map(|i| question(&format!("q-bulk-{i}"), 10).into())
            .collect();
        // Neither a stem nor an option: below the §2.32 floor.
        broken.push(Question::new("q-bulk-bad", "   ", 10).into());
        assert!(service.catalog_upsert_many(&broken, 2_000).is_err());
        assert_eq!(
            service
                .catalog_list(CatalogKind::Question, ArchiveScope::Active)
                .unwrap()
                .len(),
            5,
            "a refused batch is a batch that never started",
        );
    });
}

#[test]
fn a_bulk_archive_is_all_or_nothing_and_restores_the_same_way() {
    each_adapter("bulk-archive", |service| {
        let ids: Vec<String> = (0..4).map(|i| format!("t-bulk-{i}")).collect();
        let teams: Vec<_> = ids.iter().map(|id| team(id).into()).collect();
        service.catalog_upsert_many(&teams, 1_000).unwrap();

        // One id that is not there aborts the batch before anything moves.
        let mut with_ghost = ids.clone();
        with_ghost.push("t-bulk-ghost".to_owned());
        assert!(matches!(
            service.catalog_archive_many(CatalogKind::Team, &with_ghost, 2_000),
            Err(CatalogError::NotFound { .. }),
        ));
        assert_eq!(
            service
                .catalog_list(CatalogKind::Team, ArchiveScope::Archived)
                .unwrap()
                .len(),
            0,
            "nothing was archived",
        );

        let changes = service
            .catalog_archive_many(CatalogKind::Team, &ids, 3_000)
            .unwrap();
        assert_eq!(changes.len(), 4);
        assert_eq!(
            service
                .catalog_list(CatalogKind::Team, ArchiveScope::Archived)
                .unwrap()
                .len(),
            4,
        );

        // And the search index follows the batch, not the singular path.
        let hits = service
            .catalog_search(&SearchQuery::new("bulk").kinds(vec![CatalogKind::Team]))
            .unwrap();
        assert!(
            hits.is_empty(),
            "archived rows leave the default search scope",
        );

        service
            .catalog_restore_many(CatalogKind::Team, &ids)
            .unwrap();
        assert_eq!(
            service
                .catalog_list(CatalogKind::Team, ArchiveScope::Active)
                .unwrap()
                .len(),
            4,
        );
    });
}

// ------------------------------------------------------------------- beta.4

#[test]
fn an_archived_team_on_the_roster_is_refused_at_load_and_said_in_the_preview() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    service
        .catalog_archive(CatalogKind::Team, "team-b", 2_000)
        .unwrap();
    let err = service
        .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
        .unwrap_err()
        .to_string();
    assert!(err.contains("recipe.recipe-1.roster.team.team-b"), "{err}");
    assert!(err.contains("archived team"), "{err}");
    assert_eq!(
        service.archived_on_game(&recipe.id).unwrap().teams,
        ["TEAM team-b"]
    );
    service
        .catalog_restore(CatalogKind::Team, "team-b")
        .unwrap();
    service
        .build_snapshot(&recipe.id, PlayId::from("play-1"), frozen())
        .expect("restored, it loads");
    assert!(service.archived_on_game(&recipe.id).unwrap().is_empty());
}

#[test]
fn the_preview_names_an_archived_domain_and_question_on_the_board() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    service
        .catalog_archive(CatalogKind::Question, "q-2", 2_000)
        .unwrap();
    service
        .catalog_archive(CatalogKind::Domain, "dom-1", 2_000)
        .unwrap();
    let names = service.archived_on_game(&recipe.id).unwrap();
    assert_eq!(names.domains, ["Science"]);
    assert_eq!(names.questions, ["Stem of q-2?"]);
    assert!(names.teams.is_empty());
}

#[test]
fn apply_to_original_also_updates_the_copies_when_asked() {
    use questiongame_host::catalog::{CopyOptions, Selection};
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let b = service.workspace_create("B", None, 1_000).unwrap().id;
    let copied = service
        .catalog_copy_to(
            &Selection {
                questions: vec![QuestionId::from("q-1")],
                ..Selection::default()
            },
            &b,
            CopyOptions::default(),
            1_000,
        )
        .unwrap();
    let there = copied
        .created
        .iter()
        .find(|t| t.from == "q-1")
        .unwrap()
        .id
        .clone();
    let patch = |d| {
        OverlayTarget::Question(
            QuestionId::from("q-1"),
            Some(QuestionOverlay {
                difficulty: Some(d),
                ..QuestionOverlay::default()
            }),
        )
    };
    let difficulty_there = |service: &CatalogService| {
        let here = service.current_workspace();
        service.workspace_switch(&b).unwrap();
        let d = match service.catalog_get(CatalogKind::Question, &there).unwrap() {
            questiongame_host::catalog::CatalogItem::Question(q) => q.difficulty,
            other => panic!("{other:?}"),
        };
        service.workspace_switch(&here).unwrap();
        d
    };
    // Here only: the copy keeps its difficulty.
    service
        .recipe_set_overlay_with(&recipe.id, patch(15), EditScope::Original, false, 2_000)
        .unwrap();
    assert_eq!(difficulty_there(&service), Some(10));
    // With the copies: it follows, and the change names it.
    let (_, copies) = service
        .recipe_set_overlay_with(&recipe.id, patch(16), EditScope::Original, true, 3_000)
        .unwrap();
    assert_eq!(
        copies.iter().map(|c| c.id.as_str()).collect::<Vec<_>>(),
        [there.as_str()]
    );
    assert_eq!(difficulty_there(&service), Some(16));
    assert!(
        service
            .recipe_get(&recipe.id)
            .unwrap()
            .overlays
            .questions
            .is_empty()
    );
}

#[test]
fn apply_to_original_keeps_the_rest_of_this_games_overlay() {
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let both = QuestionOverlay {
        stem: Some("This show's words?".into()),
        difficulty: Some(15),
        ..QuestionOverlay::default()
    };
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(QuestionId::from("q-1"), Some(both)),
            EditScope::ThisGame,
            2_000,
        )
        .unwrap();
    let difficulty = QuestionOverlay {
        difficulty: Some(15),
        ..QuestionOverlay::default()
    };
    service
        .recipe_set_overlay(
            &recipe.id,
            OverlayTarget::Question(QuestionId::from("q-1"), Some(difficulty)),
            EditScope::Original,
            3_000,
        )
        .unwrap();
    let left = service
        .recipe_get(&recipe.id)
        .unwrap()
        .overlays
        .questions
        .get(&QuestionId::from("q-1"))
        .cloned();
    assert_eq!(
        left,
        Some(QuestionOverlay {
            stem: Some("This show's words?".into()),
            ..QuestionOverlay::default()
        })
    );
}

#[test]
fn apply_to_original_refused_by_the_board_writes_no_copy() {
    use questiongame_host::catalog::{CopyOptions, Selection};
    let service = CatalogService::in_memory().unwrap();
    let recipe = seed(&service);
    let b = service.workspace_create("B", None, 1_000).unwrap().id;
    let copied = service
        .catalog_copy_to(
            &Selection {
                questions: vec![QuestionId::from("q-1")],
                ..Selection::default()
            },
            &b,
            CopyOptions::default(),
            1_000,
        )
        .unwrap();
    let there = copied
        .created
        .iter()
        .find(|t| t.from == "q-1")
        .unwrap()
        .id
        .clone();
    // q-2 is 20: q-1 at 20 as well puts two at one difficulty on the board.
    let clash = OverlayTarget::Question(
        QuestionId::from("q-1"),
        Some(QuestionOverlay {
            difficulty: Some(20),
            ..QuestionOverlay::default()
        }),
    );
    assert!(
        service
            .recipe_set_overlay_with(&recipe.id, clash, EditScope::Original, true, 2_000)
            .is_err()
    );
    service.workspace_switch(&b).unwrap();
    match service.catalog_get(CatalogKind::Question, &there).unwrap() {
        questiongame_host::catalog::CatalogItem::Question(q) => assert_eq!(q.difficulty, Some(10)),
        other => panic!("{other:?}"),
    }
}
