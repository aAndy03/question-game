//! The append-only Play log (§2.7, §2.8, §5.10).
//!
//! Events are facts, and facts are not edited. Undo appends
//! `TurnInverted`, redo appends `TurnReapplied`, and both name the events they
//! act on rather than deleting them — the log only ever grows. Projections are
//! a pure fold over the log, so booting after a crash means replaying, not
//! repairing (§2.10).
//!
//! Every event carries the millisecond it happened at, and every piece of
//! elapsed time in the Play is derived from those numbers. That is what makes
//! "replaying a full event log rebuilds a byte-identical `PlayState`" a
//! property rather than a hope.

use serde::{Deserialize, Serialize};

use crate::ids::{DomainId, EventId, OperatorId, OptionId, PlayId, QuestionId, TeamId};
use crate::rules::Verdict;
use crate::snapshot::PlaySnapshot;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Event {
    /// 1-based position in this Play's log.
    pub seq: u64,
    /// `<play id>:<seq>`. Deterministic, so a replay rebuilds the same ids.
    pub id: EventId,
    pub at_ms: u64,
    pub kind: EventKind,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "type")]
pub enum EventKind {
    /// Always the first event: it carries the §4.3 snapshot, so the log is
    /// self-contained and a replay needs nothing else.
    PlayLoaded {
        snapshot: Box<PlaySnapshot>,
    },
    PlayStarted,
    Paused,
    Resumed,

    /// The token moved. Legality was checked before this was appended (§5.4).
    TokenGiven {
        team: TeamId,
    },
    QuestionIssued {
        domain: DomainId,
        question: QuestionId,
        team: TeamId,
        /// Resolved through the §2.18 cascade at issue. `None` = operator pace.
        timer_duration_ms: Option<u32>,
    },

    StemRevealed,
    OptionRevealed {
        option: OptionId,
    },
    /// The working choice. Replaces the previous one wholesale.
    SelectionSet {
        options: Vec<OptionId>,
    },

    TimerStarted,
    TimerPaused,
    /// The countdown reached zero. `at_ms` is the computed zero instant, not the
    /// tick that noticed it. `open` is the §2.4 T=0 row: nothing was selected,
    /// so the question stays open instead of auto-locking.
    TimerExpired {
        open: bool,
    },
    SelectionLocked {
        options: Vec<OptionId>,
        /// Recorded for the Timeline and Statistics; the projection derives the
        /// same number from the timer.
        remaining_ms_at_lock: Option<u32>,
        /// True when the T=0 table locked it rather than the operator.
        auto: bool,
    },

    /// Reveal: the one point that scores and consumes (§2.4, §5.3 step 4).
    TurnResolved {
        verdict: Verdict,
        points_awarded: u32,
        bonus_awarded: Option<u32>,
        /// Wrong answer, or the consecutive-correct cap.
        token_ends: bool,
    },

    RingReordered {
        order: Vec<TeamId>,
    },
    /// FinalLeaderboard reveals lowest rank first (§5.5). On the Play, not the
    /// session, because the leaderboard shows with no session left.
    LeaderboardRankRevealed {
        rank: u32,
    },

    /// Undo (§2.7). Names the resolve it inverts and the span of the log it
    /// takes out of the projection — from the `QuestionIssued` that opened that
    /// turn to the end of the log at the time of the undo.
    TurnInverted {
        target_event_id: EventId,
        from_seq: u64,
        to_seq: u64,
    },
    /// Redo: puts an inverted span back (§5.8).
    TurnReapplied {
        target_event_id: EventId,
    },

    /// Another operator sat down mid-Play (§2.26). Metadata for the Timeline
    /// and Statistics: it changes nothing in the projection, the timer keeps
    /// running, and it is Control-only — never on Stage.
    OperatorSwitched {
        operator_id: OperatorId,
    },

    PlayCompleted,
    PlayAbandoned,
    /// This Play ended because a new one took its place (§2.7 — restart, not
    /// rewind). The new Play has its own log.
    PlayRestarted {
        new_play_id: PlayId,
        same_questions: bool,
    },
}

impl Event {
    pub fn new(play: &PlayId, seq: u64, at_ms: u64, kind: EventKind) -> Self {
        Event {
            seq,
            id: EventId::of(play, seq),
            at_ms,
            kind,
        }
    }

    /// True for the events a Play's *state* depends on. `TurnInverted` and
    /// `TurnReapplied` are bookkeeping: they change which events count, not
    /// what those events did.
    pub fn is_bookkeeping(&self) -> bool {
        matches!(
            self.kind,
            EventKind::TurnInverted { .. } | EventKind::TurnReapplied { .. }
        )
    }
}

/// The spans currently taken out of the projection by an undo, newest last.
///
/// A `TurnReapplied` cancels the inversion that named the same resolve, which
/// is why redo does not need its own span: the original `TurnInverted` still
/// says exactly what to put back.
pub fn active_inversions(events: &[Event]) -> Vec<(u64, u64)> {
    let mut spans: Vec<(EventId, (u64, u64))> = Vec::new();
    for event in events {
        match &event.kind {
            EventKind::TurnInverted {
                target_event_id,
                from_seq,
                to_seq,
            } => spans.push((target_event_id.clone(), (*from_seq, *to_seq))),
            EventKind::TurnReapplied { target_event_id } => {
                spans.retain(|(id, _)| id != target_event_id);
            }
            _ => {}
        }
    }
    spans.into_iter().map(|(_, span)| span).collect()
}

/// True when `seq` sits inside an inverted span and should not be folded.
pub fn is_inverted(spans: &[(u64, u64)], seq: u64) -> bool {
    spans.iter().any(|(from, to)| seq >= *from && seq <= *to)
}
