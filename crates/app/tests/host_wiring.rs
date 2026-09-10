//! `Host` — the composition, without Tauri.
//!
//! The commands are thin by design, so what is worth testing is the thing under
//! them: the four services composing in one direction, the write path that
//! always follows a Play command, and the split between what `stage` receives
//! and what `main` does.
//!
//! `Host` takes a `CatalogLocation`, so all of this runs on the in-memory
//! adapter — no window, no runtime, no display. The P6 exit criteria that need
//! a real webview (Stage renders identically fixture-fed or host-fed) live on
//! the TypeScript side; everything else is here.

use std::path::PathBuf;

use questiongame_app::state::{Host, PlayStateForMain};
use questiongame_host::catalog::{
    ArchiveScope, BoardDomain, CatalogLocation, CatalogService, Domain, DomainMember, Question,
    QuestionOption, Recipe, Team,
};
use questiongame_host::flags::{CueKey, GameSetting, GameSettings, GlobalSetting};
use questiongame_host::health::HealthStatus;
use questiongame_host::stage::StageScreen;
use questiongame_host::{
    DomainId, MonitorInfo, MonitorKey, OptionId, PlayId, PlayStatus, QuestionId, RecipeId,
    StageReattach, TeamId,
};

// ------------------------------------------------------------------- fixtures

/// A file that goes away when the test does — WAL and shared-memory sidecars
/// included, or the next run would inherit them.
struct TempDb(PathBuf);

impl TempDb {
    fn new(tag: &str) -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let mut path = std::env::temp_dir();
        path.push(format!(
            "questiongame-app-{tag}-{}-{nanos}.sqlite3",
            std::process::id()
        ));
        TempDb(path)
    }

    fn location(&self) -> CatalogLocation {
        CatalogLocation::file(&self.0)
    }
}

impl Drop for TempDb {
    fn drop(&mut self) {
        for suffix in ["", "-wal", "-shm"] {
            let mut path = self.0.clone().into_os_string();
            path.push(suffix);
            let _ = std::fs::remove_file(path);
        }
    }
}

fn opt(letter: char) -> OptionId {
    OptionId::new(format!("opt-{letter}"))
}

fn seed(catalog: &CatalogService) -> RecipeId {
    for id in ["team-a", "team-b"] {
        let team = Team::new(id, format!("TEAM {id}"), id.to_uppercase());
        catalog.catalog_upsert(&team.into(), 1_000).unwrap();
    }
    for (id, difficulty) in [("q-1", 10), ("q-2", 20)] {
        let question = Question::new(id, format!("Stem of {id}?"), difficulty).with_options(vec![
            QuestionOption::new(opt('a'), "A", true),
            QuestionOption::new(opt('b'), "B", false),
        ]);
        catalog.catalog_upsert(&question.into(), 1_000).unwrap();
    }
    let mut domain = Domain::new("dom-1", "Science", "SCI_204");
    domain.questions = vec![
        DomainMember {
            question_id: QuestionId::from("q-1"),
            sort_key: 0,
        },
        DomainMember {
            question_id: QuestionId::from("q-2"),
            sort_key: 1,
        },
    ];
    catalog.catalog_upsert(&domain.into(), 1_000).unwrap();

    let mut recipe = Recipe::new("recipe-1", "Demo", GameSettings::default());
    recipe.teams = vec![TeamId::from("team-a"), TeamId::from("team-b")];
    recipe.board = vec![BoardDomain {
        domain_id: DomainId::from("dom-1"),
        question_ids: vec![QuestionId::from("q-1"), QuestionId::from("q-2")],
    }];
    catalog.recipe_upsert(&recipe, 1_000).unwrap();
    RecipeId::from("recipe-1")
}

/// What `play_load` does, minus the window and the emission — the one place the
/// three services' order is spelled.
fn load(host: &mut Host, recipe_id: &RecipeId, play_id: &str, now_ms: u64) {
    let recipe = host.catalog.recipe_get(recipe_id).unwrap();
    host.flags.load_recipe(recipe.settings.clone()).unwrap();
    let settings = host.flags.freeze().unwrap();
    let snapshot = host
        .catalog
        .build_snapshot(recipe_id, PlayId::from(play_id), settings)
        .unwrap();
    host.write(now_ms, |h| Ok(h.play.play_load(snapshot, now_ms)?))
        .unwrap();
}

fn booted() -> Host {
    let mut host = Host::open(CatalogLocation::Memory).unwrap();
    let recipe = seed(&host.catalog);
    load(&mut host, &recipe, "play-1", 1_000);
    host.write(2_000, |h| Ok(h.play.play_start(2_000)?))
        .unwrap();
    host
}

