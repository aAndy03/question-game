//! `FlagService` through its public interface only (§2.16, §4.2, §11.L).
//!
//! The two rules these tests exist to hold down:
//!
//! 1. **A refused write changes nothing.** Interlocks are checked on a clone
//!    and committed whole, so a document is never half-written.
//! 2. **The freeze is a copy, not a reference.** A globals edit during an open
//!    Play cannot reach the settings that Play started with (§2.5, §4.3).

mod support;

use questiongame_host::error::MatchError;
use questiongame_host::flags::{
    Chord, ControlSettings, Disabled, DisabledReason, FLAG_KEYS, FeatureRoot, FlagService,
    FlagValue, GAME_AFFECTING_KEYS, GameSetting, GameSettings, GlobalSetting, GlobalSettings,
    MosaicDensity, RuntimeContext,
};
use questiongame_host::monitor::StageReattach;
use questiongame_host::play::PlayStatus;
use questiongame_host::settings::{
    ConsecutiveBonus, DifficultyMap, LockSpeedBase, OverrideAfterLock, RevealChannel, RevealMode,
    ScoringMode, TimerLevel,
};
use questiongame_host::{MatchService, PlaySnapshot};

use support::{operator_pace, option_id, snapshot};

/// A service with a recipe in Control and nothing playing.
fn loaded() -> FlagService {
    let mut flags = FlagService::default();
    flags.load_recipe(flags.new_recipe_settings()).unwrap();
    flags
}

fn idle() -> RuntimeContext {
    RuntimeContext::default()
}

fn playing() -> RuntimeContext {
    RuntimeContext {
        play_status: Some(PlayStatus::Playing),
        ..RuntimeContext::default()
    }
}

fn disabled_keys(flags: &FlagService, ctx: RuntimeContext) -> Vec<&'static str> {
    flags.disabled(ctx).into_iter().map(|d| d.key).collect()
}

// ------------------------------------------------------------------- the freeze

#[test]
fn freeze_resolves_the_cascade_into_the_play_and_then_lets_go_of_it() {
    let mut flags = loaded();
    flags
        .settings_set_current_game(GameSetting::TimerDurationMs(Some(20_000)), idle())
        .unwrap();
    let frozen = flags.freeze().unwrap();
    assert_eq!(frozen.timer.resolve(None), Some(20_000));

    // The Play is running. Every settings surface stays open for the globals.
    flags
        .settings_set_global(GlobalSetting::TimerDurationMs(45_000), playing())
        .unwrap();

    assert_eq!(
        frozen.timer.resolve(None),
        Some(20_000),
        "the frozen copy is numbers, not a reference to the document"
    );
}

#[test]
fn a_globals_edit_during_an_open_play_leaves_the_snapshot_byte_identical() {
    let mut flags = loaded();
    let mut service = MatchService::new();
    let snapshot = PlaySnapshot::new(
        "play-1",
        "recipe-1",
        snapshot(2, 1, 2, flags.freeze().unwrap()).teams,
        snapshot(2, 1, 2, flags.freeze().unwrap()).domains,
        flags.freeze().unwrap(),
    );
    service.play_load(snapshot, 0).unwrap();
    service.play_start(0).unwrap();
    let before = serde_json::to_string(service.get_state().unwrap().snapshot()).unwrap();

    let ctx = RuntimeContext::of(&service, false);
    flags
        .settings_set_global(GlobalSetting::TimerDurationMs(1_000), ctx)
        .unwrap();
    flags
        .settings_set_global(
            GlobalSetting::Game(GameSetting::ScoringMode(ScoringMode::Flat)),
            ctx,
        )
        .unwrap();

    let after = serde_json::to_string(service.get_state().unwrap().snapshot()).unwrap();
    assert_eq!(before, after);
}

#[test]
fn freeze_needs_a_recipe_in_control() {
    let flags = FlagService::default();
    assert_eq!(flags.freeze().unwrap_err(), MatchError::NoRecipeLoaded);
    assert_eq!(
        FlagService::default()
            .settings_set_current_game(GameSetting::PartialCredit(true), idle())
            .unwrap_err(),
        MatchError::NoRecipeLoaded
    );
}

