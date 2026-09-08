//! Statistics (§11.K, P11) — one read, and one window the operator opens.
//!
//! Statistics is a projector: `stats_query` asks one question of the logs and
//! draws the answer. There is no `stats_set_*` to forget to guard, and the
//! frontend's exit criterion ("Statistics issues no writing command at all")
//! is a property of this surface, not of a reviewer's diligence.
//!
//! `stats_window` writes nothing either — it opens or closes a window of
//! numbers. It exists because **the host must never decide to put something on
//! a display**: remembering `stats.monitor_id` says where Statistics would go,
//! and only this command makes it appear (revised 2026-09-07, the same rule §9
//! already holds Stage to).

use tauri::{AppHandle, State, WebviewWindow};

use questiongame_host::MonitorKey;
use questiongame_host::stats::{StatsQuery, StatsResult};

use crate::error::AppResult;
use crate::state::AppState;
use crate::{emit, guard, windows};

/// `stats_query` — the Live view, the All-data table, the entity cards and
/// every chart, from one document (§11.K).
///
/// `(async)` because it reads Play logs off the disk. It takes the same lock
/// as every other command, so a query can never see half a write.
#[tauri::command(async)]
pub fn stats_query(
    window: WebviewWindow,
    state: State<'_, AppState>,
    query: StatsQuery,
) -> AppResult<StatsResult> {
    guard::allow(window.label(), "stats_query")?;
    let host = state.lock();
    Ok(host.catalog.stats_query(&query)?)
}

/// `stats_window` — show or hide the Statistics window (§11.K, §13.3).
///
/// Studio only: the window itself may read, never open or close anything.
///
/// The lock is taken to read the remembered display and released **before** a
/// window is touched: building a webview pumps the message loop, and the new
/// window invokes as soon as it loads — with the lock still held it would wait
/// on the command that created it, which is what left it white and frozen.
#[tauri::command(async)]
pub fn stats_window(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    open: bool,
) -> AppResult<()> {
    guard::allow(window.label(), "stats_window")?;
    let (key, fullscreen) = {
        let host = state.lock();
        let control = host.flags.control();
        (
            control.stats_monitor_id.clone().map(MonitorKey::new),
            control.stats_fullscreen,
        )
    };

    if open {
        windows::open_stats(&app, key.as_ref(), fullscreen)?;
    } else {
        windows::close_stats(&app)?;
    }

    // The button says "Show" or "Close", and it reads the answer from here.
    // Asked before the lock: the window map is what the window work just
    // changed, and nothing that touches a window belongs under the guard.
    let stats_open = windows::stats_is_open(&app);
    let host = state.lock();
    emit::monitors_changed(&app, &host, stats_open);
    Ok(())
}
