//! `MatchService` — the only writer of a Play.
//!
//! One module hides the ring, the session machine, the timer, three award
//! modes, the cap and bonus, per-Play consumption, and the append-only log with
//! its inversions. The interface is the §13 command list; the invariants a
//! caller cannot read off the signatures are:
//!
//! - **`Select → Lock → Reveal`**, and reveal is the only point that scores and
//!   consumes (§2.4). Lock does not score. An override does not score.
//! - **The round invariant** (§5.4). `give_token` and `reorder_ring` reject an
//!   illegal target instead of quietly rearranging the sequence.
//! - **Error modes are the §5.3 reject table** — see [`MatchError`].
//! - **No clock inside.** Every command takes the millisecond it happened at,
//!   which is what makes the log replayable and the tests deterministic.
//!
//! A rejected command appends nothing. There is no path here that writes a
//! game-affecting setting: those froze at `play_start` (§2.5).

use crate::award::award_points;
use crate::error::{MatchError, MatchResult};
use crate::event::{EventKind, active_inversions, is_inverted};
use crate::ids::{DomainId, OperatorId, PlayId, OptionId, TeamId};
use crate::play::{Play, PlayStatus};
use crate::rules::{Verdict, judge};
use crate::session::Session;
use crate::settings::LiveSettings;
use crate::snapshot::PlaySnapshot;

/// §2.7: Restart is a new Play now, on the same recipe.
pub enum RestartMode {
    /// Reuse the snapshot bodies — the same questions, from the top.
    SameQuestions { new_play_id: PlayId },
    /// Re-read the recipe as it is now; `CatalogService` builds the snapshot.
    DifferentQuestions { snapshot: Box<PlaySnapshot> },
}

#[derive(Default)]
pub struct MatchService {
    play: Option<Play>,
    /// Control-behaviour settings. Live for the whole Play (§2.5) — the frozen
    /// ones live in the snapshot, where nothing can reach them.
    live: LiveSettings,
}

impl MatchService {
    pub fn new() -> Self {
        MatchService::default()
    }

    pub fn live_settings(&self) -> &LiveSettings {
        &self.live
    }

    /// Control-behaviour only. There is deliberately no sibling that writes a
    /// frozen setting.
    pub fn set_live_settings(&mut self, live: LiveSettings) {
        self.live = live;
    }

    // ---------------------------------------------------------------- lifecycle

    /// `play_load` — put a recipe into Control (§5.1). Refused while another
    /// Play is open, so two Plays of one recipe can never be `playing` (§4.3).
    ///
    /// The snapshot's frozen settings are checked against the §4.2 interlocks
    /// on the way in. `FlagService` already refuses an illegal write, so a
    /// snapshot built by this host is legal by construction — but one can also
    /// arrive from a database row written by an older build, and a Play that
    /// started on an illegal document would score wrong for its whole life
    /// instead of failing at the door.
    pub fn play_load(&mut self, snapshot: PlaySnapshot, now_ms: u64) -> MatchResult<()> {
        snapshot.settings.validate()?;
        if let Some(open) = self.play.as_ref().filter(|p| p.status().is_open()) {
            return Err(MatchError::WrongStatus {
                actual: open.status(),
                expected: vec![
                    PlayStatus::Completed,
                    PlayStatus::Abandoned,
                    PlayStatus::Restarted,
                ],
            });
        }
        self.play = Some(Play::load(snapshot, now_ms));
        Ok(())
    }

    /// Take back a Play that was replayed from its log
    /// (`CatalogService::resume_open_play`). The boot path, and the only way a
    /// Play enters this service without being loaded from a snapshot.
    ///
    /// It is not a back door: the Play arrived as a fold over an append-only
    /// log this service wrote, so adopting it is the same computation
    /// `MatchService` would have done live. The settings are re-validated for
    /// the reason [`Self::play_load`] gives — the row may come from an older
    /// build — and another open Play is refused the same way.
    pub fn adopt(&mut self, play: Play) -> MatchResult<()> {
        play.snapshot().settings.validate()?;
        if let Some(open) = self.play.as_ref().filter(|p| p.status().is_open()) {
            return Err(MatchError::WrongStatus {
                actual: open.status(),
                expected: vec![
                    PlayStatus::Completed,
                    PlayStatus::Abandoned,
                    PlayStatus::Restarted,
                ],
            });
        }
        self.play = Some(play);
        Ok(())
    }