#[test]
fn a_recipe_document_is_validated_on_the_way_in() {
    // A document written by an older build is not automatically legal today.
    let mut game = GameSettings::default();
    game.scoring.mode = ScoringMode::LockSpeed;
    game.scoring.lock_speed_enabled = true;

    let mut flags = FlagService::default();
    assert!(flags.load_recipe(game).is_err());
    assert!(flags.current_game().is_none());
}

// -------------------------------------------------------------------- the freeze
//                                                                       rule

#[test]
fn every_game_affecting_key_is_refused_while_a_play_is_open() {
    let writes: Vec<GameSetting> = vec![
        GameSetting::ScoringMode(ScoringMode::Flat),
        GameSetting::FlatPoints(50),
        GameSetting::DifficultyMap(DifficultyMap::Linear { factor: 5.0 }),
        GameSetting::SpeedWeight(1.0),
        GameSetting::LockSpeedEnabled(true),
        GameSetting::LockSpeedBase(LockSpeedBase::Flat),
        GameSetting::MaxConsecutiveCorrect(Some(3)),
        GameSetting::BonusAfterConsecutive(Some(ConsecutiveBonus {
            count: 3,
            award: 50,
        })),
        GameSetting::PartialCredit(true),
        GameSetting::OrderMatters(true),
        GameSetting::TimerEnabled(Some(false)),
        GameSetting::TimerDurationMs(Some(10_000)),
    ];
    // The list above is the §4.2 "Game, frozen" block; if a key is added there
    // and not here, this catches it.
    let covered: Vec<&str> = writes.iter().map(GameSetting::key).collect();
    for key in GAME_AFFECTING_KEYS {
        assert!(covered.contains(key), "{key} is not exercised");
    }

    for status in [PlayStatus::Playing, PlayStatus::Paused] {
        let ctx = RuntimeContext {
            play_status: Some(status),
            ..RuntimeContext::default()
        };
        for write in &writes {
            let mut flags = loaded();
            let before = flags.clone();
            assert_eq!(
                flags.settings_set_current_game(write.clone(), ctx),
                Err(MatchError::SettingFrozen(write.key())),
                "{} was writable while {status:?}",
                write.key()
            );
            assert_eq!(flags, before, "a refused write changed the document");
        }
    }
}

#[test]
fn reveal_is_a_game_default_and_still_moves_during_a_play() {
    // §4.2 lists reveal as both — it is the one Game-tab key that is not frozen.
    let mut flags = loaded();
    flags
        .settings_set_current_game(
            GameSetting::Reveal(RevealChannel::Outcome, RevealMode::Auto),
            playing(),
        )
        .unwrap();
    assert_eq!(flags.reveal_modes().outcome, RevealMode::Auto);
    assert_eq!(
        flags.current_game().unwrap().reveal.outcome,
        RevealMode::Auto,
        "the Current game tab and Stage must not disagree"
    );
}

#[test]
fn a_finished_play_does_not_keep_the_recipe_frozen() {
    // §11.H: completed/abandoned must not rewrite the finished snapshot — and
    // it cannot, because the snapshot is a copy. The recipe is editable again.
    for status in [
        PlayStatus::Completed,
        PlayStatus::Abandoned,
        PlayStatus::Restarted,
        PlayStatus::Loaded,
    ] {
        let mut flags = loaded();
        let ctx = RuntimeContext {
            play_status: Some(status),
            ..RuntimeContext::default()
        };
        flags
            .settings_set_current_game(GameSetting::FlatPoints(250), ctx)
            .unwrap();
        assert_eq!(flags.current_game().unwrap().scoring.flat_points, 250);
    }
}

// ---------------------------------------------------------------- the interlocks

#[test]
fn a_running_countdown_cannot_be_switched_off_underneath_the_team() {
    // §2.18: "Do not turn timer.enabled off while a countdown is running."
    let ctx = RuntimeContext {
        play_status: Some(PlayStatus::Playing),
        session_issued: true,
        timer_running: true,
        ..RuntimeContext::default()
    };
    let mut flags = loaded();
    let before = flags.clone();
    assert!(matches!(
        flags.settings_set_global(GlobalSetting::TimerEnabled(false), ctx),
        Err(MatchError::IllegalSettings {
            key: "globals.timer.enabled",
            ..
        })
    ));
    assert_eq!(flags, before);

    // Turning it *on* is never the dangerous direction.
    assert!(
        flags
            .settings_set_global(GlobalSetting::TimerEnabled(true), ctx)
            .is_ok()
    );
}

