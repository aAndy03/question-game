//! Building the §4.3 snapshot: catalog bodies with the recipe's overlays
//! already applied.
//!
//! This is where §2.17's "Play snapshot copies **overlay-applied** bodies"
//! becomes code, and it is a pure function on purpose — no connection, no
//! service — so the overlay rules can be tested without a database and the
//! answer cannot depend on query order.
//!
//! The resolution order is one line long: **overlay if set, else catalog**.
//! There is no third level. The timer cascade (§2.18) *is* three-level, but its
//! top level is the question overlay's `duration_ms`, which this module reads
//! and hands to the snapshot; the other two levels are `FrozenSettings`, and
//! `FlagService` resolved them before this ran.

use std::collections::BTreeMap;

use crate::ids::{DomainId, PlayId, QuestionId, TeamId};
use crate::settings::FrozenSettings;
use crate::snapshot::{
    PlaySnapshot, SnapshotDomain, SnapshotOption, SnapshotQuestion, SnapshotTeam,
};

use super::complete;
use super::error::{CatalogError, CatalogResult};
use super::model::{Domain, Question, Recipe, Team};

/// Every catalog row the recipe names, already fetched. Keyed rather than
/// listed, because the board is the thing that decides what is on the board.
pub(super) struct Bodies {
    pub teams: BTreeMap<TeamId, Team>,
    pub domains: BTreeMap<DomainId, Domain>,
    pub questions: BTreeMap<QuestionId, Question>,
}

/// The §4.3 copy. Steps 1–7 in order; the Play does 8 and 9.
///
/// An archived row still on the board is refused rather than silently dropped:
/// a show that quietly loses a question is worse than one that will not start
/// until the operator has looked at it (§11.B, the Shape manager's job).
///
/// An empty roster or an empty board is refused here too, with a `target_path`
/// that points at the Game section to fix (§12.4 `play.roster_empty` /
/// `play.board_empty`). `MatchService::play_start` keeps its own `BoardEmpty`
/// as the second line; this is the first, and it lands on the operator's
/// screen before a Stage window is created for nothing.
pub(super) fn build(
    recipe: &Recipe,
    bodies: &Bodies,
    play_id: PlayId,
    settings: FrozenSettings,
) -> CatalogResult<PlaySnapshot> {
    if recipe.teams.is_empty() {
        return Err(CatalogError::invalid(
            format!("recipe.{}.roster", recipe.id),
            "the roster is empty",
        ));
    }
    if recipe
        .board
        .iter()
        .all(|board| board.question_ids.is_empty())
    {
        return Err(CatalogError::invalid(
            format!("recipe.{}.board", recipe.id),
            "the board has no questions",
        ));
    }

    // 1. Participating teams, display fields only, in roster order.
    let teams = recipe
        .teams
        .iter()
        .map(|id| {
            let team = bodies
                .teams
                .get(id)
                .ok_or_else(|| missing("team", &recipe.id, id.as_str()))?;
            // beta.4: as an archived domain or question already was.
            if team.stamps.is_archived() {
                return Err(CatalogError::Refused {
                    target_path: format!("recipe.{}.roster.team.{id}", recipe.id),
                    reason: format!(
                        "the roster has the archived team {}; restore it or take it off the roster",
                        team.name
                    ),
                });
            }
            let overlay = recipe.overlays.teams.get(id);
            Ok(SnapshotTeam {
                id: id.clone(),
                name: pick(overlay.and_then(|o| o.name.clone()), &team.name),
                short_code: pick(overlay.and_then(|o| o.short_code.clone()), &team.short_code),
                color: pick(overlay.and_then(|o| o.color.clone()), &team.color),
                logo_url: overlay
                    .and_then(|o| o.logo_asset_id.clone())
                    .or_else(|| team.logo_asset_id.clone())
                    .map(|asset| asset.to_string()),
                detail: team.notes.clone(),
            })
        })
        .collect::<CatalogResult<Vec<_>>>()?;

    // 2–5. Question bodies, overlays applied, then the per-domain queues.
    let domains = recipe
        .board
        .iter()
        .map(|board| {
            let domain = bodies
                .domains
                .get(&board.domain_id)
                .ok_or_else(|| missing("domain", &recipe.id, board.domain_id.as_str()))?;
            if domain.stamps.is_archived() {
                return Err(archived("domain", &recipe.id, board.domain_id.as_str()));
            }
            let overlay = recipe.overlays.domains.get(&board.domain_id);

            let questions = board
                .question_ids
                .iter()
                .map(|id| {
                    let question = bodies
                        .questions
                        .get(id)
                        .ok_or_else(|| missing("question", &recipe.id, id.as_str()))?;
                    if question.stamps.is_archived() {
                        return Err(archived("question", &recipe.id, id.as_str()));
                    }
                    snapshot_question(question, recipe, &board.domain_id, id)
                })
                .collect::<CatalogResult<Vec<_>>>()?;

            let snapshot_domain = SnapshotDomain::new(
                board.domain_id.clone(),
                pick(overlay.and_then(|o| o.name.clone()), &domain.name),
                pick(overlay.and_then(|o| o.code.clone()), &domain.code),
                questions,
            );
            // P11.13. `recipe_upsert` refuses this board, so reaching here
            // means a row written by an older build — the same second line
            // `play_load` keeps for a snapshot's settings. Measured on the
            // *snapshot* difficulty, which is the overlay-applied one.
            if let Some(clash) =
                clash_in(recipe.settings.board.allow_repeated_difficulty, &snapshot_domain)
            {
                return Err(CatalogError::invalid(
                    format!(
                        "recipe.{}.board.{}.difficulty.{}",
                        recipe.id,
                        board.domain_id.as_str(),
                        clash
                    ),
                    "two questions in this domain share a difficulty; turn on Allow repeated difficulties in Board, or keep one",
                ));
            }
            Ok(snapshot_domain)
        })
        .collect::<CatalogResult<Vec<_>>>()?;

    Ok(PlaySnapshot::new(
        play_id,
        recipe.id.clone(),
        teams,
        domains,
        settings,
    ))
}

