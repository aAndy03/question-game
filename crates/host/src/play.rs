//! The Play — the materialized projection of the event log.
//!
//! Everything in here is derived. `Play::replay` folds a log into a `Play`, and
//! `Play::append` is the same fold plus one push, so the live state and a state
//! rebuilt on boot are the same computation (§2.10, §5.10). Undo is not an
//! exception: `TurnInverted` takes a span of the log out of the fold and the
//! projection is rebuilt, which is what "undo restores materialized Play state,
//! events are not rewritten" means in code (§2.7).
//!
//! The Play validates nothing. `MatchService` decides whether a command is
//! legal (§5.3) and only then appends; this module answers "given these facts,
//! what is true?".

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::error::{MatchError, MatchResult};
use crate::event::{Event, EventKind, active_inversions, is_inverted};
use crate::ids::{DomainId, PlayId, QuestionId, TeamId};
use crate::ring::Ring;
use crate::rules::{Verdict, competition_ranks};
use crate::session::{Outcome, Session};
use crate::snapshot::{PlaySnapshot, SnapshotQuestion};
use crate::timer::Timer;

/// Spec §5.1. Mirrors `PlayStatus` in `packages/contract`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum PlayStatus {
    Loaded,
    Playing,
    Paused,
    Completed,
    Abandoned,
    Restarted,
}

impl PlayStatus {
    pub fn is_open(self) -> bool {
        matches!(self, PlayStatus::Playing | PlayStatus::Paused)
    }

    /// The wire spelling, identical to the serde one and to `PlayStatus` in
    /// `packages/contract`. Stored in the `plays` projection, so it has to
    /// match what a query filters on.
    pub fn as_str(self) -> &'static str {
        match self {
            PlayStatus::Loaded => "loaded",
            PlayStatus::Playing => "playing",
            PlayStatus::Paused => "paused",
            PlayStatus::Completed => "completed",
            PlayStatus::Abandoned => "abandoned",
            PlayStatus::Restarted => "restarted",
        }
    }
}

/// How long the Play has been running, paused time excluded. Same shape as the
/// question timer: state changes only on events, elapsed is arithmetic.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct PlayClock {
    accumulated_ms: u64,
    running_since_ms: Option<u64>,
}

impl PlayClock {
    pub fn running(&self) -> bool {
        self.running_since_ms.is_some()
    }

    pub fn elapsed_at(&self, now_ms: u64) -> u64 {
        match self.running_since_ms {
            None => self.accumulated_ms,
            Some(since) => self.accumulated_ms + now_ms.saturating_sub(since),
        }
    }

    fn start(&mut self, now_ms: u64) {
        if self.running_since_ms.is_none() {
            self.running_since_ms = Some(now_ms);
        }
    }