#[test]
fn an_illegal_write_is_refused_whole() {
    let mut flags = loaded();
    flags
        .settings_set_current_game(GameSetting::LockSpeedEnabled(true), idle())
        .unwrap();
    let before = flags.clone();

    // Switching the mode to the exclusive lock-speed while the option is on
    // would double-apply the speed factor (§2.3). The mode does not move.
    assert!(matches!(
        flags.settings_set_current_game(GameSetting::ScoringMode(ScoringMode::LockSpeed), idle()),
        Err(MatchError::IllegalSettings { .. })
    ));
    assert_eq!(flags, before);

    // Clearing the option first is the legal route, and the host takes it.
    flags
        .settings_set_current_game(GameSetting::LockSpeedEnabled(false), idle())
        .unwrap();
    flags
        .settings_set_current_game(GameSetting::ScoringMode(ScoringMode::LockSpeed), idle())
        .unwrap();
    assert_eq!(
        flags.current_game().unwrap().scoring.mode,
        ScoringMode::LockSpeed
    );
}

#[test]
fn a_global_write_that_would_seed_an_illegal_recipe_is_refused() {
    let mut flags = FlagService::default();
    assert!(
        flags
            .settings_set_global(
                GlobalSetting::Game(GameSetting::MaxConsecutiveCorrect(Some(0))),
                idle()
            )
            .is_err()
    );
    assert!(
        flags
            .settings_set_global(GlobalSetting::TimerDurationMs(0), idle())
            .is_err()
    );
    assert_eq!(flags, FlagService::default());
}

// ------------------------------------------------------------------- the reads

#[test]
fn the_disabled_list_greys_the_sibling_the_mode_makes_inert() {
    let mut flags = loaded();
    // Default mode is difficulty: flat points and the exclusive base are inert,
    // the option checkbox is live.
    let keys = disabled_keys(&flags, idle());
    assert!(keys.contains(&"scoring.lock_speed_base"));
    assert!(keys.contains(&"scoring.flat_points"));
    assert!(keys.contains(&"scoring.speed_weight"));
    assert!(!keys.contains(&"scoring.lock_speed.enabled"));
    assert!(!keys.contains(&"scoring.difficulty_map"));

    flags
        .settings_set_current_game(GameSetting::ScoringMode(ScoringMode::LockSpeed), idle())
        .unwrap();
    let keys = disabled_keys(&flags, idle());
    assert!(keys.contains(&"scoring.lock_speed.enabled"));
    assert!(!keys.contains(&"scoring.lock_speed_base"));
    assert!(
        !keys.contains(&"scoring.speed_weight"),
        "the weight is the whole point of the exclusive mode"
    );
}

#[test]
fn operator_pace_greys_the_duration_and_the_lock_speed_weight() {
    let mut flags = loaded();
    flags
        .settings_set_current_game(GameSetting::LockSpeedEnabled(true), idle())
        .unwrap();
    flags
        .settings_set_current_game(GameSetting::TimerEnabled(Some(false)), idle())
        .unwrap();

    let keys = disabled_keys(&flags, idle());
    assert!(keys.contains(&"timer.duration_ms"));
    assert!(keys.contains(&"scoring.speed_weight"));
    assert!(!flags.show_timer_controls());
    assert!(flags.disabled(idle()).contains(&Disabled {
        key: "scoring.speed_weight",
        reason: DisabledReason::Inert("the play runs at operator pace"),
    }));
}

#[test]
fn an_open_play_greys_every_game_affecting_key_without_hiding_it() {
    let flags = loaded();
    let keys = disabled_keys(&flags, playing());
    for key in GAME_AFFECTING_KEYS {
        assert!(keys.contains(key), "{key} was not reported as frozen");
    }
    // Visible but disabled (§2.5): the document is still readable in full.
    let view = flags.settings_get(playing());
    assert!(view.game_affecting_frozen);
    assert!(view.current_game.is_some());
}

#[test]
fn an_off_parent_greys_the_child_feature() {
    let mut flags = FlagService::default();
    flags
        .settings_set_global(GlobalSetting::Feature(FeatureRoot::Audio, false), idle())
        .unwrap();
    assert!(!flags.feature(FeatureRoot::AudioSynth));
    assert_eq!(
        flags.require_feature(FeatureRoot::AudioSynth).unwrap_err(),
        MatchError::FeatureOff("feat.audio.synth")
    );
    assert!(disabled_keys(&flags, idle()).contains(&"feat.audio.synth"));
}