/// The lowest difficulty this domain's queue holds twice, if it holds one and
/// the game does not allow it.
/// The whole rule lives in [`crate::board`]; this is only the adapter from a
/// built queue to the `(id, difficulty)` pairs it reads.
fn clash_in(allow_repeats: bool, domain: &SnapshotDomain) -> Option<u8> {
    let pairs: Vec<_> = domain
        .questions
        .iter()
        .map(|q| (q.id.clone(), q.difficulty))
        .collect();
    crate::board::check(allow_repeats, &pairs).map(|clash| clash.difficulty)
}

/// One question as this show asks it, overlays applied. Refused when the
/// effective body is incomplete (§2.32): `recipe_upsert` refuses such a board,
/// but a question can become incomplete from outside the recipe — the editor
/// saves incomplete rows — so this is the second line, as for a clash.
fn snapshot_question(
    question: &Question,
    recipe: &Recipe,
    domain: &DomainId,
    id: &QuestionId,
) -> CatalogResult<SnapshotQuestion> {
    let overlay = recipe.overlays.questions.get(id);
    let difficulty = overlay.and_then(|o| o.difficulty).or(question.difficulty);
    let (true, Some(difficulty)) = (
        complete::effective_gaps(question, overlay).is_empty(),
        difficulty,
    ) else {
        return Err(CatalogError::invalid(
            format!("recipe.{}.board.{domain}.question.{id}", recipe.id),
            complete::INCOMPLETE,
        ));
    };
    // Options come as a set: overriding them overrides the correct marks with
    // them, because an overlay that changed the text but kept the old marks
    // could mark an option that no longer exists.
    let options = overlay
        .and_then(|o| o.options.clone())
        .unwrap_or_else(|| question.options.clone());

    Ok(SnapshotQuestion {
        id: id.clone(),
        stem: pick(overlay.and_then(|o| o.stem.clone()), &question.stem),
        options: options
            .iter()
            .map(|option| SnapshotOption {
                id: option.id.clone(),
                text: option.text.clone(),
            })
            .collect(),
        correct_option_ids: options
            .iter()
            .filter(|o| o.correct)
            .map(|o| o.id.clone())
            .collect(),
        difficulty,
        duration_ms: overlay.and_then(|o| o.duration_ms),
    })
}

fn pick(overlay: Option<String>, catalog: &str) -> String {
    overlay.unwrap_or_else(|| catalog.to_owned())
}

fn missing(kind: &str, recipe: &crate::ids::RecipeId, id: &str) -> CatalogError {
    CatalogError::invalid(
        format!("recipe.{recipe}.board.{kind}.{id}"),
        "the board names a row the library no longer has",
    )
}

