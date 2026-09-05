//! P4 exit criteria, plus the §5.3 reject table and the §2.4 T=0 table.
//!
//! Every test drives the public `MatchService` interface. None of them reaches
//! into a struct field, which is the point of the Play write seam: if a rule
//! cannot be exercised through the commands, no caller can rely on it either.

mod support;

use proptest::prelude::*;
use questiongame_host::settings::{
    ConsecutiveBonus, FrozenSettings, JudgingSettings, LockSpeedBase, ScoringMode, ScoringSettings,
    TimerCascade, TimerLevel, TurnSettings,
};
use questiongame_host::{MatchError, MatchService, Play, PlayStatus, RestartMode, Verdict};
use support::*;

fn state_json(service: &MatchService) -> String {
    serde_json::to_string(&service.get_state()).expect("play serializes")
}

// ---------------------------------------------------------------- exit criteria

/// Points are written only by `reveal_outcome`: lock, override, pause and undo
/// all leave the score alone.
#[test]
fn points_are_written_only_by_reveal_outcome() {
    let mut service = started(snapshot(2, 1, 3, FrozenSettings::default()));
    let team = team_id(0);

    service.choose_domain(&domain_id(0), 100).unwrap();
    service.set_selection(&[option_id('a')], 200).unwrap();
    assert_eq!(score(&service, 0), 0, "selecting does not score");

    service.lock_selection(300).unwrap();
    assert_eq!(score(&service, 0), 0, "locking does not score");

    // The override is refused while the lock is unrevealed (§2.6 path 2), and a
    // refused command appends nothing.
    assert_eq!(
        service.give_token(&team_id(1), 400).unwrap_err(),
        MatchError::OverrideRefusedUntilReveal,
    );
    assert_eq!(score(&service, 0), 0, "an override does not score");

    service.pause(500).unwrap();
    service.resume(600).unwrap();
    assert_eq!(score(&service, 0), 0, "pausing does not score");

    service.reveal_outcome(700).unwrap();
    let awarded = score(&service, 0);
    assert_eq!(awarded, 100, "difficulty 10 at the default map");

    service.undo_turn(800).unwrap();
    assert_eq!(score(&service, 0), 0, "undo takes the points back");
    assert_eq!(
        service.get_state().unwrap().ring().current(),
        Some(&team),
        "and leaves the token where it was",
    );
}