    fn stop(&mut self, now_ms: u64) {
        self.accumulated_ms = self.elapsed_at(now_ms);
        self.running_since_ms = None;
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Play {
    snapshot: PlaySnapshot,
    status: PlayStatus,
    ring: Ring,
    scores: BTreeMap<TeamId, u32>,
    /// Consumed **for this Play only** (§2.1). The library keeps the question.
    consumed: BTreeSet<QuestionId>,
    session: Option<Session>,
    questions_issued: u32,
    /// Correct answers in a row on the *current* token — the cap and the bonus
    /// both read it, and it resets when the token moves (§5.4).
    consecutive_correct: u32,
    clock: PlayClock,
    leaderboard_revealed_ranks: Vec<u32>,
    events: Vec<Event>,
}

impl Play {
    /// `play_load` — the recipe is in Control, nothing has started (§5.1).
    pub fn load(snapshot: PlaySnapshot, at_ms: u64) -> Self {
        let order = snapshot.ring_order();
        let scores = order.iter().map(|id| (id.clone(), 0)).collect();
        let play_id = snapshot.play_id.clone();
        let mut play = Play {
            snapshot,
            status: PlayStatus::Loaded,
            ring: Ring::idle(order),
            scores,
            consumed: BTreeSet::new(),
            session: None,
            questions_issued: 0,
            consecutive_correct: 0,
            clock: PlayClock::default(),
            leaderboard_revealed_ranks: Vec::new(),
            events: Vec::new(),
        };
        let snapshot = Box::new(play.snapshot.clone());
        play.events.push(Event::new(
            &play_id,
            1,
            at_ms,
            EventKind::PlayLoaded { snapshot },
        ));
        play
    }

    /// Rebuild a Play from its log. The log is self-contained: its first event
    /// carries the snapshot.
    pub fn replay(events: &[Event]) -> MatchResult<Play> {
        let first = events.first().ok_or(MatchError::NoPlay)?;
        let EventKind::PlayLoaded { snapshot } = &first.kind else {
            return Err(MatchError::NoPlay);
        };

        let mut play = Play::load((**snapshot).clone(), first.at_ms);
        play.events = events.to_vec();

        let spans = active_inversions(events);
        for event in events.iter().skip(1) {
            if event.is_bookkeeping() || is_inverted(&spans, event.seq) {
                continue;
            }
            play.apply(event)?;
        }
        Ok(play)
    }

    pub fn id(&self) -> &PlayId {
        &self.snapshot.play_id
    }

    pub fn snapshot(&self) -> &PlaySnapshot {
        &self.snapshot
    }

    pub fn status(&self) -> PlayStatus {
        self.status
    }

    pub fn ring(&self) -> &Ring {
        &self.ring
    }

    pub fn session(&self) -> Option<&Session> {
        self.session.as_ref()
    }

    pub fn events(&self) -> &[Event] {
        &self.events
    }

    pub fn clock(&self) -> &PlayClock {
        &self.clock
    }

    pub fn questions_issued(&self) -> u32 {
        self.questions_issued
    }

    pub fn consecutive_correct(&self) -> u32 {
        self.consecutive_correct
    }

    pub fn leaderboard_revealed_ranks(&self) -> &[u32] {
        &self.leaderboard_revealed_ranks
    }

    pub fn score(&self, team: &TeamId) -> u32 {
        self.scores.get(team).copied().unwrap_or(0)
    }

    pub fn is_consumed(&self, question: &QuestionId) -> bool {
        self.consumed.contains(question)
    }

    pub fn consumed_count(&self) -> usize {
        self.consumed.len()
    }

    /// The next question this domain would issue: first in the queue that this
    /// Play has not consumed. Difficulty walks easy→hard because the queue is
    /// sorted, never because anyone picked (§5.2).
    pub fn next_question(&self, domain: &DomainId) -> Option<&SnapshotQuestion> {
        self.snapshot
            .domain(domain)?
            .questions
            .iter()
            .find(|q| !self.consumed.contains(&q.id))
    }

    pub fn remaining_in(&self, domain: &DomainId) -> usize {
        self.snapshot
            .domain(domain)
            .map(|d| {
                d.questions
                    .iter()
                    .filter(|q| !self.consumed.contains(&q.id))
                    .count()
            })
            .unwrap_or(0)
    }

    /// Every snapshot question consumed — the Play is over (§5.9).
    pub fn all_consumed(&self) -> bool {
        self.consumed.len() >= self.snapshot.total_questions()
    }

    /// Competition ranks in snapshot team order, ties sharing a rank (§4.4).
    pub fn ranks(&self) -> Vec<u32> {
        let scores: Vec<u32> = self
            .snapshot
            .teams
            .iter()
            .map(|t| self.score(&t.id))
            .collect();
        competition_ranks(&scores)
    }

    /// One active team: a rehearsal Play (§4.3). Legal, and worth a warn.
    pub fn is_rehearsal(&self) -> bool {
        self.ring.active_teams().count() == 1
    }

    /// Append a fact and fold it in. The caller has already decided the command
    /// was legal — this is where the log grows.
    pub fn append(&mut self, kind: EventKind, at_ms: u64) -> MatchResult<()> {
        let seq = self.events.len() as u64 + 1;
        let event = Event::new(self.id(), seq, at_ms, kind);

        if event.is_bookkeeping() {
            // An inversion changes which events count, so the projection is
            // rebuilt rather than patched.
            self.events.push(event);
            *self = Play::replay(&self.events.clone())?;
            return Ok(());
        }

        self.apply(&event)?;
        self.events.push(event);
        Ok(())
    }

    /// The fold step. Infallible in practice — a failure here means a command
    /// was appended without being validated first.
    fn apply(&mut self, event: &Event) -> MatchResult<()> {
        let at = event.at_ms;
        match &event.kind {
            EventKind::PlayLoaded { .. } => {}

            EventKind::PlayStarted => {
                self.status = PlayStatus::Playing;
                self.ring.start();
                self.clock.start(at);
            }
            EventKind::Paused => {
                self.status = PlayStatus::Paused;
                self.clock.stop(at);
                if let Some(timer) = self.session.as_mut().and_then(|s| s.timer.as_mut()) {
                    timer.suspend(at);
                }
            }
            EventKind::Resumed => {
                self.status = PlayStatus::Playing;
                self.clock.start(at);
            }

            EventKind::TokenGiven { team } => {
                self.ring.give_token(team)?;
                self.consecutive_correct = 0;
            }
            EventKind::QuestionIssued {
                domain,
                question,
                team,
                timer_duration_ms,
            } => {
                let (_, body) = self
                    .snapshot
                    .question(question)
                    .ok_or_else(|| MatchError::UnknownQuestion(question.clone()))?;
                self.session = Some(Session::issue(
                    body.clone(),
                    domain.clone(),
                    team.clone(),
                    timer_duration_ms.map(Timer::new),
                ));
                self.questions_issued += 1;
            }

            EventKind::StemRevealed => {
                self.session_mut()?.reveals.stem = true;
            }
            EventKind::OptionRevealed { option } => {
                let reveals = &mut self.session_mut()?.reveals;
                if !reveals.option_ids.contains(option) {
                    reveals.option_ids.push(option.clone());
                }
            }
            EventKind::SelectionSet { options } => {
                self.session_mut()?.selected = options.clone();
            }

            EventKind::TimerStarted => {
                self.timer_mut()?.start(at)?;
            }
            EventKind::TimerPaused => {
                self.timer_mut()?.pause(at)?;
            }
            EventKind::TimerExpired { open } => {
                let timer = self.timer_mut()?;
                timer.expire(at);
                if *open {
                    timer.mark_expired_open();
                }
            }
            EventKind::SelectionLocked { options, .. } => {
                let session = self.session_mut()?;
                session.locked = Some(options.clone());
                if let Some(timer) = session.timer.as_mut() {
                    timer.lock(at);
                }
            }

            EventKind::TurnResolved {
                verdict,
                points_awarded,
                bonus_awarded,
                token_ends,
            } => {
                let session = self.session_mut()?;
                session.reveals.outcome = true;
                session.outcome = Some(Outcome {
                    verdict: *verdict,
                    points_awarded: *points_awarded,
                    bonus_awarded: *bonus_awarded,
                    correct_option_ids: session.question.correct_option_ids.clone(),
                    token_ends: *token_ends,
                });
                let team = session.team_id.clone();
                let question = session.question.id.clone();

                self.consumed.insert(question);
                *self.scores.entry(team).or_insert(0) +=
                    points_awarded + bonus_awarded.unwrap_or(0);
                self.consecutive_correct = if *verdict == Verdict::Correct {
                    self.consecutive_correct + 1
                } else {
                    0
                };
                if *token_ends {
                    self.ring.end_token();
                    self.consecutive_correct = 0;
                }
            }

            EventKind::RingReordered { order } => {
                self.ring.reorder(order.clone())?;
            }
            EventKind::LeaderboardRankRevealed { rank } => {
                if !self.leaderboard_revealed_ranks.contains(rank) {
                    self.leaderboard_revealed_ranks.push(*rank);
                }
            }

            EventKind::PlayCompleted => {
                self.status = PlayStatus::Completed;
                self.clock.stop(at);
            }
            EventKind::PlayAbandoned => {
                self.status = PlayStatus::Abandoned;
                self.clock.stop(at);
            }
            EventKind::PlayRestarted { .. } => {
                self.status = PlayStatus::Restarted;
                self.clock.stop(at);
            }

            // Who is at the keyboard is a fact about the show, not about the
            // game: nothing in the projection reads it.
            EventKind::OperatorSwitched { .. } => {}

            EventKind::TurnInverted { .. } | EventKind::TurnReapplied { .. } => {}
        }
        Ok(())
    }

    fn session_mut(&mut self) -> MatchResult<&mut Session> {
        self.session.as_mut().ok_or(MatchError::SessionNotIssued)
    }

    fn timer_mut(&mut self) -> MatchResult<&mut Timer> {
        self.session_mut()?
            .timer
            .as_mut()
            .ok_or(MatchError::TimerDisabled)
    }
}
