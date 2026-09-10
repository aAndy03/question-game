//! Host → webview events (§13).
//!
//! ```text
//! play-state        full to main and stats, stripped to stage
//! catalog-changed   a library row moved; main and stats
//! recipe-changed    a recipe moved; carries the new rev; main and stats
//! monitors-changed  the OS display list moved
//! notice            §14 { code, severity, target_path, actions[] }
//! health            §12.6 { status, items[] }, only when the report changed
//! anim-complete     forwarded from Stage to main
//! ```
//!
//! **`stage` never receives the operator half.** `Host::stage_state` builds the
//! stripped shape and this module is the only sender, so there is one place a
//! leak could be introduced and one place to look for it. The other half of
//! that boundary is in the webviews: each listens *as its own label*, because
//! a bare `listen()` registers `EventTarget::Any` and Tauri lets an `Any`
//! listener past the `emit_to` filter entirely.
//!
//! **The Statistics window is Studio, not Stage** (§11.K). It is a projector,
//! so it gets the reads it draws from — the Play and the two catalog
//! events — and none of the chrome events it has no surface for.

use questiongame_host::Notice;
use questiongame_host::catalog::{CatalogChange, RecipeChange};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};

use crate::guard::{is_stage_label, MAIN, STATS};
use crate::state::Host;

/// Every Stage window that exists right now — the pacer and its mirrors
/// (§9, P11.11).
///
/// Read from the window map rather than from the settings list: a mirror whose
/// display was just unplugged is gone from here the moment its window closes,
/// and this is what decides who sees the Play. Sharing `is_stage_label` with
/// the guard is deliberate — a window the guard admits but this skips is a
/// black screen on an audience display.
fn stage_labels(app: &AppHandle) -> Vec<String> {
    app.webview_windows()
        .into_keys()
        .filter(|label| is_stage_label(label))
        .collect()
}

/// Send the current Play to both webviews. Called after every write and by the
/// 100ms tick.
///
/// Returns whether anything went out: the tick asks so an idle Play costs
/// nothing on the wire.
pub fn play_state(app: &AppHandle, host: &mut Host, now_ms: u64, force: bool) -> bool {
    // **No Play is a state too.** Between shows — before the first load and
    // after `play_unload` — the host still has something to say: Stage draws
    // the empty projection (the idle screen, no roster, no board) and Studio
    // is told the Play is gone. A webview that is simply not sent anything
    // goes on drawing the Play that ended.
    let stage = host.stage_state(now_ms);
    let emission = host.emission_changed(&stage);
    if !emission.changed && !force {
        return false;
    }

    for label in stage_labels(app) {
        let _ = app.emit_to(label, "play-state", &stage);
    }
    // `main` and `stats` get `null` rather than the empty shape: Studio's
    // store means "no Play" by `null`, and Control's panels read it that way.
    let full = host.main_state(now_ms);
    let _ = app.emit_to(MAIN, "play-state", &full);
    // The performance log counts emissions and their size. The stage payload's
    // size came free with the digest; the `main` shape is measured through the
    // same counting sink rather than `to_vec`, which allocated the whole
    // document ten times a second purely to call `.len()` on it (P11.6).
    let bytes = if crate::perf::enabled_cached() {
        let mut sink = crate::state::Digest::default();
        let _ = serde_json::to_writer(&mut sink, &full);
        emission.bytes + sink.bytes * 2
    } else {
        0
    };
    tracing::trace!(target: crate::perf::TARGET, kind = "emit", bytes);
    // Statistics draws the Live view from the same shape Studio's own window
    // reads. It cannot write it (`guard::STATS_COMMANDS`).
    let _ = app.emit_to(STATS, "play-state", &full);
    // A full emission carries the clock, so the `play-tick` behind it would be
    // saying the same thing twice.
    host.remember_clock(clock_of(&stage));
    true
}

/// The clock as a tuple, for the tick's gate.
fn clock_of(state: &questiongame_host::stage::PlayStateForStage) -> (Option<u32>, u64, bool) {
    (
        state.game.session.as_ref().and_then(|s| s.timer.as_ref()).map(|t| t.remaining_ms),
        state.game.clock.elapsed_ms,
        state.game.clock.running,
    )
}

