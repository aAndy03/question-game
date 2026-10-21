//! `PresentationService` — what the operator has chosen to show.
//!
//! It owns three things and no fourth: the **current screen**, the **overlay
//! queue**, and the **decor settings** the recipe's layout carries. Everything
//! else it appears to own it borrows:
//!
//! - **Reveals are Play state.** `reveal_stem`, `reveal_next_option` and
//!   `reveal_leaderboard_rank` write *through* [`MatchService`] (§13), because
//!   a reveal has to survive undo and read identically in Stage and Viewer. The
//!   methods here take `&mut MatchService` for exactly that reason: there is no
//!   way to spell a second writer.
//! - **`revealModes` comes from `FlagService`** and is passed in per call, like
//!   `overlay_animations.enabled`. A stored copy of a setting is the drift
//!   §2.16 forbids.
//! - **GSAP is on the other side of the wire.** This module never names a
//!   timeline. It emits a queue and consumes `anim-complete`; the Stage
//!   webview's `presentation/` decides how anything moves.
//!
//! # The handshake
//!
//! Stage reports every timeline once, with a contract `AnimKey`, and
//! [`PresentationService::anim_complete`] is the single door that takes them.
//! Two things happen there:
//!
//! 1. An `overlay:<kind>` key retires the running overlay and promotes the
//!    pending one — the queue never advances on a clock (§2.6: *do not `kill()`
//!    mid-beat*).
//! 2. An auto-mode channel chains its next beat (§4.2). This is host-side on
//!    purpose: the beat is an append to the Play, so Stage driving it would be
//!    a second writer. Stage still receives `revealModes` because it must know
//!    whether a node is waiting for a human.
//!
//! `reveal.outcome` has no chained command: the outcome node becomes visible as
//! part of `reveal_outcome`, which is the only thing that scores (§2.4). The
//! channel still reaches Stage, which is where the outcome's arrival animates.

use crate::error::{MatchError, MatchResult};
use crate::flags::AudioSettings;
use crate::play::PlayStatus;
use crate::service::MatchService;
use crate::settings::{Language, RevealChannel, RevealMode, RevealSettings};
use crate::snapshot::AnswerMode;
use crate::stage::{
    OverlayRequest, PlayStateForStage, StageDecorSettings, StageGameState, StageLayoutNodes,
    StageOverlay, StageScreen,
};

/// The current screen, the overlay queue, and the recipe's decor settings.
#[derive(Debug, Clone, Default)]
pub struct PresentationService {
    screen: StageScreen,
    /// Running. Retired only by an `anim-complete` for its own key.
    active: Option<OverlayRequest>,
    /// Which occurrence `active` is — see [`crate::stage::StageOverlay::run_id`].
    /// Bumped every time something *becomes* active, which is the only way
    /// Stage can tell one run from an identical one that follows it.
    run_id: u64,
    /// Waiting. Queue depth is one, and a newer request replaces an older one
    /// (§2.6) rather than growing a backlog nobody asked to watch.
    pending: Option<OverlayRequest>,
    decor: StageDecorSettings,
    /// The recipe's Screens-tab overrides (`nodes` and `screens`), passed
    /// through untouched: `packages/contract/src/layout.ts` owns the shape and
    /// Stage validates on receipt. Presentation only — nothing here is read
    /// by a rule.
    layout: StageLayoutNodes,
}

impl PresentationService {
    pub fn new() -> Self {
        PresentationService::default()
    }

    pub fn screen(&self) -> StageScreen {
        self.screen
    }

    /// `overlay.busy` — the §2.16 runtime flag. Built into `RuntimeContext` at
    /// the call site; `FlagService` never stores it.
    pub fn overlay_busy(&self) -> bool {
        self.active.is_some()
    }

    pub fn decor(&self) -> StageDecorSettings {
        self.decor
    }