/// Undo appends; it never edits. The log before an undo is a prefix of the log
/// after it.
#[test]
fn undo_only_grows_the_log() {
    let mut service = started(snapshot(2, 1, 3, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_correctly(&mut service, 200);

    let before: Vec<_> = service.get_state().unwrap().events().to_vec();
    service.undo_turn(300).unwrap();
    let after: Vec<_> = service.get_state().unwrap().events().to_vec();

    assert_eq!(after.len(), before.len() + 1);
    assert_eq!(&after[..before.len()], &before[..], "history is untouched");

    // ...and the question it consumed is back in the pool for this Play.
    let play = service.get_state().unwrap();
    assert_eq!(play.consumed_count(), 0);
    assert!(play.session().is_none());
    assert_eq!(play.remaining_in(&domain_id(0)), 3);
}

/// Undo reaches past the end of the Play: the completion, the consumption and
/// the ring tally all come back with it.
#[test]
fn undo_reopens_a_play_that_had_just_completed() {
    let mut service = started(snapshot(2, 1, 1, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_wrongly(&mut service, 110);
    assert_eq!(service.get_state().unwrap().status(), PlayStatus::Completed);

    service.undo_turn(200).unwrap();

    let play = service.get_state().unwrap();
    assert_eq!(play.status(), PlayStatus::Playing);
    assert_eq!(play.consumed_count(), 0);
    assert_eq!(
        play.questions_issued(),
        0,
        "the issue is undone with the turn"
    );
    assert_eq!(
        play.ring().current(),
        Some(&team_id(0)),
        "the token is back with the team that lost it",
    );
    assert_eq!(
        play.ring().turns(&team_id(0)),
        1,
        "and the tally is unchanged"
    );
}

/// Redo puts the inverted span back, and only while the undo is still the last
/// thing that happened (§5.8).
#[test]
fn redo_reapplies_the_turn_and_expires_once_the_operator_moves_on() {
    let mut service = started(snapshot(2, 1, 3, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_correctly(&mut service, 200);
    service.undo_turn(300).unwrap();

    service.redo_turn(400).unwrap();
    assert_eq!(score(&service, 0), 100);
    assert_eq!(service.get_state().unwrap().consumed_count(), 1);

    service.undo_turn(500).unwrap();
    service.choose_domain(&domain_id(0), 600).unwrap();
    assert_eq!(
        service.redo_turn(700).unwrap_err(),
        MatchError::NothingToRedo,
        "the operator did something else; the way forward is a fresh resolve",
    );
}

/// Replaying a full event log rebuilds a byte-identical `Play` — including
/// after an undo, a pause and a timer expiry.
#[test]
fn replaying_the_log_rebuilds_a_byte_identical_play() {
    let mut service = started(snapshot(3, 2, 3, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    service.reveal_stem(150).unwrap();
    service.reveal_next_option(160).unwrap();
    service.start_timer(200).unwrap();
    service.set_selection(&[option_id('a')], 5_000).unwrap();
    service.tick(40_000).unwrap();
    service.reveal_outcome(41_000).unwrap();
    service.give_token(&team_id(1), 42_000).unwrap();
    service.choose_domain(&domain_id(1), 43_000).unwrap();
    answer_wrongly(&mut service, 44_000);
    service.undo_turn(45_000).unwrap();
    service.pause(46_000).unwrap();

    let play = service.get_state().unwrap();
    let rebuilt = Play::replay(play.events()).expect("the log replays");

    assert_eq!(
        serde_json::to_string(&rebuilt).unwrap(),
        serde_json::to_string(play).unwrap(),
    );
}

/// `n = 1` rehearsal Play runs to completion (§4.3, §5.4).
#[test]
fn a_solo_rehearsal_play_runs_to_completion() {
    let mut service = started(snapshot(1, 1, 3, FrozenSettings::default()));
    assert!(service.get_state().unwrap().is_rehearsal());

    let solo = team_id(0);
    let mut at = 100;
    for _ in 0..3 {
        if service.get_state().unwrap().ring().current().is_none() {
            service.give_token(&solo, at).unwrap();
        }
        service.choose_domain(&domain_id(0), at).unwrap();
        answer_wrongly(&mut service, at + 10);
        at += 100;
    }

    let play = service.get_state().unwrap();
    assert_eq!(play.status(), PlayStatus::Completed);
    assert_eq!(play.consumed_count(), 3);
    assert_eq!(
        play.ring().turns(&solo),
        3,
        "one token per round, three rounds"
    );
}

/// The host is a plain library through P4–P5: zero `tauri::` imports.
#[test]
fn the_host_has_no_tauri_imports() {
    let src = std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("src");
    let mut offenders = Vec::new();
    let mut stack = vec![src];
    while let Some(dir) = stack.pop() {
        for entry in std::fs::read_dir(&dir).expect("src is readable") {
            let path = entry.expect("entry").path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().is_some_and(|e| e == "rs") {
                let body = std::fs::read_to_string(&path).expect("file is readable");
                // Prose may name it; code may not.
                let code = body
                    .lines()
                    .filter(|line| !line.trim_start().starts_with("//"));
                if code.clone().any(|line| line.contains("tauri")) {
                    offenders.push(path.display().to_string());
                }
            }
        }
    }
    assert!(
        offenders.is_empty(),
        "tauri reached the core: {offenders:?}"
    );
}

// ------------------------------------------------------------- the reject table

/// §5.3, one assertion per row.
#[test]
fn the_reject_table_holds() {
    let mut service = started(snapshot(2, 2, 1, FrozenSettings::default()));

    // set_selection / lock_selection / reveal_outcome before anything is issued
    assert_eq!(
        service.set_selection(&[option_id('a')], 10).unwrap_err(),
        MatchError::SessionNotIssued,
    );
    assert_eq!(
        service.lock_selection(10).unwrap_err(),
        MatchError::SessionNotIssued,
    );
    assert_eq!(
        service.reveal_outcome(10).unwrap_err(),
        MatchError::SessionNotIssued,
    );

    service.choose_domain(&domain_id(0), 100).unwrap();

    // choose_domain while a question is issued
    assert_eq!(
        service.choose_domain(&domain_id(1), 110).unwrap_err(),
        MatchError::SessionAlreadyIssued,
    );
    // lock_selection with nothing selected — an empty answer is a *reveal*
    assert_eq!(
        service.lock_selection(120).unwrap_err(),
        MatchError::EmptySelection,
    );
    // an option that is not on this question
    assert_eq!(
        service.set_selection(&[option_id('z')], 130).unwrap_err(),
        MatchError::UnknownOption(option_id('z')),
    );

    service.set_selection(&[option_id('a')], 140).unwrap();
    service.lock_selection(150).unwrap();

    // already locked
    assert_eq!(
        service.set_selection(&[option_id('b')], 160).unwrap_err(),
        MatchError::AlreadyLocked,
    );
    assert_eq!(
        service.lock_selection(160).unwrap_err(),
        MatchError::AlreadyLocked,
    );
    assert_eq!(
        service.start_timer(160).unwrap_err(),
        MatchError::AlreadyLocked,
    );

    service.reveal_outcome(170).unwrap();

    // already resolved
    assert_eq!(
        service.reveal_outcome(180).unwrap_err(),
        MatchError::AlreadyResolved,
    );
    // that domain is empty for this Play now (one question each)
    assert_eq!(
        service.choose_domain(&domain_id(0), 190).unwrap_err(),
        MatchError::DomainEmpty(domain_id(0)),
    );
    // and a domain that does not exist is not a silent no-op
    assert!(matches!(
        service
            .choose_domain(&questiongame_host::DomainId::from("dom-nope"), 200)
            .unwrap_err(),
        MatchError::UnknownDomain(_),
    ));
}

#[test]
fn choose_domain_needs_a_token() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_wrongly(&mut service, 200);

    assert!(service.get_state().unwrap().ring().current().is_none());
    assert_eq!(
        service.choose_domain(&domain_id(0), 300).unwrap_err(),
        MatchError::NoToken,
    );
}

#[test]
fn play_start_refuses_an_empty_board() {
    let mut service = MatchService::new();
    service
        .play_load(snapshot(2, 0, 0, FrozenSettings::default()), 0)
        .unwrap();
    assert_eq!(service.play_start(0).unwrap_err(), MatchError::BoardEmpty);
}

#[test]
fn a_second_play_cannot_open_while_one_is_playing() {
    let mut service = started(snapshot(2, 1, 1, FrozenSettings::default()));
    assert!(matches!(
        service
            .play_load(snapshot(2, 1, 1, FrozenSettings::default()), 10)
            .unwrap_err(),
        MatchError::WrongStatus { .. },
    ));
}

// ------------------------------------------------------------------- the timer

#[test]
fn operator_pace_has_no_clock_at_all() {
    let mut service = started(snapshot(2, 1, 2, operator_pace()));
    service.choose_domain(&domain_id(0), 100).unwrap();

    assert!(
        service
            .get_state()
            .unwrap()
            .session()
            .unwrap()
            .timer
            .is_none()
    );
    assert_eq!(
        service.start_timer(200).unwrap_err(),
        MatchError::TimerDisabled
    );

    // A tick at any time changes nothing: there is nothing to expire.
    let before = state_json(&service);
    service.tick(9_999_999).unwrap();
    assert_eq!(state_json(&service), before);
}

/// §2.4 T=0, row 1: something selected auto-locks. Never auto-reveals.
#[test]
fn zero_auto_locks_a_selection_at_the_computed_instant() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 0).unwrap();
    service.start_timer(1_000).unwrap();
    service.set_selection(&[option_id('a')], 5_000).unwrap();

    // Noticed late — at 40s — but the countdown ran out at 31s.
    service.tick(40_000).unwrap();

    let session = service.get_state().unwrap().session().unwrap();
    assert!(session.is_locked(), "T=0 with a selection auto-locks");
    assert!(!session.is_resolved(), "and never auto-reveals");
    assert_eq!(session.remaining_ms_at_lock(), Some(0));
    let locked_at = service
        .get_state()
        .unwrap()
        .events()
        .iter()
        .find(|e| {
            matches!(
                e.kind,
                questiongame_host::EventKind::SelectionLocked { auto: true, .. }
            )
        })
        .expect("an auto-lock was appended")
        .at_ms;
    assert_eq!(locked_at, 31_000, "the lock lands on the zero instant");
}

/// §2.4 T=0, row 2: nothing selected leaves the question open and selectable.
#[test]
fn zero_with_nothing_selected_leaves_the_question_open() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 0).unwrap();
    service.start_timer(0).unwrap();
    service.tick(30_000).unwrap();

    let session = service.get_state().unwrap().session().unwrap();
    assert!(session.expired_open());
    assert!(!session.is_locked());
    assert!(!session.is_resolved());

    // Still selectable, and still lockable.
    service.set_selection(&[option_id('a')], 31_000).unwrap();
    service.lock_selection(32_000).unwrap();
    assert_eq!(
        service
            .get_state()
            .unwrap()
            .session()
            .unwrap()
            .remaining_ms_at_lock(),
        Some(0),
    );
}

#[test]
fn a_paused_play_stops_the_countdown() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 0).unwrap();
    service.start_timer(0).unwrap();
    service.pause(10_000).unwrap();

    // 60s of wall clock while paused costs the team nothing.
    service.tick(70_000).unwrap();
    let play = service.get_state().unwrap();
    let timer = play.session().unwrap().timer.as_ref().unwrap();
    assert!(!timer.running());
    assert_eq!(timer.remaining_at(70_000), 20_000);
    assert_eq!(
        play.clock().elapsed_at(70_000),
        10_000,
        "so does the Play clock"
    );
}

// ------------------------------------------------------------------- the award

#[test]
fn lock_speed_scores_from_the_frozen_remaining_ms() {
    let settings = FrozenSettings {
        scoring: ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 100,
            speed_weight: 1.0,
            lock_speed_enabled: true,
            lock_speed_base: LockSpeedBase::Flat,
            ..ScoringSettings::default()
        },
        timer: TimerCascade {
            globals: TimerLevel::new(true, 30_000),
            recipe: TimerLevel::default(),
        },
        ..FrozenSettings::default()
    };
    let mut service = started(snapshot(2, 1, 2, settings));
    service.choose_domain(&domain_id(0), 0).unwrap();
    service.start_timer(0).unwrap();
    service.set_selection(&[option_id('a')], 1_000).unwrap();
    service.lock_selection(15_000).unwrap();

    // Reveal much later: the score is the *locked* remaining time, not now.
    service.reveal_outcome(29_000).unwrap();
    assert_eq!(score(&service, 0), 150);
}