#[test]
fn every_advertised_flag_key_resolves() {
    let flags = loaded();
    let ctx = playing();
    for key in FLAG_KEYS {
        assert!(flags.flag(key, ctx).is_some(), "{key} did not resolve");
    }
    assert_eq!(flags.flag("nope.not.a.key", ctx), None);
}

#[test]
fn the_runtime_flags_are_read_off_the_play_not_stored() {
    let flags = loaded();
    let mut service = MatchService::new();
    service
        .play_load(snapshot(2, 1, 2, flags.freeze().unwrap()), 0)
        .unwrap();
    service.play_start(0).unwrap();

    let ctx = RuntimeContext::of(&service, false);
    assert_eq!(
        flags.flag("play.status", ctx),
        Some(FlagValue::Status(Some(PlayStatus::Playing)))
    );
    assert_eq!(
        flags.flag("session.issued", ctx),
        Some(FlagValue::Bool(false))
    );

    service.choose_domain(&support::domain_id(0), 0).unwrap();
    service.start_timer(0).unwrap();
    service.set_selection(&[option_id('a')], 100).unwrap();
    service.lock_selection(100).unwrap();

    let ctx = RuntimeContext::of(&service, true);
    assert_eq!(
        flags.flag("session.locked", ctx),
        Some(FlagValue::Bool(true))
    );
    assert_eq!(flags.flag("overlay.busy", ctx), Some(FlagValue::Bool(true)));
    assert_eq!(
        flags.flag("timer.running", ctx),
        Some(FlagValue::Bool(false)),
        "lock stops the clock (§2.4)"
    );
    assert!(
        !flags.show_give_token(ctx),
        "refuse_until_reveal hides GiveToken while a lock is unrevealed (§2.6)"
    );

    service.reveal_outcome(200).unwrap();
    let ctx = RuntimeContext::of(&service, false);
    assert!(flags.show_give_token(ctx));
}

#[test]
fn allow_shows_give_token_even_while_locked() {
    let mut flags = loaded();
    flags
        .settings_set_global(
            GlobalSetting::OverrideAfterLock(OverrideAfterLock::Allow),
            idle(),
        )
        .unwrap();
    let ctx = RuntimeContext {
        play_status: Some(PlayStatus::Playing),
        session_issued: true,
        session_locked: true,
        ..RuntimeContext::default()
    };
    assert!(flags.show_give_token(ctx));
    // …and the live half that `MatchService` reads moved with it.
    assert_eq!(flags.live().override_after_lock, OverrideAfterLock::Allow);
}

#[test]
fn a_control_behaviour_write_takes_effect_immediately_and_is_remembered() {
    let mut flags = loaded();
    for write in [
        GlobalSetting::OverlayAnimationsEnabled(false),
        GlobalSetting::ViewerHitTargets(false),
        GlobalSetting::MosaicDensity(MosaicDensity::Compact),
        GlobalSetting::StageMonitorId(Some("monitor-2".to_owned())),
        GlobalSetting::StatsMonitorId(Some("monitor-3".to_owned())),
        GlobalSetting::StageReattach(StageReattach::Auto),
        GlobalSetting::Reveal(RevealChannel::Answers, RevealMode::Auto),
    ] {
        flags.settings_set_global(write, playing()).unwrap();
    }
    let expected = ControlSettings {
        override_after_lock: OverrideAfterLock::RefuseUntilReveal,
        reveal: flags.reveal_modes(),
        overlay_animations_enabled: false,
        viewer_hit_targets: false,
        mosaic_density: MosaicDensity::Compact,
        stage_monitor_id: Some("monitor-2".to_owned()),
        stats_monitor_id: Some("monitor-3".to_owned()),
        stage_reattach: StageReattach::Auto,
    };
    assert_eq!(flags.control(), &expected);
    assert_eq!(
        flags.globals().control,
        expected,
        "a Control Global write is the same document the Settings tab shows"
    );
    assert_eq!(flags.reveal_modes().answers, RevealMode::Auto);
}

