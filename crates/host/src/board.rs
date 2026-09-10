//! One question per difficulty, inside one board domain (P11.13).
//!
//! The library may hold as many difficulty-10 history questions as the author
//! cares to write — that is what a library is for. **A recipe board may select
//! one of them.** Two questions at the same difficulty in the same domain are
//! two rungs of the walk that are the same rung: they pay the same, they are
//! indistinguishable to the team choosing the domain, and the ladder that
//! `preview::BoardShape` draws has a step of zero in the middle of it.
//!
//! This module is the whole rule and it is pure — no catalog, no clock, no
//! recipe. The difficulty it is handed is the **effective** one
//! (`overlay ?? catalog`), resolved by whoever read the rows, because that is
//! the difficulty the award and the queue read. Every enforcement point calls
//! this rather than spelling the rule again:
//!
//! ```text
//! CatalogService::recipe_upsert   refuses the write — every recipe write
//!                                 funnels through it, so the checkbox and the
//!                                 difficulty override are one door
//! catalog::snapshot::build        refuses a Play — for a row written by an
//!                                 older build, before a Stage window exists
//! preview::build                  warns, so the operator hears it before Load
//! ```

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::ids::QuestionId;

/// Two or more selected questions in one board domain that resolve to the same
/// effective difficulty.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DifficultyClash {
    pub difficulty: u8,
    /// Every selected question at that difficulty, `id ASC`. Always at least
    /// two — a lone question is not a clash.
    pub question_ids: Vec<QuestionId>,
}

/// Every clash in one board domain's selection, `difficulty ASC`.
///
/// `questions` is `(id, effective difficulty)` in any order; the answer is
/// sorted so that a caller taking only the first gets the same one every time.
pub fn clashes(questions: &[(QuestionId, u8)]) -> Vec<DifficultyClash> {
    let mut by_difficulty: BTreeMap<u8, Vec<QuestionId>> = BTreeMap::new();
    for (id, difficulty) in questions {
        by_difficulty.entry(*difficulty).or_default().push(id.clone());
    }
    by_difficulty
        .into_iter()
        .filter(|(_, ids)| ids.len() > 1)
        .map(|(difficulty, mut question_ids)| {
            question_ids.sort();
            DifficultyClash {
                difficulty,
                question_ids,
            }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn q(id: &str, difficulty: u8) -> (QuestionId, u8) {
        (QuestionId::from(id), difficulty)
    }

    #[test]
    fn a_ladder_with_no_repeats_has_no_clash() {
        assert_eq!(clashes(&[q("q-1", 10), q("q-2", 20), q("q-3", 30)]), vec![]);
    }

    #[test]
    fn two_questions_at_one_difficulty_are_a_clash_naming_both() {
        assert_eq!(
            clashes(&[q("q-b", 10), q("q-a", 10), q("q-c", 30)]),
            vec![DifficultyClash {
                difficulty: 10,
                question_ids: vec![QuestionId::from("q-a"), QuestionId::from("q-b")],
            }]
        );
    }

    #[test]
    fn clashes_come_back_difficulty_ascending() {
        let found = clashes(&[q("q-1", 30), q("q-2", 30), q("q-3", 10), q("q-4", 10)]);
        assert_eq!(
            found.iter().map(|c| c.difficulty).collect::<Vec<_>>(),
            vec![10, 30]
        );
    }

    #[test]
    fn three_at_the_same_difficulty_are_one_clash_of_three() {
        let found = clashes(&[q("q-1", 50), q("q-2", 50), q("q-3", 50)]);
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].question_ids.len(), 3);
    }

    #[test]
    fn an_empty_selection_has_nothing_to_clash() {
        assert_eq!(clashes(&[]), vec![]);
    }
}