// ------------------------------------------------------ the composition itself

#[test]
fn the_three_services_compose_into_one_start() {
    let host = booted();
    let state = host.stage_state(2_000);

    assert_eq!(state.game.status, PlayStatus::Playing);
    assert_eq!(state.game.teams.len(), 2);
    assert_eq!(state.game.domains[0].remaining, 2);
    assert_eq!(state.current_screen, StageScreen::Idle);
    assert!(state.overlay.enabled, "§4.2 default: overlays on");
}

/// §5.7. Stage receives the game and the presentation; the operator half is
/// `main`'s alone. A leak here is a leak on camera.
#[test]
fn stage_never_receives_the_operator_half() {
    let host = booted();

    let stage = serde_json::to_value(host.stage_state(2_000)).unwrap();
    assert!(
        stage.get("operator").is_none(),
        "stage sees no operator chrome",
    );
    for key in [
        "contractVersion",
        "teams",
        "ring",
        "currentScreen",
        "overlay",
    ] {
        assert!(stage.get(key).is_some(), "stage needs {key}");
    }

    let main = serde_json::to_value(host.main_state(2_000).unwrap()).unwrap();
    assert!(main["operator"]["legalTokenTargets"].is_array());
    assert_eq!(main["operator"]["canUndo"], false);
    assert_eq!(main["operator"]["isRehearsal"], false);
    // The full emission is a superset: every stripped key is still there.
    for (key, value) in stage.as_object().unwrap() {
        assert_eq!(&main[key], value, "main lost {key}");
    }
}

/// The event **log** is not in the 100ms emission. Timeline reads it with a
/// command; ten kilobytes of history per countdown tick is not a wire format.
#[test]
fn the_emission_carries_a_count_not_the_log() {
    let host = booted();
    let main: PlayStateForMain = host.main_state(2_000).unwrap();
    assert!(main.operator.event_count > 0);

    let json = serde_json::to_value(&main).unwrap();
    assert!(json["operator"].get("events").is_none());
    assert!(json.get("events").is_none());
}

// ------------------------------------------------------------- the write path

/// The show loop reads; it does not write. A tick that changes nothing appends
/// nothing, so `Host::write` skips the fsync — which is the whole reason a
/// 100ms poll is affordable next to `synchronous = FULL`.
#[test]
fn a_tick_that_changes_nothing_grows_neither_the_log_nor_the_disk() {
    let mut host = booted();
    let before = host.main_state(3_000).unwrap().operator.event_count;

    for at in [3_000, 3_100, 3_200, 30_000] {
        host.write(at, |h| Ok(h.play.tick(at)?)).unwrap();
    }

    assert_eq!(
        host.main_state(30_000).unwrap().operator.event_count,
        before,
        "no question is issued, so there is no clock to expire",
    );
}

/// And the emission gate: an idle Play costs nothing on the wire.
#[test]
fn an_unchanged_emission_is_not_re_sent() {
    let mut host = booted();
    let state = host.stage_state(4_000);

    let first = host.emission_changed(&state);
    assert!(first.changed, "the first one always goes");
    assert!(first.bytes > 0, "the digest counts the payload as it hashes it");
    assert!(
        !host.emission_changed(&state).changed,
        "the second one does not"
    );

    host.write(5_000, |h| {
        Ok(h.play.choose_domain(&DomainId::from("dom-1"), 5_000)?)
    })
    .unwrap();
    let next = host.stage_state(5_000);
    assert!(host.emission_changed(&next).changed, "a real change goes");
    // And back again: the gate is a digest, not a one-way latch.
    assert!(
        !host.emission_changed(&next).changed,
        "the same state twice is one emission"
    );
}

/// A Play command's cause reaches `PresentationService` through `Host::write`,
/// so an overlay is queued without any command knowing it exists.
#[test]
fn a_write_lets_the_presentation_service_see_the_cause() {
    let host = booted();
    assert!(
        host.presentation.overlay_busy(),
        "the first token handed off"
    );

    let key = host
        .presentation
        .active_overlay()
        .map(|o| o.anim_key())
        .unwrap();
    assert_eq!(key, "overlay:token-handoff");
}