#[test]
fn the_cap_ends_the_token_and_the_bonus_pays_once() {
    let settings = FrozenSettings {
        turn: TurnSettings {
            max_consecutive_correct: Some(2),
            bonus_after_consecutive: Some(ConsecutiveBonus {
                count: 2,
                award: 50,
            }),
        },
        ..FrozenSettings::default()
    };
    let mut service = started(snapshot(2, 1, 4, settings));

    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_correctly(&mut service, 110);
    assert_eq!(score(&service, 0), 100, "difficulty 10");
    assert_eq!(
        service.get_state().unwrap().ring().current(),
        Some(&team_id(0)),
        "a correct answer keeps the token",
    );

    service.choose_domain(&domain_id(0), 200).unwrap();
    answer_correctly(&mut service, 210);
    assert_eq!(score(&service, 0), 100 + 200 + 50, "the bonus lands once");
    assert!(
        service.get_state().unwrap().ring().current().is_none(),
        "the cap ends the token, and the last answer still scored",
    );
}

#[test]
fn revealing_with_nothing_locked_is_wrong_and_consumes_the_question() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    service.reveal_outcome(200).unwrap();

    let play = service.get_state().unwrap();
    let outcome = play.session().unwrap().outcome.as_ref().unwrap();
    assert_eq!(outcome.verdict, Verdict::Incorrect);
    assert_eq!(outcome.points_awarded, 0);
    assert!(outcome.token_ends);
    assert_eq!(
        play.consumed_count(),
        1,
        "a resolved question never returns"
    );
    assert_eq!(play.remaining_in(&domain_id(0)), 1);
}

