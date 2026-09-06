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
    if recipe.board.iter().all(|board| board.question_ids.is_empty()) {
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
                    Ok(snapshot_question(question, recipe, id))
                })
                .collect::<CatalogResult<Vec<_>>>()?;

            Ok(SnapshotDomain::new(
                board.domain_id.clone(),
                pick(overlay.and_then(|o| o.name.clone()), &domain.name),
                pick(overlay.and_then(|o| o.code.clone()), &domain.code),
                questions,
            ))
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

fn snapshot_question(question: &Question, recipe: &Recipe, id: &QuestionId) -> SnapshotQuestion {
    let overlay = recipe.overlays.questions.get(id);
    // Options come as a set: overriding them overrides the correct marks with
    // them, because an overlay that changed the text but kept the old marks
    // could mark an option that no longer exists.
    let options = overlay
        .and_then(|o| o.options.clone())
        .unwrap_or_else(|| question.options.clone());

    SnapshotQuestion {
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
        difficulty: overlay
            .and_then(|o| o.difficulty)
            .unwrap_or(question.difficulty),
        duration_ms: overlay.and_then(|o| o.duration_ms),
    }
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
        assert_eq!(error.to_string(), "recipe.recipe-1.roster: the roster is empty");

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