#[test]
fn loading_a_recipe_adopts_its_reveal_defaults() {
    let mut flags = FlagService::default();
    let mut game = GameSettings::default();
    game.reveal
        .set(RevealChannel::Leaderboard, RevealMode::Auto);
    flags.load_recipe(game).unwrap();
    assert_eq!(flags.reveal_modes().leaderboard, RevealMode::Auto);

    // Unloading keeps the operator's live choices; only the recipe leaves.
    flags.unload_recipe();
    assert!(flags.current_game().is_none());
    assert_eq!(flags.reveal_modes().leaderboard, RevealMode::Auto);
}

#[test]
fn the_globals_seed_a_new_recipe_and_never_a_recipe_that_exists() {
    // §12: "Global award default does not rewrite a recipe that already
    // overrode it."
    let mut flags = loaded();
    flags
        .settings_set_global(
            GlobalSetting::Game(GameSetting::ScoringMode(ScoringMode::Flat)),
            idle(),
        )
        .unwrap();
    assert_eq!(
        flags.current_game().unwrap().scoring.mode,
        ScoringMode::Difficulty
    );
    assert_eq!(flags.new_recipe_settings().scoring.mode, ScoringMode::Flat);
}

// ------------------------------------------------------------------ shortcuts

#[test]
fn a_chord_belongs_to_one_command() {
    let mut flags = FlagService::default();
    let chord = Chord::parse("ctrl+l").unwrap();
    flags
        .settings_set_shortcut("lock_selection", Some(chord.clone()))
        .unwrap();

    // A differently-spelled but identical chord is the same conflict.
    assert!(matches!(
        flags.settings_set_shortcut("reveal_outcome", Chord::parse("Control+L")),
        Err(MatchError::IllegalSettings {
            key: "shortcuts",
            ..
        })
    ));
    // Rebinding a command to the chord it already has is not a conflict.
    flags
        .settings_set_shortcut("lock_selection", Some(chord.clone()))
        .unwrap();

    flags.settings_set_shortcut("lock_selection", None).unwrap();
    flags
        .settings_set_shortcut("reveal_outcome", Some(chord.clone()))
        .unwrap();
    assert_eq!(
        flags.globals().shortcuts.command_for(&chord),
        Some("reveal_outcome")
    );
}

// ------------------------------------------------------------- the whole document

#[test]
fn a_default_install_is_a_legal_document() {
    let flags = FlagService::new(GlobalSettings::default());
    assert!(flags.settings_get(idle()).disabled.is_empty());
    assert!(flags.show_timer_controls());
    assert_eq!(flags.timer_cascade().resolve(None), Some(30_000));
}

#[test]
fn the_cascade_reads_the_recipe_over_the_globals() {
    let mut flags = loaded();
    flags
        .settings_set_current_game(GameSetting::TimerDurationMs(Some(15_000)), idle())
        .unwrap();
    assert_eq!(flags.timer_cascade().resolve(None), Some(15_000));
    assert_eq!(flags.timer_cascade().resolve(Some(45_000)), Some(45_000));

    flags
        .settings_set_current_game(GameSetting::TimerEnabled(Some(false)), idle())
        .unwrap();
    assert_eq!(
        flags.timer_cascade().resolve(Some(45_000)),
        None,
        "disabled at the winning level is operator pace"
    );

    // The support helper's operator-pace fixture is the same document.
    assert_eq!(operator_pace().timer.resolve(None), None);
    assert_eq!(
        flags.freeze().unwrap().timer.globals,
        TimerLevel::new(true, 30_000)
    );
}

/// §2.15: the active operator is a global, survives a round trip through the
/// stored document, and an older document without the field still loads.
#[test]
fn the_active_operator_is_a_global_setting_with_a_default() {
    let mut flags = FlagService::default();
    assert_eq!(flags.globals().active_operator_id, None);

    flags
        .settings_set_global(
            GlobalSetting::ActiveOperatorId(Some("op-1".into())),
            idle(),
        )
        .unwrap();
    assert_eq!(
        flags.globals().active_operator_id.as_ref().map(|id| id.as_str()),
        Some("op-1")
    );

    let json = serde_json::to_value(flags.globals()).unwrap();
    assert_eq!(json["active_operator_id"], "op-1");

    let mut old = json.clone();
    old.as_object_mut().unwrap().remove("active_operator_id");
    let loaded: GlobalSettings = serde_json::from_value(old).unwrap();
    assert_eq!(loaded.active_operator_id, None);
}