    /// `play_start`. Fails on an empty board; one team is allowed (rehearsal,
    /// §4.3) — [`Play::is_rehearsal`] is what raises the warn.
    pub fn play_start(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Loaded])?;
        let play = self.play_mut()?;
        if play.snapshot().total_questions() == 0 {
            return Err(MatchError::BoardEmpty);
        }
        play.append(EventKind::PlayStarted, now_ms)
    }

    pub fn pause(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Playing])?;
        self.play_mut()?.append(EventKind::Paused, now_ms)
    }

    pub fn resume(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Paused])?;
        self.play_mut()?.append(EventKind::Resumed, now_ms)
    }

    pub fn abandon(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        self.play_mut()?.append(EventKind::PlayAbandoned, now_ms)
    }

    /// `restart`. Closes the current Play and opens a new one immediately.
    /// Returns the closed Play so the caller can persist it (§2.8: Play records
    /// under a recipe).
    ///
    /// A **completed** Play may be restarted — the board is empty and playing
    /// it again is the obvious next act, so Control offers it there. A Play
    /// that was abandoned or already restarted may not: it is a closed record,
    /// and appending `PlayRestarted` to it would overwrite how it ended. The
    /// way to play that recipe again is to load it (§5.1).
    pub fn restart(&mut self, mode: RestartMode, now_ms: u64) -> MatchResult<Play> {
        self.require_status(&[
            PlayStatus::Playing,
            PlayStatus::Paused,
            PlayStatus::Completed,
        ])?;
        let old = self.play.as_ref().ok_or(MatchError::NoPlay)?;
        let (snapshot, same_questions) = match mode {
            RestartMode::SameQuestions { new_play_id } => {
                let mut snapshot = old.snapshot().clone();
                snapshot.play_id = new_play_id;
                (snapshot, true)
            }
            RestartMode::DifferentQuestions { snapshot } => (*snapshot, false),
        };

        let new_play_id = snapshot.play_id.clone();
        let play = self.play_mut()?;
        play.append(
            EventKind::PlayRestarted {
                new_play_id,
                same_questions,
            },
            now_ms,
        )?;
        let closed = self.play.take().expect("play was present");
        // The new Play is a new log, and who is running the show did not
        // change because the operator pressed Restart — carry the fact over,
        // or the restarted Play would belong to nobody in Statistics and in
        // the operator's own count.
        let operator = closed.operator_id().cloned();

        self.play = Some(Play::load(snapshot, now_ms));
        if let Some(operator_id) = operator {
            self.operator_switched(operator_id, now_ms)?;
        }
        self.play_start(now_ms)?;
        Ok(closed)
    }

    /// `play_unload` — take the recipe out of Control (§5.1's other direction).
    ///
    /// Available whenever something is loaded, whatever its status: the
    /// operator has to be able to put a game down. An **open** Play is
    /// abandoned on the way out and returned so the caller can persist it —
    /// a Play that vanished while still `playing` would be resumed at the next
    /// boot, which is the opposite of what unloading means. A closed one is
    /// already a record and is returned untouched.
    ///
    /// Returns `None` when nothing was loaded, so the command is idempotent.
    pub fn unload(&mut self, now_ms: u64) -> MatchResult<Option<Play>> {
        let Some(play) = self.play.as_ref() else {
            return Ok(None);
        };
        // Anything not already closed is closed on the way out — a Play that
        // was only *loaded* included. A `loaded` row is resumed by nothing and
        // reached by no cleanup (`wipe_plays` takes closed records only), so
        // leaving one behind would strand it in the library for ever.
        if matches!(
            play.status(),
            PlayStatus::Loaded | PlayStatus::Playing | PlayStatus::Paused
        ) {
            self.play_mut()?.append(EventKind::PlayAbandoned, now_ms)?;
        }
        Ok(self.play.take())
    }

    /// `get_state`. The projection every read surface renders — Studio, Stage
    /// and Statistics all read this, and none of them writes.
    pub fn get_state(&self) -> Option<&Play> {
        self.play.as_ref()
    }

    /// Another operator took the keyboard (§2.26). Appended while a Play is
    /// **loaded, playing or paused** — with no Play there is no log for the
    /// fact to land in, and a closed one is a record that may not move. That is
    /// not a refusal: the switch itself is a settings write that already
    /// happened. Nothing in the projection changes, and the timer keeps running.
    ///
    /// `Loaded` counts because a loaded Play already has a log (its first event
    /// carries the snapshot), and `play_load` is where the app records who is
    /// running the show. Reading `is_open` here instead — which is
    /// `playing | paused` — meant the fact was dropped at the one moment it was
    /// always available, and every Play belonged to nobody.
    pub fn operator_switched(&mut self, operator_id: OperatorId, now_ms: u64) -> MatchResult<()> {
        let takes_events = self.play.as_ref().is_some_and(|play| {
            matches!(
                play.status(),
                PlayStatus::Loaded | PlayStatus::Playing | PlayStatus::Paused
            )
        });
        if !takes_events {
            return Ok(());
        }
        self.play_mut()?
            .append(EventKind::OperatorSwitched { operator_id }, now_ms)
    }

    // ------------------------------------------------------------------ session

    /// `choose_domain` — issues the next unconsumed question of that domain.
    /// The operator picks a domain, never a question or a difficulty (§5.2).
    pub fn choose_domain(&mut self, domain: &DomainId, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Playing])?;
        let play = self.play_mut()?;

        let team = play.ring().current().cloned().ok_or(MatchError::NoToken)?;
        if play.session().is_some_and(|s| !s.is_resolved()) {
            return Err(MatchError::SessionAlreadyIssued);
        }
        if play.snapshot().domain(domain).is_none() {
            return Err(MatchError::UnknownDomain(domain.clone()));
        }
        let question = play
            .next_question(domain)
            .ok_or_else(|| MatchError::DomainEmpty(domain.clone()))?;
        let question_id = question.id.clone();
        let duration = question.duration_ms;
        let timer_duration_ms = play.snapshot().settings.timer.resolve(duration);

        play.append(
            EventKind::QuestionIssued {
                domain: domain.clone(),
                question: question_id,
                team,
                timer_duration_ms,
            },
            now_ms,
        )
    }

    /// `reveal_stem`. A `PresentationService` command that writes through here,
    /// because reveal state has to survive undo and read the same in Stage and
    /// Viewer (§13).
    pub fn reveal_stem(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        self.require_live_session()?;
        self.play_mut()?.append(EventKind::StemRevealed, now_ms)
    }

    /// `reveal_next_option` — the next option in authored order. Already-shown
    /// options are not re-revealed, and nothing unmounts (§2.6).
    pub fn reveal_next_option(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let session = self.require_live_session()?;
        let Some(option) = session.next_unrevealed_option().cloned() else {
            return Ok(());
        };
        self.play_mut()?
            .append(EventKind::OptionRevealed { option }, now_ms)
    }

    /// FinalLeaderboard reveal, lowest rank first (§5.5). Tied teams share a
    /// rank and so reveal together — one rank, one call.
    ///
    /// A **completed** Play is the normal case, not the edge one: the board is
    /// exhausted before the final standings go up, and `reveal_outcome` appends
    /// `PlayCompleted` the moment the last question resolves. Playing and paused
    /// stay legal so the operator can rehearse the screen mid-show.
    pub fn reveal_leaderboard_rank(&mut self, rank: u32, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[
            PlayStatus::Playing,
            PlayStatus::Paused,
            PlayStatus::Completed,
        ])?;
        // A rank nobody holds reveals nothing, so it is a caller's mistake
        // rather than an operator's choice: `1, 1, 3` has no place 2, and a
        // caller counting finishing positions instead of ranks would land
        // there silently.
        if !self.play_mut()?.ranks().contains(&rank) {
            return Err(MatchError::UnknownRank(rank));
        }
        self.play_mut()?
            .append(EventKind::LeaderboardRankRevealed { rank }, now_ms)
    }

    /// `set_selection` — the working choice. Does not stop the timer and is not
    /// scored (§2.4). Duplicates are collapsed; order is kept, because
    /// `judging.order_matters` may be on.
    ///
    /// The host does not cap a single-answer question at one selection: judging
    /// already handles an over-selection as an extra-selection outcome, and
    /// refusing it here would invent a rule the spec does not state.
    pub fn set_selection(&mut self, options: &[OptionId], now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let session = self.require_live_session()?;
        if session.is_locked() {
            return Err(MatchError::AlreadyLocked);
        }
        for id in options {
            if !session.has_option(id) {
                return Err(MatchError::UnknownOption(id.clone()));
            }
        }
        let mut deduped: Vec<OptionId> = Vec::with_capacity(options.len());
        for id in options {
            if !deduped.contains(id) {
                deduped.push(id.clone());
            }
        }
        self.play_mut()?
            .append(EventKind::SelectionSet { options: deduped }, now_ms)
    }

    /// `lock_selection` — freezes the choice and stops the clock (§2.4). An
    /// empty set is refused: revealing nothing is how a team scores zero, and
    /// that is a reveal, not a lock.
    pub fn lock_selection(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let session = self.require_live_session()?;
        if session.is_locked() {
            return Err(MatchError::AlreadyLocked);
        }
        if session.selected.is_empty() {
            return Err(MatchError::EmptySelection);
        }
        let options = session.selected.clone();
        let remaining_ms_at_lock = session.timer.as_ref().map(|t| t.remaining_at(now_ms));

        self.play_mut()?.append(
            EventKind::SelectionLocked {
                options,
                remaining_ms_at_lock,
                auto: false,
            },
            now_ms,
        )
    }

    /// `start_timer`. Rejected at operator pace, and while the Play is paused —
    /// resuming the Play is what lets the clock run again (§5.1).
    pub fn start_timer(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Playing])?;
        let session = self.require_live_session()?;
        if session.is_locked() {
            return Err(MatchError::AlreadyLocked);
        }
        let timer = session.timer.as_ref().ok_or(MatchError::TimerDisabled)?;
        if timer.running() {
            return Err(MatchError::TimerAlreadyRunning);
        }
        if timer.at_zero(now_ms) {
            return Err(MatchError::TimerAtZero);
        }
        self.play_mut()?.append(EventKind::TimerStarted, now_ms)
    }

    pub fn pause_timer(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let session = self.require_live_session()?;
        let timer = session.timer.as_ref().ok_or(MatchError::TimerDisabled)?;
        if !timer.running() {
            return Err(MatchError::TimerNotRunning);
        }
        self.play_mut()?.append(EventKind::TimerPaused, now_ms)
    }

    /// The 100ms host tick. It carries no authority of its own: it applies the
    /// §2.4 T=0 table **at the computed zero instant**, so a late tick scores
    /// exactly what a punctual one would.
    pub fn tick(&mut self, now_ms: u64) -> MatchResult<()> {
        let Some(play) = self.play.as_ref() else {
            return Ok(());
        };
        if play.status() != PlayStatus::Playing {
            return Ok(());
        }
        let Some(session) = play.session() else {
            return Ok(());
        };
        if session.is_resolved() || session.is_locked() {
            return Ok(());
        }
        let Some(timer) = session.timer.as_ref() else {
            return Ok(());
        };
        let Some(zero_at) = timer.zero_at().filter(|zero| *zero <= now_ms) else {
            return Ok(());
        };

        // T=0: something selected auto-locks, nothing selected stays open.
        // Neither auto-reveals — Stage never resolves a question by itself.
        let selected = session.selected.clone();
        let open = selected.is_empty();

        let play = self.play_mut()?;
        play.append(EventKind::TimerExpired { open }, zero_at)?;
        if !open {
            play.append(
                EventKind::SelectionLocked {
                    options: selected,
                    remaining_ms_at_lock: Some(0),
                    auto: true,
                },
                zero_at,
            )?;
        }
        Ok(())
    }

    /// `reveal_outcome` — judge, consume, score, and end the token if the
    /// answer was wrong or the cap is reached (§5.3 step 4). The only writer of
    /// points in the whole system.
    pub fn reveal_outcome(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let session = self.require_live_session()?;
        let settings = &self
            .play
            .as_ref()
            .expect("play present")
            .snapshot()
            .settings;

        let judgement = judge(
            session.locked.as_deref(),
            &session.question.correct_option_ids,
            &settings.judging,
        );
        let points_awarded = award_points(
            &settings.scoring,
            &settings.judging,
            session.question.difficulty,
            &judgement,
            session.remaining_ms_at_lock(),
            session.timer_duration_ms(),
        );

        let correct = judgement.verdict == Verdict::Correct;
        let play = self.play.as_ref().expect("play present");
        let consecutive = if correct {
            play.consecutive_correct() + 1
        } else {
            0
        };

        // The bonus lands on the answer that reaches the count, once per token.
        let bonus_awarded = settings
            .turn
            .bonus_after_consecutive
            .filter(|bonus| correct && consecutive == bonus.count)
            .map(|bonus| bonus.award);

        // The cap ends the token after n consecutive corrects. The last answer
        // stays correct and still scores (§4.4).
        let capped = settings
            .turn
            .max_consecutive_correct
            .is_some_and(|cap| correct && consecutive >= cap);
        let token_ends = !correct || capped;

        self.play_mut()?.append(
            EventKind::TurnResolved {
                verdict: judgement.verdict,
                points_awarded,
                bonus_awarded,
                token_ends,
            },
            now_ms,
        )?;

        if self.play.as_ref().is_some_and(Play::all_consumed) {
            self.play_mut()?.append(EventKind::PlayCompleted, now_ms)?;
        }
        Ok(())
    }

    // --------------------------------------------------------------------- ring

    /// `give_token`. Refused while a question is issued and unrevealed —
    /// §2.6 path 2: reveal is required, then scoring, then the token may move.
    /// `override.after_lock` decides whether Control *shows* the button, not
    /// whether the host accepts it; `allow` pairs with [`Self::reveal_and_pass`].
    pub fn give_token(&mut self, target: &TeamId, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        if self
            .play
            .as_ref()
            .and_then(Play::session)
            .is_some_and(|s| !s.is_resolved())
        {
            return Err(MatchError::OverrideRefusedUntilReveal);
        }
        let play = self.play_mut()?;
        if !play.ring().is_legal_target(target) {
            return Err(MatchError::IllegalTokenTarget {
                target: target.clone(),
                legal: play.ring().legal_targets(),
            });
        }
        play.append(
            EventKind::TokenGiven {
                team: target.clone(),
            },
            now_ms,
        )
    }

    /// The two-click **Reveal & pass** of §2.6 as one command: reveal the
    /// locked answer, then move the token. Atomic — an illegal target is
    /// refused *before* anything is revealed, so the operator never ends up
    /// having scored a question they meant to hand over first.
    pub fn reveal_and_pass(&mut self, target: &TeamId, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let play = self.play.as_ref().ok_or(MatchError::NoPlay)?;
        if !play.ring().is_legal_target(target) {
            return Err(MatchError::IllegalTokenTarget {
                target: target.clone(),
                legal: play.ring().legal_targets(),
            });
        }
        if play.session().is_some_and(|s| !s.is_resolved()) {
            self.reveal_outcome(now_ms)?;
        }
        self.give_token(target, now_ms)
    }

    /// `reorder_ring` — the future ring only (§5.4). Teams that have already
    /// played this round, and the token holder, keep their places.
    pub fn reorder_ring(&mut self, order: Vec<TeamId>, now_ms: u64) -> MatchResult<()> {
        self.require_open()?;
        let play = self.play_mut()?;
        // Probe first: a refused reorder must append nothing.
        play.ring().clone().reorder(order.clone())?;
        play.append(EventKind::RingReordered { order }, now_ms)
    }

    // --------------------------------------------------------------------- undo

    /// `undo_turn` (§2.7). Appends `TurnInverted`, which takes the last resolved
    /// turn — and anything appended after it — out of the projection. No event
    /// is edited or removed; the log only grows.
    pub fn undo_turn(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_undoable()?;
        let play = self.play.as_ref().ok_or(MatchError::NoPlay)?;
        let events = play.events();
        let spans = active_inversions(events);

        let resolve = events
            .iter()
            .rev()
            .find(|e| {
                matches!(e.kind, EventKind::TurnResolved { .. }) && !is_inverted(&spans, e.seq)
            })
            .ok_or(MatchError::NothingToUndo)?;

        // The turn starts where its question was issued, so undoing returns the
        // question to the pool and the token to the team that held it.
        let from_seq = events
            .iter()
            .rev()
            .filter(|e| e.seq <= resolve.seq && !is_inverted(&spans, e.seq))
            .find(|e| matches!(e.kind, EventKind::QuestionIssued { .. }))
            .map(|e| e.seq)
            .unwrap_or(resolve.seq);
        let to_seq = events.last().map(|e| e.seq).unwrap_or(resolve.seq);
        let target_event_id = resolve.id.clone();

        self.play_mut()?.append(
            EventKind::TurnInverted {
                target_event_id,
                from_seq,
                to_seq,
            },
            now_ms,
        )
    }

    /// Whether [`Self::undo_turn`] would succeed. A read, for the Timeline's
    /// button state — Control asks rather than trying the command and catching
    /// the refusal, because an attempted-and-refused undo is a notice.
    pub fn can_undo(&self) -> bool {
        if self.require_undoable().is_err() {
            return false;
        }
        let Some(play) = self.play.as_ref() else {
            return false;
        };
        let spans = active_inversions(play.events());
        play.events().iter().any(|e| {
            matches!(e.kind, EventKind::TurnResolved { .. }) && !is_inverted(&spans, e.seq)
        })
    }

    /// Whether [`Self::redo_turn`] would succeed — that is, whether the undo is
    /// still the last thing that happened (§5.8).
    pub fn can_redo(&self) -> bool {
        self.require_undoable().is_ok()
            && self.play.as_ref().is_some_and(|play| {
                matches!(
                    play.events().last().map(|e| &e.kind),
                    Some(EventKind::TurnInverted { .. })
                )
            })
    }

    /// `redo_turn` (§5.8). Legal only while the undo is still the last thing
    /// that happened: once the operator has done something else, the way
    /// forward is a fresh resolve, not a reapplication.
    pub fn redo_turn(&mut self, now_ms: u64) -> MatchResult<()> {
        self.require_undoable()?;
        let play = self.play.as_ref().ok_or(MatchError::NoPlay)?;
        let last = play.events().last().ok_or(MatchError::NothingToRedo)?;
        let EventKind::TurnInverted {
            target_event_id, ..
        } = &last.kind
        else {
            return Err(MatchError::NothingToRedo);
        };
        let target_event_id = target_event_id.clone();
        self.play_mut()?
            .append(EventKind::TurnReapplied { target_event_id }, now_ms)
    }

    // ------------------------------------------------------------------ helpers

    fn play_mut(&mut self) -> MatchResult<&mut Play> {
        self.play.as_mut().ok_or(MatchError::NoPlay)
    }

    fn require_status(&self, expected: &[PlayStatus]) -> MatchResult<()> {
        let actual = self.play.as_ref().ok_or(MatchError::NoPlay)?.status();
        if expected.contains(&actual) {
            Ok(())
        } else {
            Err(MatchError::WrongStatus {
                actual,
                expected: expected.to_vec(),
            })
        }
    }

    /// Playing or paused. Select, lock, reveal and override stay available
    /// while paused (§5.1).
    fn require_open(&self) -> MatchResult<()> {
        self.require_status(&[PlayStatus::Playing, PlayStatus::Paused])
    }

    /// Undo also reaches a Play that has just completed: the last question of
    /// the board is exactly the one an operator is most likely to want back
    /// (§2.7 — undo restores materialized state, and completion is state). A
    /// Play that was abandoned or restarted is a closed record and stays closed.
    fn require_undoable(&self) -> MatchResult<()> {
        self.require_status(&[
            PlayStatus::Playing,
            PlayStatus::Paused,
            PlayStatus::Completed,
        ])
    }

    /// A question that is issued and not yet resolved.
    fn require_live_session(&self) -> MatchResult<&Session> {
        let session = self
            .play
            .as_ref()
            .ok_or(MatchError::NoPlay)?
            .session()
            .ok_or(MatchError::SessionNotIssued)?;
        if session.is_resolved() {
            return Err(MatchError::AlreadyResolved);
        }
        Ok(session)
    }
}
