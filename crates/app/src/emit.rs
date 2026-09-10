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
use tauri::{AppHandle, Emitter};

use crate::guard::{MAIN, STAGE, STATS};
use crate::state::Host;

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

    let _ = app.emit_to(STAGE, "play-state", &stage);
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
    /// Where the Stage window actually stands. `null` is the primary display.
    stage_on: Option<&'a str>,
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
pub fn monitors_changed(app: &AppHandle, host: &Host, stats_open: bool) {
    let _ = app.emit_to(
        MAIN,
        "monitors-changed",
        MonitorsChanged {
            monitors: host.display.monitors(),
            stage_monitor_id: host.flags.control().stage_monitor_id.as_deref(),
            stage_on: host.display.current().map(|k| k.as_str()),
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