#[test]
fn judging_settings_frozen_at_start_are_unreachable_afterwards() {
    // The interface itself is the proof: `set_live_settings` writes only
    // control-behaviour keys, and there is no command that writes a frozen one.
    let settings = FrozenSettings {
        judging: JudgingSettings {
            partial_credit: true,
            order_matters: false,
        },
        ..FrozenSettings::default()
    };
    let service = started(snapshot(2, 1, 1, settings.clone()));
    assert_eq!(service.get_state().unwrap().snapshot().settings, settings);
}

// ------------------------------------------------------------------ the override

#[test]
fn reveal_and_pass_is_atomic() {
    let mut service = started(snapshot(3, 1, 3, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    service.set_selection(&[option_id('a')], 200).unwrap();
    service.lock_selection(300).unwrap();

    // An illegal target is refused before anything is revealed.
    let before = state_json(&service);
    assert!(matches!(
        service.reveal_and_pass(&team_id(0), 400).unwrap_err(),
        MatchError::IllegalTokenTarget { .. },
    ));
    assert_eq!(state_json(&service), before, "nothing was revealed");

    service.reveal_and_pass(&team_id(1), 500).unwrap();
    assert_eq!(score(&service, 0), 100, "the reveal scored for team 0");
    assert_eq!(
        service.get_state().unwrap().ring().current(),
        Some(&team_id(1)),
    );
}

#[test]
fn the_ring_refuses_an_override_that_would_skip_a_team() {
    let mut service = started(snapshot(4, 1, 8, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_wrongly(&mut service, 110);

    // turns [1,0,0,0]: team 0 cannot have a second token yet.
    assert!(matches!(
        service.give_token(&team_id(0), 200).unwrap_err(),
        MatchError::IllegalTokenTarget { .. },
    ));
    service.give_token(&team_id(2), 210).unwrap();
    assert_eq!(
        service.get_state().unwrap().ring().legal_targets(),
        vec![team_id(1), team_id(3)],
    );
}

// ------------------------------------------------------------------- lifecycle

#[test]
fn restart_closes_the_old_play_and_opens_a_new_one() {
    let mut service = started(snapshot(2, 1, 3, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_correctly(&mut service, 110);

    let closed = service
        .restart(
            RestartMode::SameQuestions {
                new_play_id: questiongame_host::PlayId::from("play-restarted"),
            },
            200,
        )
        .unwrap();

    assert_eq!(closed.status(), PlayStatus::Restarted);
    assert_eq!(
        closed.score(&team_id(0)),
        100,
        "the old record keeps its score"
    );

    let fresh = service.get_state().unwrap();
    assert_eq!(fresh.id().as_str(), "play-restarted");
    assert_eq!(fresh.status(), PlayStatus::Playing);
    assert_eq!(fresh.score(&team_id(0)), 0);
    assert_eq!(
        fresh.consumed_count(),
        0,
        "the same questions, from the top"
    );
}

#[test]
fn the_play_completes_when_every_question_is_consumed() {
    let mut service = started(snapshot(2, 1, 2, FrozenSettings::default()));
    service.choose_domain(&domain_id(0), 100).unwrap();
    answer_correctly(&mut service, 110);
    service.choose_domain(&domain_id(0), 200).unwrap();
    answer_correctly(&mut service, 210);

    let play = service.get_state().unwrap();
    assert_eq!(play.status(), PlayStatus::Completed);
    assert!(
        !play.clock().running(),
        "the Play clock stops with the Play"
    );
}

fn score(service: &MatchService, team: usize) -> u32 {
    service.get_state().unwrap().score(&team_id(team))
}

#[test]
fn play_load_refuses_a_snapshot_whose_settings_are_illegal() {
    // A row written by an older build is not automatically legal today. The
    // §4.2 table is checked at the door, so a Play never runs on a document
    // that would score wrong for its whole life.
    let illegal = FrozenSettings {
        scoring: ScoringSettings {
            mode: ScoringMode::LockSpeed,
            lock_speed_enabled: true,
            ..ScoringSettings::default()
        },
        ..FrozenSettings::default()
    };
    let mut service = MatchService::new();
    assert!(matches!(
        service.play_load(snapshot(2, 1, 2, illegal), 0),
        Err(MatchError::IllegalSettings {
            key: "scoring.lock_speed.enabled",
            ..
        })
    ));
    assert!(service.get_state().is_none(), "nothing was loaded");

    let unreachable_bonus = FrozenSettings {
        turn: TurnSettings {
            max_consecutive_correct: Some(2),
            bonus_after_consecutive: Some(ConsecutiveBonus {
                count: 5,
                award: 100,
            }),
        },
        ..FrozenSettings::default()
    };
    assert!(
        service
            .play_load(snapshot(2, 1, 2, unreachable_bonus), 0)
            .is_err()
    );
}

// -------------------------------------------------------------------- property

/// The exit criterion at the service level: random command sequences over 1–12
/// teams keep the round invariant, never override a team into consecutive
/// turns, and never let a rejected command change anything.
#[derive(Debug, Clone)]
enum Op {
    Choose(usize),
    Select(usize),
    Lock,
    Reveal,
    Give(usize),
    Pause,
    Resume,
    Tick,
    Undo,
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(120))]

    #[test]
    fn random_command_sequences_keep_every_invariant(
        teams in 1usize..=12,
        script in proptest::collection::vec(
            prop_oneof![
                3 => (0usize..3).prop_map(Op::Choose),
                3 => (0usize..4).prop_map(Op::Select),
                2 => Just(Op::Lock),
                3 => Just(Op::Reveal),
                3 => (0usize..12).prop_map(Op::Give),
                1 => Just(Op::Pause),
                1 => Just(Op::Resume),
                2 => Just(Op::Tick),
                1 => Just(Op::Undo),
            ],
            0..80,
        ),
    ) {
        let mut service = started(snapshot(teams, 3, 3, FrozenSettings::default()));
        let mut at = 1_000u64;
        let letters = ['a', 'b', 'c', 'd'];

        for op in script {
            at += 700;
            let before = state_json(&service);
            let previous_holder = service
                .get_state()
                .unwrap()
                .ring()
                .current()
                .cloned();

            let result = match op.clone() {
                Op::Choose(d) => service.choose_domain(&domain_id(d), at),
                Op::Select(o) => service.set_selection(&[option_id(letters[o])], at),
                Op::Lock => service.lock_selection(at),
                Op::Reveal => service.reveal_outcome(at),
                Op::Give(t) => service.give_token(&team_id(t % teams), at),
                Op::Pause => service.pause(at),
                Op::Resume => service.resume(at),
                Op::Tick => service.tick(at),
                Op::Undo => service.undo_turn(at),
            };

            if result.is_err() {
                prop_assert_eq!(
                    state_json(&service),
                    before,
                    "a rejected {:?} changed the Play",
                    op,
                );
                continue;
            }

            let play = service.get_state().unwrap();
            prop_assert!(
                play.ring().invariant_holds(),
                "round invariant broken after {:?}",
                op,
            );
            if let Op::Give(_) = op {
                prop_assert_ne!(
                    play.ring().current(),
                    previous_holder.as_ref(),
                    "a team was overridden into consecutive turns",
                );
            }
            // The log only ever grows, and a Play's own id never changes.
            prop_assert_eq!(play.id().as_str(), "play-test");
        }

        // Whatever happened, the log still rebuilds the same state.
        let play = service.get_state().unwrap();
        let rebuilt = Play::replay(play.events()).expect("the log replays");
        prop_assert_eq!(
            serde_json::to_string(&rebuilt).unwrap(),
            serde_json::to_string(play).unwrap(),
        );
    }
}
