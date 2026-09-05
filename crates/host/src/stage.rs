//! The Stage half of `play-state`.
//!
//! `PlayStateForStage` (in `packages/contract`) is two things bolted together:
//! the **game** — teams, ring, domains, session, clock — which `MatchService`
//! owns, and the **presentation** — `currentScreen`, `overlay`, `revealModes`,
//! `decor` — which `PresentationService` owns. This module emits the first
//! half. P6 merges the second and calls `emitTo("stage", …)`.
//!
//! It is here rather than in P6 for one reason: `tests/stage_contract.rs`
//! checks this struct against the P1 fixtures, so a field that drifts from the
//! TypeScript contract fails a Rust test today instead of blanking Stage in
//! three phases' time. `contract_version` is mirrored the same way.
//!
//! Everything is derived and read-only. Stage is a projection, not a
//! controller (§5.7): nothing on this path can write a Play.

use serde::Serialize;

use crate::ids::{DomainId, OptionId, QuestionId, TeamId};
use crate::play::{Play, PlayStatus};
use crate::rules::Verdict;
use crate::session::Session;
use crate::snapshot::AnswerMode;

/// Must equal `CONTRACT_VERSION` in `packages/contract/src/play-state.ts`.
/// A mismatch is a notice, not a blank screen — see the P1 exit criteria.
pub const CONTRACT_VERSION: u32 = 3;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTeam {
    pub id: TeamId,
    pub name: String,
    pub short_code: String,
    pub color: String,
    pub logo_url: Option<String>,
    pub detail: Option<String>,
    pub score: u32,
    /// Competition rank, ties sharing a rank: 1, 1, 3 (§4.4).
    pub rank: u32,
    pub turns_taken: u32,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRing {
    pub order: Vec<TeamId>,
    pub current_team_id: Option<TeamId>,
    pub round_index: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageDomain {
    pub id: DomainId,
    pub name: String,
    pub code: String,
    pub remaining: usize,
    pub exhausted: bool,
    /// The difficulty of the next question this domain would issue — what the
    /// card shows in place of a serial number.
    pub next_difficulty: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOption {
    pub id: OptionId,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOutcome {
    pub verdict: Verdict,
    pub points_awarded: u32,
    pub correct_option_ids: Vec<OptionId>,
    pub bonus_awarded: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTimer {
    pub duration_ms: u32,
    /// Host-authoritative, emitted every 100ms. Stage may interpolate between
    /// ticks but must never run past zero on its own.
    pub remaining_ms: u32,
    pub running: bool,
    pub remaining_ms_at_lock: Option<u32>,
    pub expired_open: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageReveals {
    pub stem: bool,
    pub option_ids: Vec<OptionId>,
    pub outcome: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSession {
    pub question_id: QuestionId,
    pub domain_id: DomainId,
    pub stem: String,
    pub options: Vec<StageOption>,
    pub answer_mode: AnswerMode,
    pub difficulty: u8,
    pub selected_option_ids: Vec<OptionId>,
    pub locked_option_ids: Option<Vec<OptionId>>,
    pub outcome: Option<StageOutcome>,
    pub timer: Option<StageTimer>,
    pub reveals: StageReveals,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagePlayClock {
    pub elapsed_ms: u64,
    pub running: bool,
}

/// The game half of `PlayStateForStage`. The presentation half — `decor`,
/// `currentScreen`, `overlay`, `revealModes` — is merged by P6.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageGameState {
    pub contract_version: u32,
    pub play_id: String,
    pub status: PlayStatus,
    pub teams: Vec<StageTeam>,
    pub ring: StageRing,
    pub domains: Vec<StageDomain>,
    pub session: Option<StageSession>,
    pub clock: StagePlayClock,
    pub leaderboard_revealed_ranks: Vec<u32>,
    /// Questions issued so far this Play, the current one included.
    pub questions_issued: u32,
}

/// Project a Play as of `now_ms`. Read-only, and cheap enough to run per
/// emission — the 100ms tick is a read, never a write.
pub fn project(play: &Play, now_ms: u64) -> StageGameState {
    let snapshot = play.snapshot();
    let ranks = play.ranks();

    let teams = snapshot
        .teams
        .iter()
        .zip(ranks)
        .map(|(team, rank)| StageTeam {
            id: team.id.clone(),
            name: team.name.clone(),
            short_code: team.short_code.clone(),
            color: team.color.clone(),
            logo_url: team.logo_url.clone(),
            detail: team.detail.clone(),
            score: play.score(&team.id),
            rank,
            turns_taken: play.ring().turns(&team.id),
            active: play.ring().is_active(&team.id),
        })
        .collect();

    let domains = snapshot
        .domains
        .iter()
        .map(|domain| {
            let next = play.next_question(&domain.id);
            StageDomain {
                id: domain.id.clone(),
                name: domain.name.clone(),
                code: domain.code.clone(),
                remaining: play.remaining_in(&domain.id),
                exhausted: next.is_none(),
                next_difficulty: next.map(|q| q.difficulty),
            }
        })
        .collect();

    StageGameState {
        contract_version: CONTRACT_VERSION,
        play_id: play.id().to_string(),
        status: play.status(),
        teams,
        ring: StageRing {
            order: play.ring().order().to_vec(),
            current_team_id: play.ring().current().cloned(),
            round_index: play.ring().round_index(),
        },
        domains,
        session: play.session().map(|s| project_session(s, now_ms)),
        clock: StagePlayClock {
            elapsed_ms: play.clock().elapsed_at(now_ms),
            running: play.clock().running(),
        },
        leaderboard_revealed_ranks: play.leaderboard_revealed_ranks().to_vec(),
        questions_issued: play.questions_issued(),
    }
}

fn project_session(session: &Session, now_ms: u64) -> StageSession {
    StageSession {
        question_id: session.question.id.clone(),
        domain_id: session.domain_id.clone(),
        stem: session.question.stem.clone(),
        options: session
            .question
            .options
            .iter()
            .map(|o| StageOption {
                id: o.id.clone(),
                text: o.text.clone(),
            })
            .collect(),
        answer_mode: session.question.answer_mode(),
        difficulty: session.question.difficulty,
        selected_option_ids: session.selected.clone(),
        locked_option_ids: session.locked.clone(),
        outcome: session.outcome.as_ref().map(|o| StageOutcome {
            verdict: o.verdict,
            points_awarded: o.points_awarded,
            correct_option_ids: o.correct_option_ids.clone(),
            bonus_awarded: o.bonus_awarded,
        }),
        timer: session.timer.as_ref().map(|t| StageTimer {
            duration_ms: t.duration_ms(),
            remaining_ms: t.remaining_at(now_ms),
            running: t.running(),
            remaining_ms_at_lock: t.remaining_ms_at_lock(),
            expired_open: t.expired_open(),
        }),
        reveals: StageReveals {
            stem: session.reveals.stem,
            option_ids: session.reveals.option_ids.clone(),
            outcome: session.reveals.outcome,
        },
    }
}
