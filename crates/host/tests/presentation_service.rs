//! `PresentationService` — the screen, the overlay queue, and the
//! `anim-complete` handshake.
//!
//! Two properties carry most of the weight here, because both are things §2.6
//! and §5.6 say and nothing else enforces:
//!
//! - **The queue advances on an ack, never on a clock.** One overlay runs, at
//!   most one waits, a newer pending replaces an older one, and nothing retires
//!   until Stage says its timeline ended.
//! - **Reveals are Play state.** They go through `MatchService`, so undo takes
//!   them back with the turn — asserted here rather than assumed from the call
//!   signature.

mod support;

use questiongame_host::flags::AudioSettings;
use questiongame_host::presentation::PresentationService;
use questiongame_host::settings::{FrozenSettings, Language, RevealMode, RevealSettings};
use questiongame_host::stage::{OverlayRequest, StageGameState, StageScreen, project};
use questiongame_host::{MatchService, PlayStatus, Verdict};
use support::*;

const ON: bool = true;
const OFF: bool = false;

fn snap(service: &MatchService, now_ms: u64) -> StageGameState {
    project(service.get_state().expect("a play is loaded"), now_ms)
}

/// Run one command and let `observe` see the cause, the way the app crate does.
fn observed(
    presentation: &mut PresentationService,
    service: &mut MatchService,
    now_ms: u64,
    command: impl FnOnce(&mut MatchService),
) {
    let before = snap(service, now_ms);
    command(service);
    let after = snap(service, now_ms);
    presentation.observe(&before, &after, ON);
}

fn auto(channel_all: bool) -> RevealSettings {
    if channel_all {
        RevealSettings {
            question: RevealMode::Auto,
            answers: RevealMode::Auto,
            outcome: RevealMode::Auto,
            leaderboard: RevealMode::Auto,
        }
    } else {
        RevealSettings::default()
    }
}

// ------------------------------------------------------------------- screens

#[test]
fn only_idle_is_legal_before_a_play_has_started() {
    let mut presentation = PresentationService::new();

    for screen in StageScreen::ALL {
        let result = presentation.show_screen(screen, Some(PlayStatus::Loaded));
        assert_eq!(
            result.is_ok(),
            screen == StageScreen::Idle,
            "{screen:?} before play_start",
        );
    }
    assert_eq!(presentation.screen(), StageScreen::Idle);

    // With no Play at all — the boot state — the same rule holds.
    assert!(
        presentation
            .show_screen(StageScreen::Question, None)
            .is_err()
    );
}

#[test]
fn the_operator_may_jump_to_any_screen_once_the_play_is_running() {
    let mut presentation = PresentationService::new();
    for screen in StageScreen::ALL {
        presentation
            .show_screen(screen, Some(PlayStatus::Playing))
            .expect("every screen is reachable from every other one (§5.6)");
        assert_eq!(presentation.screen(), screen);
    }
}

#[test]
fn a_completed_play_still_shows_its_leaderboard() {
    let mut presentation = PresentationService::new();
    presentation
        .show_screen(StageScreen::FinalLeaderboard, Some(PlayStatus::Completed))
        .expect("the final screen outlives the last question");
}

// ------------------------------------------------------------- overlay queue

#[test]
fn one_overlay_runs_at_a_time_and_a_newer_pending_replaces_an_older_one() {
    let mut presentation = PresentationService::new();
    let first = OverlayRequest::RoundAdvance { round_index: 2 };
    let second = OverlayRequest::Outcome {
        verdict: Verdict::Correct,
    };
    let third = OverlayRequest::CurrentTeam { team_id: None };

    presentation.show_overlay(first.clone(), ON);
    presentation.show_overlay(second, ON);
    presentation.show_overlay(third.clone(), ON);

    assert_eq!(presentation.active_overlay(), Some(&first));
    assert!(presentation.overlay_busy());

    // The middle one never plays: queue depth is one, newest wins (§2.6).
    let state = presentation.play_state(dummy_game(), auto(false), ON, AudioSettings::default(), Language::En);
    assert_eq!(state.overlay.pending.as_ref(), Some(&third));
}