/// §2.5. The freeze is enforced by the host, not by a disabled input.
///
/// Note which write is refused and which is not: `settings_set_current_game`
/// touches the recipe this Play froze, so it is refused; the *global* seed of
/// the same key is legal, because §12 says a global default never rewrites a
/// recipe that already has its own copy — including the one on the wall.
#[test]
fn a_game_affecting_setting_is_refused_while_a_play_is_open() {
    let mut host = booted();
    let ctx = host.runtime();

    let refused = host
        .flags
        .settings_set_current_game(GameSetting::FlatPoints(999), ctx);
    assert!(refused.is_err(), "frozen for the life of the play");

    let ctx = host.runtime();
    host.flags
        .settings_set_global(GlobalSetting::Game(GameSetting::FlatPoints(999)), ctx)
        .expect("the seed for the *next* recipe is not this Play's business");

    // A control-behaviour key in the same document still writes.
    let ctx = host.runtime();
    host.flags
        .settings_set_global(GlobalSetting::OverlayAnimationsEnabled(false), ctx)
        .expect("control-behaviour keys stay live");
    assert!(!host.overlays_enabled());
}

// ------------------------------------------------------------------ the boot

/// "Kill the process mid-show; boot replays events and loses nothing" — the P5
/// exit criterion, now as the P6 boot path. `Host::open` adopts the resumed
/// Play rather than starting from an empty snapshot.
#[test]
fn boot_takes_back_the_play_that_was_open_with_its_score() {
    let temp = TempDb::new("resume");

    {
        let mut host = Host::open(temp.location()).unwrap();
        let recipe = seed(&host.catalog);
        load(&mut host, &recipe, "play-1", 1_000);
        host.write(2_000, |h| Ok(h.play.play_start(2_000)?))
            .unwrap();
        host.write(3_000, |h| {
            Ok(h.play.choose_domain(&DomainId::from("dom-1"), 3_000)?)
        })
        .unwrap();
        host.write(4_000, |h| Ok(h.play.set_selection(&[opt('a')], 4_000)?))
            .unwrap();
        host.write(5_000, |h| Ok(h.play.lock_selection(5_000)?))
            .unwrap();
        host.write(6_000, |h| Ok(h.play.reveal_outcome(6_000)?))
            .unwrap();
        // No clean shutdown: dropping is what a kill looks like from the file.
    }

    let host = Host::open(temp.location()).unwrap();
    let state = host.stage_state(7_000);
    assert_eq!(state.game.play_id, "play-1");
    assert_eq!(state.game.status, PlayStatus::Playing);
    assert!(
        state.game.teams.iter().any(|t| t.score > 0),
        "boot loses nothing",
    );
    assert!(
        host.main_state(7_000).unwrap().operator.can_undo,
        "and the Timeline reaches the resumed turn",
    );
}

#[test]
fn a_fresh_install_boots_with_no_play_and_the_default_document() {
    let host = Host::open(CatalogLocation::Memory).unwrap();
    // Stage always has something to draw; with no Play it is the empty
    // projection — the idle screen with no roster and no board.
    let empty = host.stage_state(0);
    assert_eq!(empty.game.play_id, "");
    assert!(empty.game.teams.is_empty());
    assert_eq!(empty.current_screen, questiongame_host::StageScreen::Idle);
    assert!(host.main_state(0).is_none(), "and no operator half at all");
    assert!(host.overlays_enabled(), "§4.2 defaults");
    assert_eq!(
        host.catalog
            .catalog_list(questiongame_host::CatalogKind::Team, ArchiveScope::Active)
            .unwrap()
            .len(),
        0,
    );
}

// --------------------------------------------------------------- the displays

fn monitor(name: &str, primary: bool, size: (u32, u32)) -> MonitorInfo {
    MonitorInfo {
        key: MonitorKey::derive(Some(name), size.0, size.1),
        name: Some(name.to_owned()),
        primary,
        position: (0, 0),
        size,
        physical_size: size,
        scale_factor: 1.0,
    }
}

/// §9's exit criterion, with the fake end of the monitor seam: unplugging the
/// Stage display pulls the window back and raises a notice, and **the Play
/// stays `playing`** — nothing in the monitor path can reach a Play.
#[test]
fn unplugging_the_stage_display_leaves_the_play_playing() {
    let mut host = booted();
    let projector = monitor("projector", false, (1920, 1080));
    let key = projector.key.clone();

    host.display.monitors_changed(
        vec![monitor("built-in", true, (1512, 982)), projector],
        None,
        StageReattach::Ask,
        true,
    );
    host.display.set_monitor(Some(key.clone())).unwrap();

    let mv = host.display.monitors_changed(
        vec![monitor("built-in", true, (1512, 982))],
        Some(&key),
        StageReattach::Ask,
        true,
    );

    assert_eq!(mv.to, Some(None), "the window comes back to primary");
    assert_eq!(mv.notice.expect("a notice").code, "stage.monitor_lost");
    assert_eq!(
        host.stage_state(8_000).game.status,
        PlayStatus::Playing,
        "the show carries on",
    );
}