/// The 100 ms show loop's ordinary emission: the countdown, and nothing else.
///
/// **When the host knows nothing else can have changed** — `tick_due` is false,
/// so the T=0 table will not fire and no command has run — this replaces
/// `play_state` entirely. That is 999 ticks in 1000, and on each of them it
/// saves three full projections of the Play (two inside `Host::write`'s
/// overlay diff, one here), the digest over ~8.4 KB, and three emissions of
/// that same 8.4 KB. Over a fifteen-minute show the wire went from ~34 MB of
/// JSON to under one (P11.9).
///
/// Returns whether anything went out: a paused Play moves neither number, so
/// it stays as quiet as it always did.
pub fn play_tick(app: &AppHandle, host: &mut Host, now_ms: u64) -> bool {
    let Some(play) = host.play.get_state() else {
        return false;
    };
    let tick = questiongame_host::stage::tick(play, now_ms);
    let clock = (tick.remaining_ms, tick.elapsed_ms, tick.running);
    if !host.clock_moved(clock) {
        return false;
    }
    // The same shape to all three: it carries no operator half to strip, which
    // is the other reason this is cheaper than a full emission.
    for label in stage_labels(app) {
        let _ = app.emit_to(label, "play-tick", &tick);
    }
    let _ = app.emit_to(MAIN, "play-tick", &tick);
    let _ = app.emit_to(STATS, "play-tick", &tick);
    // Measured the same way `play_state` measures: a counting sink rather than
    // a `to_vec`, and only when the log is on. Without it the perf log's
    // `emit_bytes` counted the event-driven half and called it the wire.
    let bytes = if crate::perf::enabled_cached() {
        let mut sink = crate::state::Digest::default();
        let _ = serde_json::to_writer(&mut sink, &tick);
        sink.bytes * 3
    } else {
        0
    };
    // After the last use of `tick`, which borrows the Play out of `host`.
    host.remember_clock(clock);
    tracing::trace!(target: crate::perf::TARGET, kind = "tick_emit", bytes);
    true
}

/// A library row moved. Studio invalidates its TanStack Query caches off this;
/// Stage never sees it — a catalog edit cannot move an open Play (§4.3).
pub fn catalog_changed(app: &AppHandle, change: &CatalogChange) {
    let _ = app.emit_to(MAIN, "catalog-changed", change);
    // A rename reaches Statistics through the same invalidation (§13 relabel).
    let _ = app.emit_to(STATS, "catalog-changed", change);
}

/// Several rows moved in one confirmed batch (§2.19). One event, so Studio
/// invalidates once rather than two hundred times.
pub fn catalog_changed_many(app: &AppHandle, changes: &[CatalogChange]) {
    for change in changes {
        catalog_changed(app, change);
    }
}

pub fn recipe_changed(app: &AppHandle, change: &RecipeChange) {
    let _ = app.emit_to(MAIN, "recipe-changed", change);
    let _ = app.emit_to(STATS, "recipe-changed", change);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorsChanged<'a> {
    monitors: &'a [questiongame_host::MonitorInfo],
    /// The remembered pick, connected or not.
    stage_monitor_id: Option<&'a str>,
    /// Where the Stage window actually stands, **resolved**: the primary
    /// display's own key rather than `null`, so Studio can tell "Stage is on
    /// primary" from "there is no Stage" (P11.11). `null` means no window.
    stage_on: Option<String>,
    /// Whether the Stage window exists at all.
    stage_open: bool,
    /// The displays mirroring the pacer right now (§9, P11.11).
    stage_mirrors: Vec<String>,
    /// The display Statistics would open on, connected or not.
    stats_monitor_id: Option<&'a str>,
    /// Whether the Statistics window is on screen **right now**. It is window
    /// state, not settings state — the operator opens and closes it, and the
    /// button that does so reads its label from here (§13.3).
    stats_open: bool,
}

/// `stats_open` is passed in rather than read here: every caller already knows
/// it, and asking the window map for it while the host lock is held is the one
/// habit `windows::refresh` exists to avoid.
pub fn monitors_changed(app: &AppHandle, host: &Host, stats_open: bool, stage_open: bool) {
    let _ = app.emit_to(
        MAIN,
        "monitors-changed",
        MonitorsChanged {
            monitors: host.display.monitors(),
            stage_monitor_id: host.flags.control().stage_monitor_id.as_deref(),
            stage_on: stage_open.then(|| {
                host.display
                    .current()
                    .cloned()
                    // `None` is the primary display, not "nowhere": Stage is
                    // fullscreen on primary from first Control Load (§9), and
                    // conflating the two is what made a card go blank while
                    // the show was on it.
                    .or_else(|| host.display.primary().map(|m| m.key.clone()))
                    .map(|k| k.as_str().to_owned())
                    .unwrap_or_default()
            }),
            stage_open,
            stage_mirrors: host
                .display
                .live_mirrors()
                .iter()
                .map(|k| k.as_str().to_owned())
                .collect(),
            stats_monitor_id: host.flags.control().stats_monitor_id.as_deref(),
            stats_open,
        },
    );
}

/// §14. Operator-facing by definition: Stage shows no notices.
pub fn notice(app: &AppHandle, notice: &Notice) {
    let _ = app.emit_to(MAIN, "notice", notice);
}

/// Stage finished a timeline. Forwarded so Control's Viewer can follow the same
/// beats the audience is watching.
pub fn anim_complete(app: &AppHandle, key: &str) {
    let _ = app.emit_to(MAIN, "anim-complete", serde_json::json!({ "key": key }));
}

/// §12.6. Operator-facing; emitted only when the report changed, so a quiet
/// machine says nothing and an `ok` after a `warn` clears the dot.
pub fn health(app: &AppHandle, report: &questiongame_host::HealthReport) {
    let _ = app.emit_to(MAIN, "health", report);
}
