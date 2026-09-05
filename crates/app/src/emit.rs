//! Host → webview events (§13).
//!
//! ```text
//! play-state        full to main, stripped to stage
//! catalog-changed   a library row moved
//! recipe-changed    a recipe moved; carries the new rev
//! monitors-changed  the OS display list moved
//! notice            §14 { code, severity, target_path, actions[] }
//! anim-complete     forwarded from Stage to main
//! ```
//!
//! **`stage` never receives the operator half.** `Host::stage_state` builds the
//! stripped shape and this module is the only sender, so there is one place a
//! leak could be introduced and one place to look for it.

use questiongame_host::Notice;
use questiongame_host::catalog::{CatalogChange, RecipeChange};
use serde::Serialize;
use tauri::{AppHandle, Emitter};

use crate::guard::{MAIN, STAGE};
use crate::state::Host;

/// Send the current Play to both webviews. Called after every write and by the
/// 100ms tick.
///
/// Returns whether anything went out: the tick asks so an idle Play costs
/// nothing on the wire.
pub fn play_state(app: &AppHandle, host: &mut Host, now_ms: u64, force: bool) -> bool {
    let Some(stage) = host.stage_state(now_ms) else {
        return false;
    };
    if !host.emission_changed(&stage) && !force {
        return false;
    }

    let _ = app.emit_to(STAGE, "play-state", &stage);
    if let Some(full) = host.main_state(now_ms) {
        let _ = app.emit_to(MAIN, "play-state", &full);
    }
    true
}

/// A library row moved. Studio invalidates its TanStack Query caches off this;
/// Stage never sees it — a catalog edit cannot move an open Play (§4.3).
pub fn catalog_changed(app: &AppHandle, change: &CatalogChange) {
    let _ = app.emit_to(MAIN, "catalog-changed", change);
}

/// Several rows moved in one confirmed batch (§2.19). One event, so Studio
/// invalidates once rather than two hundred times.
pub fn catalog_changed_many(app: &AppHandle, changes: &[CatalogChange]) {
    for change in changes {
        let _ = app.emit_to(MAIN, "catalog-changed", change);
    }
}

pub fn recipe_changed(app: &AppHandle, change: &RecipeChange) {
    let _ = app.emit_to(MAIN, "recipe-changed", change);
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct MonitorsChanged<'a> {
    monitors: &'a [questiongame_host::MonitorInfo],
    /// The remembered pick, connected or not.
    stage_monitor_id: Option<&'a str>,
    /// Where the Stage window actually stands. `null` is the primary display.
    stage_on: Option<&'a str>,
}

pub fn monitors_changed(app: &AppHandle, host: &Host) {
    let _ = app.emit_to(
        MAIN,
        "monitors-changed",
        MonitorsChanged {
            monitors: host.display.monitors(),
            stage_monitor_id: host.flags.control().stage_monitor_id.as_deref(),
            stage_on: host.display.current().map(|k| k.as_str()),
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