/// One display is a valid configuration (§9), and the host still refuses to
/// pick one for the operator when there are several.
#[test]
fn the_host_never_picks_a_display() {
    let mut host = booted();
    let mv = host.display.monitors_changed(
        vec![
            monitor("built-in", true, (1512, 982)),
            monitor("projector", false, (1920, 1080)),
            monitor("tv", false, (3840, 2160)),
        ],
        None,
        StageReattach::Ask,
        false,
    );
    assert_eq!(mv.to, None);
    assert_eq!(mv.notice, None);
    assert_eq!(host.display.current(), None, "Stage waits on primary");
}

// ------------------------------------------------------------------- the demo

/// The demo library is written through the ordinary verbs, so it is also a
/// test of them: seed, load, and play a turn end to end.
#[test]
fn the_demo_library_seeds_a_playable_show() {
    let mut host = Host::open(CatalogLocation::Memory).unwrap();
    let (items, recipe) =
        questiongame_host::catalog::seed::demo_document(host.flags.new_recipe_settings());

    host.catalog.catalog_upsert_many(&items, 1_000).unwrap();
    host.catalog.recipe_upsert(&recipe, 1_000).unwrap();

    load(&mut host, &recipe.id, "play-demo", 2_000);
    host.write(2_000, |h| Ok(h.play.play_start(2_000)?))
        .unwrap();

    let state = host.stage_state(2_000);
    assert_eq!(state.game.teams.len(), 2, "the Demo has two teams (§2.27)");
    assert_eq!(state.game.domains.len(), 2);
    assert_eq!(
        state.game.domains[0].next_difficulty,
        Some(10),
        "the queue walks easy → hard inside a domain (§5.2)",
    );

    // And a whole turn resolves through it.
    host.write(3_000, |h| {
        Ok(h.play
            .choose_domain(&DomainId::from("seed-dom-sci"), 3_000)?)
    })
    .unwrap();
    host.write(4_000, |h| {
        Ok(h.play
            .set_selection(&[OptionId::new("seed-q-sci-1-a")], 4_000)?)
    })
    .unwrap();
    host.write(5_000, |h| Ok(h.play.lock_selection(5_000)?))
        .unwrap();
    host.write(6_000, |h| Ok(h.play.reveal_outcome(6_000)?))
        .unwrap();

    assert!(
        host.stage_state(6_000)
            .game
            .teams
            .iter()
            .any(|t| t.score > 0),
        "a correct answer scores",
    );
}

/// A Restart is a new Play, so nothing queued for the old one may play over it.
/// This goes through `Host::write` for the same reason the command does — the
/// observer is what empties the queue, and it only runs on that path.
#[test]
fn a_restart_empties_the_overlay_queue_and_persists_both_plays() {
    let temp = TempDb::new("restart");
    let mut host = Host::open(temp.location()).unwrap();
    let recipe = seed(&host.catalog);
    load(&mut host, &recipe, "play-1", 1_000);
    host.write(2_000, |h| Ok(h.play.play_start(2_000)?))
        .unwrap();
    assert!(
        host.presentation.overlay_busy(),
        "the first token handed off"
    );

    host.write(3_000, |h| {
        let closed = h.play.restart(
            questiongame_host::RestartMode::SameQuestions {
                new_play_id: questiongame_host::PlayId::from("play-2"),
            },
            3_000,
        )?;
        h.catalog.play_persist(&closed)?;
        if let Some(open) = h.play.get_state() {
            h.catalog.play_persist(open)?;
        }
        Ok(())
    })
    .unwrap();

    assert_eq!(host.stage_state(3_000).game.play_id, "play-2");
    assert_eq!(
        host.presentation.active_overlay().map(|o| o.kind()),
        Some("token-handoff"),
        "the queue was emptied and then the *new* Play's first token queued",
    );

    // Both records are under the recipe (§2.8) — the closed one especially,
    // because losing it to a crash three seconds later is losing a whole show.
    let plays = host.catalog.play_list(Some(&recipe)).unwrap();
    assert_eq!(plays.len(), 2);
}