    /// From `recipe.layout` (§11.C). Live-updatable: decor affects nothing
    /// scored, so a Screens-tab edit lands mid-Play without a freeze.
    pub fn set_decor(&mut self, decor: StageDecorSettings) {
        self.decor = decor;
    }

    pub fn layout(&self) -> &StageLayoutNodes {
        &self.layout
    }

    /// From `recipe.layout` (P9). Live-updatable like decor: a Screens edit
    /// the operator cannot see on Stage is useless, and it affects no score.
    pub fn set_layout(&mut self, layout: StageLayoutNodes) {
        self.layout = layout;
    }

    // ------------------------------------------------------------------ screens

    /// `show_screen`. The operator may jump to any screen at any time — that is
    /// why every ordered pair has a transition (§5.6) — with one guard: before
    /// `play_start` there is no roster, no board and no score, so only Idle is
    /// legal.
    ///
    /// Jumping onto the screen the operator skipped is what enqueues an overlay
    /// (§2.6), but that is [`Self::observe`]'s job, not this one: the cause is a
    /// change in the Play, not a change of screen.
    pub fn show_screen(
        &mut self,
        screen: StageScreen,
        status: Option<PlayStatus>,
    ) -> MatchResult<()> {
        let started = matches!(
            status,
            Some(PlayStatus::Playing | PlayStatus::Paused | PlayStatus::Completed)
        );
        if !started && !screen.available_before_play() {
            return Err(MatchError::WrongStatus {
                actual: status.unwrap_or(PlayStatus::Loaded),
                expected: vec![
                    PlayStatus::Playing,
                    PlayStatus::Paused,
                    PlayStatus::Completed,
                ],
            });
        }
        self.screen = screen;
        Ok(())
    }

    /// The recipe left Control (`play_unload`). Back to Idle with an empty
    /// queue: the screens are the same whatever is loaded, so nothing here is
    /// destroyed — the Stage window stays where the operator put it and simply
    /// shows the idle screen again, ready for the next game.
    ///
    /// Decor and layout stay as they are; the next `play_load` sets them.
    pub fn reset(&mut self) {
        self.screen = StageScreen::default();
        self.active = None;
        self.pending = None;
    }

    // ------------------------------------------------------------- overlay queue

    /// `show_overlay` — the operator calling an overlay by hand, over whatever
    /// screen is up (§5.6). It is the *same* enqueue the automatic path uses:
    /// Stage cannot tell them apart, and neither can this module.
    pub fn show_overlay(&mut self, request: OverlayRequest, enabled: bool) {
        self.enqueue(request, enabled);
    }

    /// `overlay_animations.enabled = false` skips the queue entirely; the token
    /// still moves, because the token is Play state and this is not (§5.6).
    fn enqueue(&mut self, request: OverlayRequest, enabled: bool) {
        if !enabled {
            return;
        }
        if self.active.is_none() {
            self.run(request);
        } else {
            self.pending = Some(request);
        }
    }

    /// Put a request on air. One place, so the occurrence counter cannot be
    /// bumped by an enqueue and forgotten by a promotion.
    fn run(&mut self, request: OverlayRequest) {
        self.active = Some(request);
        self.run_id += 1;
    }

    pub fn active_overlay(&self) -> Option<&OverlayRequest> {
        self.active.as_ref()
    }

    /// Retire the running overlay and promote the pending one. Returns whether
    /// the key matched: a stale ack — for an overlay that already retired, or
    /// for a transition or reveal key — advances nothing and is not an error.
    /// Stage reports *every* timeline, so most keys arriving here are not ours.
    fn ack_overlay(&mut self, key: &str) -> bool {
        if self.active.as_ref().is_none_or(|o| o.anim_key() != key) {
            return false;
        }
        self.active = None;
        if let Some(next) = self.pending.take() {
            self.run(next);
        }
        true
    }

    // ----------------------------------------------------------- automatic causes

