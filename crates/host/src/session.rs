//! One question, from issue to outcome (§5.3).
//!
//! ```text
//! issued → stem_revealed → options_revealed (0..N) → selecting
//!        → locked | timer_expired_open → outcome_revealed
//! ```
//!
//! The stages are a reading of the fields, not a field of their own: the
//! operator reveals, selects and locks in an order the show decides, and a
//! single `stage` enum would have to be corrected every time. `stage()` derives
//! the §5.3 label for notices and tests; the commands validate against the
//! fields themselves.
//!
//! **Reveals live here, on the Play** — not in a Stage component. They have to
//! survive undo and read identically in Stage and Viewer (§13), which is why
//! `PresentationService` writes them *through* `MatchService`.

use serde::{Deserialize, Serialize};

use crate::ids::{DomainId, OptionId, TeamId};
use crate::rules::Verdict;
use crate::snapshot::SnapshotQuestion;
use crate::timer::Timer;

/// What has been revealed so far. Options are listed by id in reveal order, not
/// counted, so the operator may reveal out of order and a re-render cannot lose
/// which card is showing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reveals {
    pub stem: bool,
    pub option_ids: Vec<OptionId>,
    pub outcome: bool,
}

/// Written once, by `reveal_outcome` (§2.4).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Outcome {
    pub verdict: Verdict,
    pub points_awarded: u32,
    /// Present when a consecutive-correct bonus applied (§4.4).
    pub bonus_awarded: Option<u32>,
    /// Revealed at outcome so Stage can mark the right cards.
    pub correct_option_ids: Vec<OptionId>,
    /// The token ended here — wrong answer, or the cap.
    pub token_ends: bool,
}

/// The §5.3 labels, derived. Used by notices and tests, never stored.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SessionStage {
    Issued,
    StemRevealed,
    OptionsRevealed,
    Selecting,
    Locked,
    TimerExpiredOpen,
    OutcomeRevealed,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Session {
    pub question: SnapshotQuestion,
    pub domain_id: DomainId,
    /// The team whose token issued this question. Held here so an undo returns
    /// the question to the right team, and so a mid-question override cannot
    /// score it for somebody else.
    pub team_id: TeamId,
    /// Working choice. Does not stop the timer and is not scored (§2.4).
    pub selected: Vec<OptionId>,
    /// Frozen choice. `None` until lock.
    pub locked: Option<Vec<OptionId>>,
    /// `None` until reveal — the only point that scores and consumes.
    pub outcome: Option<Outcome>,
    /// `None` at operator pace (§2.4).
    pub timer: Option<Timer>,
    pub reveals: Reveals,
}

impl Session {
    pub fn issue(
        question: SnapshotQuestion,
        domain_id: DomainId,
        team_id: TeamId,
        timer: Option<Timer>,
    ) -> Self {
        Session {
            question,
            domain_id,
            team_id,
            selected: Vec::new(),
            locked: None,
            outcome: None,
            timer,
            reveals: Reveals::default(),
        }
    }

    pub fn is_locked(&self) -> bool {
        self.locked.is_some()
    }

    pub fn is_resolved(&self) -> bool {
        self.outcome.is_some()
    }

    pub fn has_option(&self, id: &OptionId) -> bool {
        self.question.options.iter().any(|o| o.id == *id)
    }

    /// The next option in authored order that has not been revealed yet —
    /// what `reveal_next_option` shows.
    pub fn next_unrevealed_option(&self) -> Option<&OptionId> {
        self.question
            .options
            .iter()
            .map(|o| &o.id)
            .find(|id| !self.reveals.option_ids.contains(id))
    }

    pub fn expired_open(&self) -> bool {
        self.timer.as_ref().is_some_and(Timer::expired_open)
    }

    pub fn remaining_ms_at_lock(&self) -> Option<u32> {
        self.timer.as_ref().and_then(Timer::remaining_ms_at_lock)
    }

    pub fn timer_duration_ms(&self) -> Option<u32> {
        self.timer.as_ref().map(Timer::duration_ms)
    }

    /// The §5.3 label for the state the fields describe.
    pub fn stage(&self) -> SessionStage {
        if self.is_resolved() {
            SessionStage::OutcomeRevealed
        } else if self.is_locked() {
            SessionStage::Locked
        } else if self.expired_open() {
            SessionStage::TimerExpiredOpen
        } else if !self.selected.is_empty() {
            SessionStage::Selecting
        } else if !self.reveals.option_ids.is_empty() {
            SessionStage::OptionsRevealed
        } else if self.reveals.stem {
            SessionStage::StemRevealed
        } else {
            SessionStage::Issued
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ids::QuestionId;
    use crate::snapshot::SnapshotOption;

    fn session() -> Session {
        Session::issue(
            SnapshotQuestion {
                id: QuestionId::from("q-1"),
                stem: "?".to_owned(),
                options: vec![
                    SnapshotOption {
                        id: OptionId::from("opt-a"),
                        text: "A".to_owned(),
                    },
                    SnapshotOption {
                        id: OptionId::from("opt-b"),
                        text: "B".to_owned(),
                    },
                ],
                correct_option_ids: vec![OptionId::from("opt-a")],
                difficulty: 10,
                duration_ms: None,
            },
            DomainId::from("dom-sci"),
            TeamId::from("team-alpha"),
            None,
        )
    }

    #[test]
    fn the_stage_label_follows_the_fields() {
        let mut s = session();
        assert_eq!(s.stage(), SessionStage::Issued);
        s.reveals.stem = true;
        assert_eq!(s.stage(), SessionStage::StemRevealed);
        s.reveals.option_ids.push(OptionId::from("opt-a"));
        assert_eq!(s.stage(), SessionStage::OptionsRevealed);
        s.selected.push(OptionId::from("opt-a"));
        assert_eq!(s.stage(), SessionStage::Selecting);
        s.locked = Some(vec![OptionId::from("opt-a")]);
        assert_eq!(s.stage(), SessionStage::Locked);
    }

    #[test]
    fn options_reveal_in_authored_order() {
        let mut s = session();
        assert_eq!(s.next_unrevealed_option(), Some(&OptionId::from("opt-a")));
        s.reveals.option_ids.push(OptionId::from("opt-a"));
        assert_eq!(s.next_unrevealed_option(), Some(&OptionId::from("opt-b")));
        s.reveals.option_ids.push(OptionId::from("opt-b"));
        assert_eq!(s.next_unrevealed_option(), None);
    }
}