fn archived(kind: &str, recipe: &crate::ids::RecipeId, id: &str) -> CatalogError {
    CatalogError::invalid(
        format!("recipe.{recipe}.board.{kind}.{id}"),
        "the board names an archived row; restore it or take it off the board",
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::catalog::model::{BoardDomain, QuestionOption, QuestionOverlay, TeamOverlay};
    use crate::flags::GameSettings;

    fn fixture() -> (Recipe, Bodies) {
        let team = Team::new("team-a", "ALPHA", "ALP");
        let question = Question::new("q-1", "Catalog stem?", 40).with_options(vec![
            QuestionOption::new("opt-a", "A", true),
            QuestionOption::new("opt-b", "B", false),
        ]);
        let domain = Domain::new("dom-1", "Science", "SCI_204");

        let mut recipe = Recipe::new("recipe-1", "Demo", GameSettings::default());
        recipe.teams = vec![team.id.clone()];
        recipe.board = vec![BoardDomain {
            domain_id: domain.id.clone(),
            question_ids: vec![question.id.clone()],
        }];

        let bodies = Bodies {
            teams: [(team.id.clone(), team)].into_iter().collect(),
            domains: [(domain.id.clone(), domain)].into_iter().collect(),
            questions: [(question.id.clone(), question)].into_iter().collect(),
        };
        (recipe, bodies)
    }

    /// A second, complete question — the twin the clash tests need. It has
    /// options so that it stops on the clash, not on being incomplete.
    fn twin(id: &str, difficulty: u8) -> Question {
        Question::new(id, "Another stem?", difficulty).with_options(vec![
            QuestionOption::new("opt-x", "X", true),
            QuestionOption::new("opt-y", "Y", false),
        ])
    }

    #[test]
    fn the_snapshot_copies_the_catalog_when_there_is_no_overlay() {
        let (recipe, bodies) = fixture();
        let snapshot = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap();
        assert_eq!(snapshot.teams[0].name, "ALPHA");
        assert_eq!(snapshot.domains[0].questions[0].stem, "Catalog stem?");
        assert_eq!(snapshot.domains[0].questions[0].duration_ms, None);
    }

    #[test]
    fn an_overlay_wins_field_by_field_and_the_rest_shows_through() {
        let (mut recipe, bodies) = fixture();
        recipe.overlays.teams.insert(
            TeamId::from("team-a"),
            TeamOverlay {
                color: Some("var(--state-leader)".to_owned()),
                ..TeamOverlay::default()
            },
        );
        recipe.overlays.questions.insert(
            QuestionId::from("q-1"),
            QuestionOverlay {
                stem: Some("This game's stem".to_owned()),
                difficulty: Some(90),
                duration_ms: Some(45_000),
                options: None,
            },
        );

        let snapshot = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap();
        let team = &snapshot.teams[0];
        assert_eq!(team.color, "var(--state-leader)");
        assert_eq!(team.name, "ALPHA", "an unset field is not overridden");

        let question = &snapshot.domains[0].questions[0];
        assert_eq!(question.stem, "This game's stem");
        assert_eq!(question.difficulty, 90);
        assert_eq!(question.duration_ms, Some(45_000));
        assert_eq!(question.correct_option_ids, vec!["opt-a".into()]);
    }

    #[test]
    fn overriding_the_options_overrides_the_correct_marks_with_them() {
        let (mut recipe, bodies) = fixture();
        recipe.overlays.questions.insert(
            QuestionId::from("q-1"),
            QuestionOverlay {
                options: Some(vec![
                    QuestionOption::new("opt-x", "X", false),
                    QuestionOption::new("opt-y", "Y", true),
                ]),
                ..QuestionOverlay::default()
            },
        );
        let snapshot = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap();
        let question = &snapshot.domains[0].questions[0];
        assert_eq!(question.options.len(), 2);
        assert_eq!(question.correct_option_ids, vec!["opt-y".into()]);
    }

    #[test]
    fn an_empty_roster_and_an_empty_board_are_refused_with_the_section_to_fix() {
        let (mut recipe, bodies) = fixture();
        recipe.teams.clear();
        let error = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "recipe.recipe-1.roster: the roster is empty"
        );

        let (mut recipe, bodies) = fixture();
        recipe.board[0].question_ids.clear();
        let error = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "recipe.recipe-1.board: the board has no questions"
        );

        // A board with no domains at all is the same empty board.
        let (mut recipe, bodies) = fixture();
        recipe.board.clear();
        assert!(matches!(
            build(&recipe, &bodies, PlayId::from("play-1"), FrozenSettings::default()),
            Err(CatalogError::Invalid { target_path, .. }) if target_path == "recipe.recipe-1.board"
        ));
    }

    #[test]
    fn two_questions_at_one_difficulty_in_one_domain_stop_the_snapshot() {
        // `recipe_upsert` refuses this board, so the only way to reach here is
        // a row written by an older build (P11.13). It is caught before a
        // Stage window is created for a show that would walk 10, 10, 30.
        let (mut recipe, mut bodies) = fixture();
        let twin = twin("q-2", 40);
        recipe.board[0].question_ids.push(twin.id.clone());
        bodies.questions.insert(twin.id.clone(), twin);

        let error = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "recipe.recipe-1.board.dom-1.difficulty.40: two questions in this domain share a difficulty; turn on Allow repeated difficulties in Board, or keep one"
        );
    }

    #[test]
    fn the_same_difficulty_in_two_different_domains_is_fine() {
        let (mut recipe, mut bodies) = fixture();
        let twin = twin("q-2", 40);
        let other = Domain::new("dom-2", "History", "HIS_101");
        recipe.board.push(BoardDomain {
            domain_id: other.id.clone(),
            question_ids: vec![twin.id.clone()],
        });
        bodies.questions.insert(twin.id.clone(), twin);
        bodies.domains.insert(other.id.clone(), other);

        assert!(
            build(
                &recipe,
                &bodies,
                PlayId::from("play-1"),
                FrozenSettings::default(),
            )
            .is_ok()
        );
    }

    #[test]
    fn a_difficulty_overlay_is_what_the_clash_is_measured_on() {
        // The catalog difficulties differ; the recipe's own overlay is what
        // collides, which is exactly the case a check reading catalog rows
        // would miss.
        let (mut recipe, mut bodies) = fixture();
        let twin = twin("q-2", 70);
        recipe.board[0].question_ids.push(twin.id.clone());
        bodies.questions.insert(twin.id.clone(), twin);
        recipe.overlays.questions.insert(
            QuestionId::from("q-2"),
            QuestionOverlay {
                difficulty: Some(40),
                ..QuestionOverlay::default()
            },
        );

        assert!(matches!(
            build(&recipe, &bodies, PlayId::from("play-1"), FrozenSettings::default()),
            Err(CatalogError::Invalid { target_path, .. })
                if target_path == "recipe.recipe-1.board.dom-1.difficulty.40"
        ));
    }

    #[test]
    fn an_incomplete_question_on_the_board_stops_the_snapshot() {
        let (recipe, mut bodies) = fixture();
        bodies
            .questions
            .get_mut(&QuestionId::from("q-1"))
            .unwrap()
            .difficulty = None;
        let error = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap_err();
        assert_eq!(
            error.to_string(),
            "recipe.recipe-1.board.dom-1.question.q-1: this question is incomplete; finish it in the library or take it off the board"
        );
    }

    #[test]
    fn a_this_game_difficulty_completes_a_question_for_this_show() {
        let (mut recipe, mut bodies) = fixture();
        bodies
            .questions
            .get_mut(&QuestionId::from("q-1"))
            .unwrap()
            .difficulty = None;
        recipe.overlays.questions.insert(
            QuestionId::from("q-1"),
            QuestionOverlay {
                difficulty: Some(25),
                ..QuestionOverlay::default()
            },
        );
        let snapshot = build(
            &recipe,
            &bodies,
            PlayId::from("play-1"),
            FrozenSettings::default(),
        )
        .unwrap();
        assert_eq!(snapshot.domains[0].questions[0].difficulty, 25);
    }

    #[test]
    fn an_archived_row_on_the_board_stops_the_snapshot() {
        let (recipe, mut bodies) = fixture();
        bodies
            .questions
            .get_mut(&QuestionId::from("q-1"))
            .unwrap()
            .stamps
            .archived_at = Some(1);
        assert!(
            build(
                &recipe,
                &bodies,
                PlayId::from("play-1"),
                FrozenSettings::default(),
            )
            .is_err()
        );
    }
}
