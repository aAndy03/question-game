//! Judging and ranking — the parts of the rules that are pure functions.
//!
//! Judging compares the **locked** set against the question's correct set
//! (§2.5). Nothing here knows about points; `award` turns a `Judgement` into
//! points, and only `reveal_outcome` writes them (§2.4).

use serde::{Deserialize, Serialize};

use crate::ids::OptionId;
use crate::settings::JudgingSettings;

/// Presentational verdict. Distinct from points: the design system has three
/// result frames (`ALL CORRECT`, `INCORRECT`, `EXTRA SELECTION`) and with
/// partial credit off the last still scores zero. Mirrors `OutcomeVerdict` in
/// `packages/contract`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Verdict {
    Correct,
    Incorrect,
    Partial,
}

/// The verdict plus the counts the §4.4 partial-credit formula needs.
///
/// It reaches the wire inside `AwardBreakdown` (P11.12), so it is camelCase
/// like everything else Studio reads.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Judgement {
    pub verdict: Verdict,
    pub correct_locked: u32,
    pub incorrect_locked: u32,
    pub correct_total: u32,
}

impl Judgement {
    /// A single correct answer — the shape `base_points` needs to ask for a
    /// base without asking about a verdict.
    pub fn correct() -> Self {
        Judgement {
            verdict: Verdict::Correct,
            correct_locked: 1,
            incorrect_locked: 0,
            correct_total: 1,
        }
    }
}

/// Judge a locked set.
///
/// `locked` is `None` for an empty reveal — the operator revealed with nothing
/// locked, which is wrong and consumes the question (§2.4).
pub fn judge(
    locked: Option<&[OptionId]>,
    correct: &[OptionId],
    judging: &JudgingSettings,
) -> Judgement {
    let correct_total = correct.len() as u32;
    let locked = match locked {
        Some(l) if !l.is_empty() => l,
        _ => {
            return Judgement {
                verdict: Verdict::Incorrect,
                correct_locked: 0,
                incorrect_locked: 0,
                correct_total,
            };
        }
    };

    let correct_locked = locked.iter().filter(|id| correct.contains(id)).count() as u32;
    let incorrect_locked = locked.len() as u32 - correct_locked;

    let exact = if judging.order_matters {
        locked == correct
    } else {
        // Set equality: no duplicate can slip through, because every locked id
        // is distinct by construction (`set_selection` de-duplicates).
        correct_locked == correct_total && incorrect_locked == 0
    };

    let verdict = if exact {
        Verdict::Correct
    } else if judging.order_matters {
        // With order on, position is part of the answer and a set-share means
        // nothing — the outcome is binary, and partial credit cannot rescue a
        // right set in the wrong order.
        Verdict::Incorrect
    } else if correct_locked > 0 {
        // Some right answers and something missing or extra — the design
        // system's `EXTRA SELECTION` frame.
        Verdict::Partial
    } else {
        Verdict::Incorrect
    };

    Judgement {
        verdict,
        correct_locked,
        incorrect_locked,
        correct_total,
    }
}

/// Competition rank, ties sharing a rank: `1, 1, 3` (§4.4, §5.9). Returned in
/// the order the scores were given, so the caller keeps its own team order.
pub fn competition_ranks(scores: &[u32]) -> Vec<u32> {
    scores
        .iter()
        .map(|score| 1 + scores.iter().filter(|other| *other > score).count() as u32)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn opts(ids: &[&str]) -> Vec<OptionId> {
        ids.iter().map(|id| OptionId::from(*id)).collect()
    }

    #[test]
    fn option_order_is_irrelevant_by_default() {
        let judging = JudgingSettings::default();
        let correct = opts(&["a", "c"]);
        assert_eq!(
            judge(Some(&opts(&["c", "a"])), &correct, &judging).verdict,
            Verdict::Correct,
        );
    }

    #[test]
    fn order_matters_when_the_recipe_says_so() {
        let judging = JudgingSettings {
            order_matters: true,
            ..JudgingSettings::default()
        };
        let correct = opts(&["a", "c"]);
        assert_eq!(
            judge(Some(&opts(&["c", "a"])), &correct, &judging).verdict,
            Verdict::Incorrect,
        );
        assert_eq!(
            judge(Some(&opts(&["a", "c"])), &correct, &judging).verdict,
            Verdict::Correct,
        );
    }

    #[test]
    fn an_extra_selection_is_partial_not_correct() {
        let judgement = judge(
            Some(&opts(&["a", "b", "c"])),
            &opts(&["a", "c"]),
            &JudgingSettings::default(),
        );
        assert_eq!(judgement.verdict, Verdict::Partial);
        assert_eq!(judgement.correct_locked, 2);
        assert_eq!(judgement.incorrect_locked, 1);
    }

    #[test]
    fn an_empty_reveal_is_wrong() {
        let judging = JudgingSettings::default();
        let correct = opts(&["a"]);
        assert_eq!(judge(None, &correct, &judging).verdict, Verdict::Incorrect);
        assert_eq!(
            judge(Some(&[]), &correct, &judging).verdict,
            Verdict::Incorrect
        );
    }

    #[test]
    fn ties_share_a_rank_and_the_next_rank_skips() {
        assert_eq!(competition_ranks(&[500, 500, 250, 0]), vec![1, 1, 3, 4]);
        assert_eq!(competition_ranks(&[0, 250, 500]), vec![3, 2, 1]);
        assert_eq!(competition_ranks(&[]), Vec::<u32>::new());
    }
}