/// P11.8: a cue finding has a way back.
///
/// `missing_cue` used to be the only writer of `missing_cues`, and it only
/// ever added — so one report from Stage latched a health warning for the life
/// of the process. It survived `play_unload`, it survived closing the Stage
/// window, and the only way out was restarting the app. Health is meant to be
/// silent when there is nothing to say, which means every input needs a
/// reverse.
#[test]
fn a_cue_that_loads_after_all_clears_its_finding() {
    let mut host = booted();
    assert_eq!(
        host.health.report(false, None).0.status,
        HealthStatus::Ok,
        "a quiet app says nothing"
    );

    host.health
        .missing_cue(CueKey::Lock, "lock.wav".to_owned());
    let (warned, _) = host.health.report(false, None);
    assert_eq!(warned.status, HealthStatus::Warn);
    assert_eq!(warned.items.len(), 1);
    assert_eq!(warned.items[0].code, "health.audio_missing_cue");

    host.health.cue_ok(CueKey::Lock);
    let (cleared, changed) = host.health.report(false, None);
    assert_eq!(cleared.status, HealthStatus::Ok, "the dot goes quiet again");
    assert!(cleared.items.is_empty());
    assert!(changed, "and the webviews are told");
}

/// One entry per key either way: a cue reported twice is one finding, and
/// clearing it clears exactly it.
#[test]
fn cue_findings_are_keyed_by_cue() {
    let mut host = booted();
    host.health.missing_cue(CueKey::Lock, "lock.wav".to_owned());
    host.health.missing_cue(CueKey::Lock, "lock.wav".to_owned());
    host.health
        .missing_cue(CueKey::Correct, "correct.wav".to_owned());
    assert_eq!(host.health.report(false, None).0.items.len(), 2);

    host.health.cue_ok(CueKey::Lock);
    let items = host.health.report(false, None).0.items;
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].detail["cue"], "correct");
}

/// P11.9: the show loop asks before it works.
///
/// `MatchService::tick` mutates a Play only through the T=0 table, and
/// everything else that can move one arrives as a command — so on a tick where
/// T=0 is not due, nothing but the countdown can differ from the last
/// emission. `tick_due` is what lets the host send two numbers instead of
/// projecting, digesting and serialising the whole Play three times over.
#[test]
fn a_tick_is_only_due_when_the_timer_reaches_zero() {
    let mut host = booted();
    host.write(1_000, |h| {
        Ok(h.play.choose_domain(&DomainId::from("dom-1"), 1_000)?)
    })
    .unwrap();
    host.write(1_100, |h| Ok(h.play.start_timer(1_100)?)).unwrap();

    // Mid-question: the countdown is moving and nothing else is.
    assert!(!host.play.tick_due(2_000), "a running timer is not due");
    assert!(!host.play.tick_due(10_000));

    // The clock is the only thing that differs across those instants.
    let a = questiongame_host::stage::tick(host.play.get_state().unwrap(), 2_000);
    let b = questiongame_host::stage::tick(host.play.get_state().unwrap(), 10_000);
    assert_ne!(a.remaining_ms, b.remaining_ms, "the countdown moved");
    assert_eq!(a.play_id, b.play_id);

    // And a tick that is not due really does nothing.
    let before = host.play.get_state().unwrap().events().len();
    host.play.tick(10_000).unwrap();
    assert_eq!(
        host.play.get_state().unwrap().events().len(),
        before,
        "a tick that is not due appends nothing"
    );
}

/// The gate is the clock, so a Play that is not counting stays off the wire.
#[test]
fn the_clock_gate_is_quiet_when_neither_number_moves() {
    let mut host = booted();
    let clock = (Some(30_000_u32), 1_000_u64, true);
    assert!(host.clock_moved(clock), "the first one always goes");
    host.remember_clock(clock);
    assert!(!host.clock_moved(clock), "the same instant twice is one emission");
    assert!(host.clock_moved((Some(29_900), 1_100, true)));
}

/// P11.11: only the pacer acknowledges an animation.
///
/// The overlay queue advances on an ack and never on a clock (§2.6). With two
/// audience displays there are two acks for one animation, so exactly one
/// window is in charge — otherwise the second retires an overlay the operator
/// has not seen finish, or promotes a pending one twice.
///
/// The guard lets a mirror through, because a mirror *is* a Stage window and
/// may report on itself. The refusal is the command's, and it is silent: the
/// mirror is behaving correctly.
#[test]
fn a_mirror_is_a_stage_window_but_not_the_pacer() {
    use questiongame_app::guard;

    assert!(guard::is_stage_label(guard::STAGE));
    assert!(guard::is_stage_label("stage-2"));
    assert!(!guard::is_stage_label(guard::MAIN));

    assert!(guard::allow("stage-2", "overlay_ack_complete").is_ok());
    assert!(
        guard::allow("stage-2", "lock_selection").is_err(),
        "a mirror is a projection, not a controller (§5.7)"
    );
}
