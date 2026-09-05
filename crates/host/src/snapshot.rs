//! `PlaySnapshot` — the copy taken at Play start or Restart (§4.3).
//!
//! The snapshot is why a catalog edit during an open Play cannot move a score:
//! team display fields, question bodies (recipe overlays already applied by
//! `CatalogService`), the frozen settings and the layout are copied once, and
//! the Play reads nothing else for its whole life.
//!
//! Per-domain queues are built here, `difficulty ASC, id ASC` (§4.3 step 5), so
//! "the next question in this domain" is a position in a list rather than a
//! query — difficulty walks easy→hard and the operator never picks a question.

use serde::{Deserialize, Serialize};

use crate::ids::{DomainId, OptionId, PlayId, QuestionId, RecipeId, TeamId};
use crate::settings::FrozenSettings;

/// Derived from the correct ticks, never authored (§4.1).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AnswerMode {
    Single,
    Multiple,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotOption {
    pub id: OptionId,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotQuestion {
    pub id: QuestionId,
    pub stem: String,
    pub options: Vec<SnapshotOption>,
    pub correct_option_ids: Vec<OptionId>,
    /// 1–100.
    pub difficulty: u8,
    /// The per-question recipe overlay duration, top of the §2.18 cascade.
    pub duration_ms: Option<u32>,
}

impl SnapshotQuestion {
    pub fn answer_mode(&self) -> AnswerMode {
        if self.correct_option_ids.len() > 1 {
            AnswerMode::Multiple
        } else {
            AnswerMode::Single
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotDomain {
    pub id: DomainId,
    pub name: String,
    /// Part-number style code from the design system, e.g. `TEC_881`.
    pub code: String,
    /// The queue, `difficulty ASC, id ASC`. Build with [`SnapshotDomain::new`]
    /// rather than assembling this by hand.
    pub questions: Vec<SnapshotQuestion>,
}

impl SnapshotDomain {
    pub fn new(
        id: impl Into<DomainId>,
        name: impl Into<String>,
        code: impl Into<String>,
        mut questions: Vec<SnapshotQuestion>,
    ) -> Self {
        questions.sort_by(|a, b| {
            a.difficulty
                .cmp(&b.difficulty)
                .then_with(|| a.id.as_str().cmp(b.id.as_str()))
        });
        SnapshotDomain {
            id: id.into(),
            name: name.into(),
            code: code.into(),
            questions,
        }
    }
}

/// Display fields only — the roster as it looked when the Play started.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SnapshotTeam {
    pub id: TeamId,
    pub name: String,
    pub short_code: String,
    /// A token name where possible, otherwise a literal.
    pub color: String,
    pub logo_url: Option<String>,
    /// One line of catalog detail shown beside the name.
    pub detail: Option<String>,
}

impl SnapshotTeam {
    pub fn new(
        id: impl Into<TeamId>,
        name: impl Into<String>,
        short_code: impl Into<String>,
    ) -> Self {
        SnapshotTeam {
            id: id.into(),
            name: name.into(),
            short_code: short_code.into(),
            color: "var(--ink)".to_owned(),
            logo_url: None,
            detail: None,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct PlaySnapshot {
    pub play_id: PlayId,
    pub recipe_id: RecipeId,
    /// Roster in recipe order — this *is* the opening ring order (§4.3 step 7).
    pub teams: Vec<SnapshotTeam>,
    pub domains: Vec<SnapshotDomain>,
    pub settings: FrozenSettings,
}

impl PlaySnapshot {
    pub fn new(
        play_id: impl Into<PlayId>,
        recipe_id: impl Into<RecipeId>,
        teams: Vec<SnapshotTeam>,
        domains: Vec<SnapshotDomain>,
        settings: FrozenSettings,
    ) -> Self {
        PlaySnapshot {
            play_id: play_id.into(),
            recipe_id: recipe_id.into(),
            teams,
            domains,
            settings,
        }
    }

    pub fn ring_order(&self) -> Vec<TeamId> {
        self.teams.iter().map(|t| t.id.clone()).collect()
    }

    pub fn team(&self, id: &TeamId) -> Option<&SnapshotTeam> {
        self.teams.iter().find(|t| t.id == *id)
    }

    pub fn domain(&self, id: &DomainId) -> Option<&SnapshotDomain> {
        self.domains.iter().find(|d| d.id == *id)
    }

    pub fn question(&self, id: &QuestionId) -> Option<(&SnapshotDomain, &SnapshotQuestion)> {
        self.domains.iter().find_map(|domain| {
            domain
                .questions
                .iter()
                .find(|q| q.id == *id)
                .map(|q| (domain, q))
        })
    }

    /// Every question on the board. The Play is `Completed` once this many are
    /// consumed (§5.9).
    pub fn total_questions(&self) -> usize {
        self.domains.iter().map(|d| d.questions.len()).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn question(id: &str, difficulty: u8) -> SnapshotQuestion {
        SnapshotQuestion {
            id: QuestionId::from(id),
            stem: format!("stem {id}"),
            options: vec![SnapshotOption {
                id: OptionId::from("opt-a"),
                text: "A".to_owned(),
            }],
            correct_option_ids: vec![OptionId::from("opt-a")],
            difficulty,
            duration_ms: None,
        }
    }

    #[test]
    fn the_queue_walks_easy_to_hard_and_breaks_ties_by_id() {
        let domain = SnapshotDomain::new(
            "dom-sci",
            "Science",
            "SCI_204",
            vec![
                question("q-c", 30),
                question("q-b", 10),
                question("q-a", 10),
            ],
        );
        let ids: Vec<&str> = domain.questions.iter().map(|q| q.id.as_str()).collect();
        assert_eq!(ids, vec!["q-a", "q-b", "q-c"]);
    }

    #[test]
    fn answer_mode_is_derived_from_the_correct_ticks() {
        let mut q = question("q-a", 10);
        assert_eq!(q.answer_mode(), AnswerMode::Single);
        q.correct_option_ids.push(OptionId::from("opt-b"));
        assert_eq!(q.answer_mode(), AnswerMode::Multiple);
    }
}
