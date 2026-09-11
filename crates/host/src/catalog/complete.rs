//! What makes a question ready for a show (§2.32). The whole rule, and pure —
//! no catalog, no recipe, no clock — so the import, the board, the snapshot
//! and the preview cannot disagree about it. Studio spells the same five gaps
//! for display in `apps/studio/src/host/question.ts`; this is the one that
//! refuses.
//!
//! The library stores an incomplete question. A Play never sees one.

use serde::{Deserialize, Serialize};

use super::model::{Question, QuestionOption, QuestionOverlay};

/// The refusal a board write and a Load share, so the operator reads one
/// sentence wherever an incomplete question is stopped.
pub(crate) const INCOMPLETE: &str =
    "this question is incomplete; finish it in the library or take it off the board";

/// One reason a question cannot go on air yet, in the order the operator
/// reads them.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum QuestionGap {
    /// No question text.
    Stem,
    /// Fewer than two options.
    Options,
    /// No option is marked correct.
    Correct,
    /// No difficulty is set.
    Difficulty,
    /// In no active domain, so no board can reach it.
    Domain,
}

/// The four gaps a body can have on its own — everything but the domain.
pub fn body_gaps(
    stem: &str,
    options: &[QuestionOption],
    difficulty: Option<u8>,
) -> Vec<QuestionGap> {
    let mut gaps = Vec::new();
    if stem.trim().is_empty() {
        gaps.push(QuestionGap::Stem);
    }
    if options.len() < 2 {
        gaps.push(QuestionGap::Options);
    }
    if !options.iter().any(|o| o.correct) {
        gaps.push(QuestionGap::Correct);
    }
    if difficulty.is_none() {
        gaps.push(QuestionGap::Difficulty);
    }
    gaps
}

/// Every gap a library row has. `in_active_domain` is the caller's to answer,
/// because membership lives on the domains (§4.1), not on the question.
pub fn gaps(question: &Question, in_active_domain: bool) -> Vec<QuestionGap> {
    let mut gaps = body_gaps(&question.stem, &question.options, question.difficulty);
    if !in_active_domain {
        gaps.push(QuestionGap::Domain);
    }
    gaps
}

/// The gaps of the body **this show** would ask: the recipe overlay applied
/// field by field (§2.17), the way `snapshot.rs` copies it. On a board the
/// domain gap cannot arise — a board question is a member of its board domain.
pub fn effective_gaps(question: &Question, overlay: Option<&QuestionOverlay>) -> Vec<QuestionGap> {
    let stem = overlay
        .and_then(|o| o.stem.as_deref())
        .unwrap_or(&question.stem);
    let options = overlay
        .and_then(|o| o.options.as_deref())
        .unwrap_or(&question.options);
    let difficulty = overlay.and_then(|o| o.difficulty).or(question.difficulty);
    body_gaps(stem, options, difficulty)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn complete() -> Question {
        Question::new("q-1", "Which one?", 40).with_options(vec![
            QuestionOption::new("q-1-a", "A", true),
            QuestionOption::new("q-1-b", "B", false),
        ])
    }

    #[test]
    fn a_complete_question_in_a_domain_has_no_gaps() {
        assert!(gaps(&complete(), true).is_empty());
    }

    #[test]
    fn each_gap_is_reported_on_its_own() {
        let mut q = complete();
        q.stem = "   ".to_owned();
        assert_eq!(gaps(&q, true), vec![QuestionGap::Stem]);

        let mut q = complete();
        q.options.pop();
        assert_eq!(gaps(&q, true), vec![QuestionGap::Options]);

        let mut q = complete();
        q.options[0].correct = false;
        assert_eq!(gaps(&q, true), vec![QuestionGap::Correct]);

        let mut q = complete();
        q.difficulty = None;
        assert_eq!(gaps(&q, true), vec![QuestionGap::Difficulty]);

        assert_eq!(gaps(&complete(), false), vec![QuestionGap::Domain]);
    }

    #[test]
    fn gaps_come_in_reading_order() {
        let q = Question {
            stem: String::new(),
            options: Vec::new(),
            difficulty: None,
            ..complete()
        };
        assert_eq!(
            gaps(&q, false),
            vec![
                QuestionGap::Stem,
                QuestionGap::Options,
                QuestionGap::Correct,
                QuestionGap::Difficulty,
                QuestionGap::Domain,
            ]
        );
    }

    #[test]
    fn an_overlay_can_close_a_gap_for_one_show_or_open_one() {
        let mut q = complete();
        q.difficulty = None;
        let supplies = QuestionOverlay {
            difficulty: Some(30),
            ..QuestionOverlay::default()
        };
        assert!(effective_gaps(&q, Some(&supplies)).is_empty());

        let empties = QuestionOverlay {
            options: Some(vec![QuestionOption::new("x", "X", false)]),
            ..QuestionOverlay::default()
        };
        assert_eq!(
            effective_gaps(&complete(), Some(&empties)),
            vec![QuestionGap::Options, QuestionGap::Correct]
        );
    }
}