    /// Enqueue the overlays whose causes just occurred, by diffing the game
    /// projection across one command.
    ///
    /// The diff is the cause, not the command: §5.6 says every kind is enqueued
    /// automatically **when its cause occurs**, and the same cause can come from
    /// `reveal_outcome`, from an override, or from an undo putting the token
    /// back. One diff covers all of them, and a new command needs no entry here.
    ///
    /// `current-team` has no automatic cause of its own — its cause is the
    /// handoff, which `token-handoff` already animates. It stays operator-called
    /// (§5.6 allows any kind by hand at any time).
    pub fn observe(&mut self, prev: &StageGameState, next: &StageGameState, enabled: bool) {
        // A Restart is a new Play (§2.7). Nothing queued for the old one
        // applies, so the queue is emptied — but the new Play's own causes are
        // still causes, and its opening token is the first one of a show. The
        // rest of the diff is meaningless across two Plays (a fresh ring is not
        // an advance of the old one), so only that cause is carried over.
        if next.play_id != prev.play_id {
            self.active = None;
            self.pending = None;
            if let Some(to) = next.ring.current_team_id.clone() {
                self.enqueue(
                    OverlayRequest::TokenHandoff {
                        from_team_id: None,
                        to_team_id: to,
                    },
                    enabled,
                );
            }
            return;
        }

        if next.ring.round_index > prev.ring.round_index {
            self.enqueue(
                OverlayRequest::RoundAdvance {
                    round_index: next.ring.round_index,
                },
                enabled,
            );
        }

        if let Some(to) = next.ring.current_team_id.clone()
            && prev.ring.current_team_id.as_ref() != Some(&to)
        {
            self.enqueue(
                OverlayRequest::TokenHandoff {
                    from_team_id: prev.ring.current_team_id.clone(),
                    to_team_id: to,
                },
                enabled,
            );
        }

        if let Some(session) = next.session.as_ref()
            && prev.session.as_ref().map(|s| &s.question_id) != Some(&session.question_id)
            && session.answer_mode == AnswerMode::Multiple
        {
            self.enqueue(
                OverlayRequest::MultipleAnswers {
                    option_ids: session.options.iter().map(|o| o.id.clone()).collect(),
                },
                enabled,
            );
        }

        if let Some(outcome) = next.session.as_ref().and_then(|s| s.outcome.as_ref())
            && prev
                .session
                .as_ref()
                .and_then(|s| s.outcome.as_ref())
                .is_none()
        {
            self.enqueue(
                OverlayRequest::Outcome {
                    verdict: outcome.verdict,
                },
                enabled,
            );
        }
    }

    // ---------------------------------------------------------------- reveals

    /// `reveal_stem`. Delegated so the append lands on the Play's log.
    pub fn reveal_stem(&self, service: &mut MatchService, now_ms: u64) -> MatchResult<()> {
        service.reveal_stem(now_ms)
    }

    /// `reveal_next_option` — the next option in authored order (§2.6).
    pub fn reveal_next_option(&self, service: &mut MatchService, now_ms: u64) -> MatchResult<()> {
        service.reveal_next_option(now_ms)
    }

    /// FinalLeaderboard, lowest place first (§5.5). Tied teams share a rank and
    /// so reveal together.
    pub fn reveal_leaderboard_rank(
        &self,
        service: &mut MatchService,
        rank: u32,
        now_ms: u64,
    ) -> MatchResult<()> {
        service.reveal_leaderboard_rank(rank, now_ms)
    }

    // -------------------------------------------------------------- the handshake

    /// Stage finished a timeline. The one door for `anim-complete` (§11.G).
    ///
    /// Returns the reveal command it chained, if any — the app crate needs to
    /// know whether the Play moved, because a Play that moved gets persisted and
    /// re-emitted.
    pub fn anim_complete(
        &mut self,
        key: &str,
        service: &mut MatchService,
        modes: RevealSettings,
        now_ms: u64,
    ) -> MatchResult<bool> {
        if self.ack_overlay(key) {
            return Ok(false);
        }
        self.chain_auto_reveal(key, service, modes, now_ms)
    }

