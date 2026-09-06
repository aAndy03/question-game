//! `MatchError` — the §5.3 reject table as a type.
//!
//! Every command returns `Result<_, MatchError>`. A rejected command appends
//! no event and mutates nothing: the caller's state is exactly what it was, so
//! a refused override cannot half-move the token.
//!
//! The variants carry the ids the operator needs to see, because the notice
//! family (§14) renders `{ code, severity, target_path, actions[] }` and
//! `target_path` has to point at a row.

use thiserror::Error;

use crate::ids::{DomainId, OptionId, PlayId, QuestionId, TeamId};
use crate::play::PlayStatus;

#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum MatchError {
    /// `play_start` on a board with no questions (§4.3).
    #[error("the board has no questions")]
    BoardEmpty,

    /// A Play command arrived while the Play was in a status that forbids it.
    #[error("play is {actual:?}, expected one of {expected:?}")]
    WrongStatus {
        actual: PlayStatus,
        expected: Vec<PlayStatus>,
    },

    #[error("no play is loaded")]
    NoPlay,

    #[error("play {0} is not the loaded play")]
    WrongPlay(PlayId),

    /// `choose_domain` with no team holding the token (§5.3).
    #[error("no team holds the token")]
    NoToken,

    #[error("unknown team {0}")]
    UnknownTeam(TeamId),

    #[error("unknown domain {0}")]
    UnknownDomain(DomainId),

    #[error("unknown question {0}")]
    UnknownQuestion(QuestionId),

    #[error("unknown option {0}")]
    UnknownOption(OptionId),

    /// Every question in this domain is consumed for this Play (§2.1).
    #[error("domain {0} has no questions left in this play")]
    DomainEmpty(DomainId),

    #[error("a question is already issued")]
    SessionAlreadyIssued,

    #[error("no question is issued")]
    SessionNotIssued,

    #[error("the selection is locked")]
    AlreadyLocked,

    /// `lock_selection` with nothing selected. Empty is a *reveal*, and reveal
    /// is what scores it zero (§2.4).
    #[error("nothing is selected; reveal empty instead of locking it")]
    EmptySelection,

    #[error("this question is already resolved")]
    AlreadyResolved,

    /// Operator pace: no countdown, no `start_timer`, no auto-lock (§2.4).
    #[error("the timer is disabled for this play")]
    TimerDisabled,

    #[error("the timer is already running")]
    TimerAlreadyRunning,

    #[error("the timer is at zero")]
    TimerAtZero,

    #[error("the timer is not running")]
    TimerNotRunning,

    /// The round invariant refused the target (§5.4). `legal` is what the ring
    /// would accept, so the Action Panel can show `drop-illegal` and offer the
    /// alternatives in the same notice.
    #[error("team {target} may not receive the token this round")]
    IllegalTokenTarget { target: TeamId, legal: Vec<TeamId> },

    /// `reorder_ring` touched the part of the sequence that has already played
    /// (§5.4: the drag reorders the *future* ring only).
    #[error("{0}")]
    IllegalReorder(&'static str),

    /// `give_token` while a question is locked and unrevealed, under
    /// `override.after_lock = refuse_until_reveal` (§2.6). Reveal first.
    #[error("reveal the locked answer before passing the token")]
    OverrideRefusedUntilReveal,

    #[error("nothing to undo")]
    NothingToUndo,

    #[error("nothing to redo")]
    NothingToRedo,

    /// A game-affecting setting was written after `play_start` (§2.5). The
    /// field stays visible and disabled; the host refuses the write anyway.
    #[error("{0} is frozen for the life of this play")]
    SettingFrozen(&'static str),

    /// §4.2: the write would leave an illegal settings document, so it was
    /// refused whole. `key` is the settings path, which is the notice
    /// `target_path` (§14) — the field the operator has to look at.
    #[error("{key}: {reason}")]
    IllegalSettings {
        key: &'static str,
        reason: &'static str,
    },

    /// A Current-game settings write with no recipe in Control (§11.L L3).
    #[error("no recipe is loaded into control")]
    NoRecipeLoaded,

    /// A feature root under `feat.*` is off (§2.16). `FlagService` owns the
    /// flags; `MatchService` only reports the refusal.
    #[error("feature {0} is off")]
    FeatureOff(&'static str),

    /// A maintenance command that reaches stored Plays — *Wipe Plays*, *Remove
    /// generated data* — arrived while a Play is loaded or open (§12.3). Refused
    /// before any pin is looked at: the pin is not what protects the show.
    #[error("a Play is open")]
    PlayOpen,
}

pub type MatchResult<T> = Result<T, MatchError>;