#[test]
fn the_queue_advances_only_on_an_ack_for_the_running_overlay() {
    let mut service = started(snapshot(2, 2, 1, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    let modes = auto(false);

    let running = OverlayRequest::RoundAdvance { round_index: 2 };
    let waiting = OverlayRequest::CurrentTeam { team_id: None };
    presentation.show_overlay(running.clone(), ON);
    presentation.show_overlay(waiting.clone(), ON);

    // Keys that belong to something else move nothing — Stage reports every
    // timeline it plays, not only overlays.
    for stale in [
        "overlay:outcome",
        "transition:idle>question",
        "reveal:stem",
        "nonsense",
    ] {
        presentation
            .anim_complete(stale, &mut service, modes, 100)
            .unwrap();
        assert_eq!(presentation.active_overlay(), Some(&running), "{stale}");
    }

    presentation
        .anim_complete(&running.anim_key(), &mut service, modes, 200)
        .unwrap();
    assert_eq!(presentation.active_overlay(), Some(&waiting));

    presentation
        .anim_complete(&waiting.anim_key(), &mut service, modes, 300)
        .unwrap();
    assert_eq!(presentation.active_overlay(), None);
    assert!(!presentation.overlay_busy());
}

/// The operator clicks one overlay button twice. Both requests are equal *by
/// value* — `round-advance` carries only the round — so the promotion puts
/// back an `active` indistinguishable from the one that just finished. The
/// occurrence counter is what makes it distinguishable: without it Stage plays
/// nothing, acks nothing, and the queue never advances again for the rest of
/// the Play (reported from a real show, 2026-09-07).
#[test]
fn the_same_overlay_twice_is_two_runs() {
    let mut service = started(snapshot(2, 2, 1, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    let modes = auto(false);
    let request = OverlayRequest::RoundAdvance { round_index: 2 };
    let state = |p: &PresentationService| p.play_state(dummy_game(), modes, ON, AudioSettings::default(), Language::En);

    assert_eq!(state(&presentation).overlay.run_id, 0, "nothing has run");

    presentation.show_overlay(request.clone(), ON);
    let first = state(&presentation).overlay.run_id;
    assert!(first > 0);

    presentation.show_overlay(request.clone(), ON);
    assert_eq!(state(&presentation).overlay.run_id, first, "still the first run");

    presentation
        .anim_complete(&request.anim_key(), &mut service, modes, 200)
        .unwrap();
    let promoted = state(&presentation).overlay;
    assert_eq!(promoted.active.as_ref(), Some(&request));
    assert!(promoted.run_id > first, "the promoted duplicate is a new run");

    // And it retires on its own ack, like any other run.
    presentation
        .anim_complete(&request.anim_key(), &mut service, modes, 300)
        .unwrap();
    assert_eq!(presentation.active_overlay(), None);
}

#[test]
fn overlays_off_skips_the_queue_and_the_token_still_moves() {
    let mut service = started(snapshot(3, 2, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();

    let before = snap(&service, 0);
    service.choose_domain(&domain_id(0), 10).unwrap();
    answer_wrongly(&mut service, 20);
    let after = snap(&service, 30);
    presentation.observe(&before, &after, OFF);

    assert!(
        !presentation.overlay_busy(),
        "§5.6: the queue is skipped whole"
    );
    assert_ne!(
        after.ring.current_team_id, before.ring.current_team_id,
        "the token is Play state and moves regardless",
    );

    // And the emission still reports the setting, so Stage knows why.
    let state = presentation.play_state(after, auto(false), OFF, AudioSettings::default(), Language::En);
    assert!(!state.overlay.enabled);
}

// ------------------------------------------------------------ automatic causes

#[test]
fn a_resolve_enqueues_the_outcome_and_the_next_token_enqueues_the_handoff() {
    let mut service = started(snapshot(3, 2, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    service.choose_domain(&domain_id(0), 10).unwrap();

    observed(&mut presentation, &mut service, 20, |s| {
        answer_wrongly(s, 20)
    });

    assert_eq!(
        presentation.active_overlay(),
        Some(&OverlayRequest::Outcome {
            verdict: Verdict::Incorrect
        }),
    );
    // A wrong answer ends the token and moves it nowhere: the ring is empty
    // between a resolve and the next token, so there is no handoff to draw yet
    // (§2.6 — Stage does not auto-advance).
    let state = presentation.play_state(snap(&service, 20), auto(false), ON, AudioSettings::default(), Language::En);
    assert_eq!(state.overlay.pending, None);
    assert_eq!(state.game.ring.current_team_id, None);

    observed(&mut presentation, &mut service, 30, |s| {
        s.give_token(&team_id(1), 30).unwrap()
    });
    let state = presentation.play_state(snap(&service, 30), auto(false), ON, AudioSettings::default(), Language::En);
    assert_eq!(
        state.overlay.pending,
        Some(OverlayRequest::TokenHandoff {
            from_team_id: None,
            to_team_id: team_id(1),
        }),
        "the handoff queues behind the outcome that is still running",
    );
}

#[test]
fn the_first_token_of_a_play_hands_off_from_nobody() {
    let mut service = MatchService::new();
    let mut presentation = PresentationService::new();
    service
        .play_load(snapshot(2, 1, 2, FrozenSettings::default()), 0)
        .unwrap();

    let before = project(service.get_state().unwrap(), 0);
    service.play_start(0).unwrap();
    let after = project(service.get_state().unwrap(), 0);
    presentation.observe(&before, &after, ON);

    assert_eq!(
        presentation.active_overlay(),
        Some(&OverlayRequest::TokenHandoff {
            from_team_id: None,
            to_team_id: team_id(0),
        }),
    );
}

#[test]
fn a_multiple_answer_question_announces_itself_when_it_is_issued() {
    let mut snapshot = snapshot(2, 1, 2, FrozenSettings::default());
    snapshot.domains[0].questions[0].correct_option_ids = vec![option_id('a'), option_id('b')];
    let mut service = started(snapshot);
    let mut presentation = PresentationService::new();

    observed(&mut presentation, &mut service, 10, |s| {
        s.choose_domain(&domain_id(0), 10).unwrap()
    });

    let Some(OverlayRequest::MultipleAnswers { option_ids }) = presentation.active_overlay() else {
        panic!("expected the multiple-answers overlay");
    };
    assert_eq!(
        option_ids.len(),
        4,
        "every option, not only the correct ones"
    );
}

#[test]
fn a_new_round_announces_itself() {
    let mut service = started(snapshot(2, 2, 4, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    let mut seen = Vec::new();

    // Both teams answer wrong, so both tokens end and the ring turns over.
    for (team, at) in [(0, 10), (1, 20), (0, 30)] {
        observed(&mut presentation, &mut service, at, |s| {
            if s.get_state().unwrap().ring().current().is_none() {
                s.give_token(&team_id(team), at).unwrap();
            }
        });
        drain(&mut presentation, &mut service, at, &mut seen);
        service.choose_domain(&domain_id(0), at).unwrap();
        observed(&mut presentation, &mut service, at, |s| {
            answer_wrongly(s, at)
        });
        drain(&mut presentation, &mut service, at, &mut seen);
    }

    assert_eq!(snap(&service, 40).ring.round_index, 2);
    assert!(
        seen.contains(&OverlayRequest::RoundAdvance { round_index: 2 }),
        "the round turning over is its own beat: {seen:?}",
    );
}

/// Retire whatever is queued, the way Stage would by playing it, recording what
/// went past.
fn drain(
    presentation: &mut PresentationService,
    service: &mut MatchService,
    now_ms: u64,
    seen: &mut Vec<OverlayRequest>,
) {
    while let Some(overlay) = presentation.active_overlay().cloned() {
        seen.push(overlay.clone());
        presentation
            .anim_complete(&overlay.anim_key(), service, auto(false), now_ms)
            .unwrap();
    }
}

#[test]
fn a_restart_empties_the_queue_and_opens_the_new_play_with_its_first_token() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    presentation.show_overlay(OverlayRequest::RoundAdvance { round_index: 2 }, ON);
    presentation.show_overlay(OverlayRequest::CurrentTeam { team_id: None }, ON);

    let before = snap(&service, 10);
    service
        .restart(
            questiongame_host::RestartMode::SameQuestions {
                new_play_id: "play-2".into(),
            },
            20,
        )
        .unwrap();
    presentation.observe(&before, &snap(&service, 20), ON);

    assert_eq!(
        presentation.active_overlay(),
        Some(&OverlayRequest::TokenHandoff {
            from_team_id: None,
            to_team_id: team_id(0),
        }),
        "the old Play's queue is gone; the new Play's first token is a cause",
    );
    assert_eq!(
        presentation
            .play_state(snap(&service, 20), auto(false), ON, AudioSettings::default(), Language::En)
            .overlay
            .pending,
        None,
        "and nothing of the old Play survives behind it",
    );
}

// ------------------------------------------------------- the auto-reveal chain

#[test]
fn operator_mode_chains_nothing() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    service.choose_domain(&domain_id(0), 10).unwrap();

    let moved = presentation
        .anim_complete("transition:idle>question", &mut service, auto(false), 20)
        .unwrap();

    assert!(!moved);
    assert!(
        !service.get_state().unwrap().session().unwrap().reveals.stem,
        "the show is operator-timed by default (§4.2)",
    );
}

#[test]
fn auto_mode_walks_the_stem_then_every_option_and_then_stops() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    let modes = auto(true);
    service.choose_domain(&domain_id(0), 10).unwrap();

    assert!(
        presentation
            .anim_complete("transition:idle>question", &mut service, modes, 20)
            .unwrap(),
        "arriving on Question opens the stem",
    );
    assert!(service.get_state().unwrap().session().unwrap().reveals.stem);

    // Each finished beat opens the next, and the last one opens nothing.
    let mut key = "reveal:stem".to_owned();
    let mut revealed = 0;
    while presentation
        .anim_complete(&key, &mut service, modes, 30)
        .unwrap()
    {
        revealed += 1;
        let session = service.get_state().unwrap().session().unwrap();
        key = format!(
            "reveal:option:{}",
            session.reveals.option_ids.last().unwrap()
        );
    }

    assert_eq!(revealed, 4, "four options, one beat each");
    assert!(
        !presentation
            .anim_complete(&key, &mut service, modes, 40)
            .unwrap(),
        "the chain ends rather than looping on the last option",
    );
}

#[test]
fn auto_mode_walks_the_leaderboard_upward_and_reveals_a_tie_once() {
    // Two teams, one question each: team 0 scores, team 1 does not. Ranks 1, 2.
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();
    let modes = auto(true);

    service.choose_domain(&domain_id(0), 10).unwrap();
    answer_correctly(&mut service, 20);
    service.give_token(&team_id(1), 30).unwrap();
    service.choose_domain(&domain_id(0), 40).unwrap();
    answer_wrongly(&mut service, 50);

    presentation
        .anim_complete(
            "transition:scoreboard>finalLeaderboard",
            &mut service,
            modes,
            60,
        )
        .unwrap();
    assert_eq!(
        service.get_state().unwrap().leaderboard_revealed_ranks(),
        [2],
        "last place first (§5.5)",
    );

    presentation
        .anim_complete("reveal:leader:2", &mut service, modes, 70)
        .unwrap();
    assert_eq!(
        service.get_state().unwrap().leaderboard_revealed_ranks(),
        [2, 1],
    );

    assert!(
        !presentation
            .anim_complete("reveal:leader:1", &mut service, modes, 80)
            .unwrap(),
        "first place is the end of the board",
    );
}

#[test]
fn an_auto_beat_the_operator_already_took_is_not_an_error() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let mut presentation = PresentationService::new();

    // No question issued: the chain has nothing to open, and says so quietly.
    assert!(
        !presentation
            .anim_complete("transition:idle>question", &mut service, auto(true), 10)
            .unwrap(),
        "auto races the operator; losing that race is not a failure",
    );
}

// ------------------------------------------------ reveals are Play state (§13)

#[test]
fn reveals_written_through_the_presentation_service_are_undone_with_the_turn() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    let presentation = PresentationService::new();

    service.choose_domain(&domain_id(0), 10).unwrap();
    presentation.reveal_stem(&mut service, 20).unwrap();
    presentation.reveal_next_option(&mut service, 30).unwrap();
    answer_correctly(&mut service, 40);
    assert!(service.get_state().unwrap().session().unwrap().reveals.stem);

    service.undo_turn(50).unwrap();

    assert!(
        service.get_state().unwrap().session().is_none(),
        "the reveals went back with the question, because they live on the Play",
    );
}

/// A projection to hand `play_state` when the test is only about the queue.
fn dummy_game() -> StageGameState {
    let service = started(snapshot(2, 1, 1, FrozenSettings::default()));
    project(service.get_state().unwrap(), 0)
}