    /// §4.2 auto mode: the next beat follows the animation that just finished,
    /// never a timer. That handshake is what stops a reveal outrunning its
    /// animation (§11.G, the P3 risk).
    fn chain_auto_reveal(
        &mut self,
        key: &str,
        service: &mut MatchService,
        modes: RevealSettings,
        now_ms: u64,
    ) -> MatchResult<bool> {
        let auto = |channel| modes.get(channel) == RevealMode::Auto;

        // The screen arrived: open the first beat of whatever it reveals.
        if let Some(to) = key
            .strip_prefix("transition:")
            .and_then(|p| p.split_once('>'))
            .map(|(_, to)| to)
        {
            if to == StageScreen::Question.key() && auto(RevealChannel::Question) {
                return chained(service.reveal_stem(now_ms));
            }
            if to == StageScreen::FinalLeaderboard.key() && auto(RevealChannel::Leaderboard) {
                return self.chain_next_rank(service, None, now_ms);
            }
            return Ok(false);
        }

        let Some(reveal) = key.strip_prefix("reveal:") else {
            return Ok(false);
        };

        // The stem opens the options; each option opens the next.
        if (reveal == "stem" || reveal.starts_with("option:")) && auto(RevealChannel::Answers) {
            let more = service
                .get_state()
                .and_then(|p| p.session())
                .is_some_and(|s| s.next_unrevealed_option().is_some());
            return if more {
                chained(service.reveal_next_option(now_ms))
            } else {
                Ok(false)
            };
        }

        if let Some(from) = reveal
            .strip_prefix("leader:")
            .and_then(|rank| rank.parse::<u32>().ok())
            .filter(|_| auto(RevealChannel::Leaderboard))
        {
            return self.chain_next_rank(service, Some(from), now_ms);
        }

        Ok(false)
    }

    /// The next rank up the board: `None` starts at last place, `Some(n)` moves
    /// to the highest distinct rank above `n`. Distinct, because a tie is one
    /// rank shared by two teams and reveals once (§5.5).
    fn chain_next_rank(
        &mut self,
        service: &mut MatchService,
        after: Option<u32>,
        now_ms: u64,
    ) -> MatchResult<bool> {
        let Some(play) = service.get_state() else {
            return Ok(false);
        };
        let next = play
            .ranks()
            .into_iter()
            .filter(|rank| after.is_none_or(|from| *rank < from))
            .max();
        match next {
            Some(rank) => chained(service.reveal_leaderboard_rank(rank, now_ms)),
            None => Ok(false),
        }
    }

    // ---------------------------------------------------------------- emission

    /// The whole `play-state` for Stage: the game half from
    /// [`crate::stage::project`], the presentation half from here, and
    /// `revealModes` straight from `FlagService`.
    ///
    /// This is the only place the two halves meet, which is why a contract
    /// change fails one test rather than four call sites.
    pub fn play_state(
        &self,
        game: StageGameState,
        modes: RevealSettings,
        overlay_enabled: bool,
        audio: AudioSettings,
        language: Language,
    ) -> PlayStateForStage {
        PlayStateForStage {
            game,
            decor: self.decor,
            layout: self.layout.clone(),
            current_screen: self.screen,
            overlay: StageOverlay {
                busy: self.active.is_some(),
                active: self.active.clone(),
                pending: self.pending.clone(),
                enabled: overlay_enabled,
                run_id: self.run_id,
            },
            reveal_modes: modes,
            audio,
            language,
        }
    }
}

/// A chained beat that the Play was not ready for is not an error: auto mode
/// races the operator, who may have revealed it already or moved on.
fn chained(result: MatchResult<()>) -> MatchResult<bool> {
    match result {
        Ok(()) => Ok(true),
        Err(
            MatchError::SessionNotIssued
            | MatchError::AlreadyResolved
            | MatchError::WrongStatus { .. }
            | MatchError::NoPlay,
        ) => Ok(false),
        Err(other) => Err(other),
    }
}
