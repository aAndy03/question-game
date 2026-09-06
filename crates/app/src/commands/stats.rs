//! Statistics (§11.K, P11) — one read command, and no way to spell a write.
//!
//! The whole family is this file, because Statistics is a projector: it asks
//! one question of the logs and draws the answer. There is no `stats_set_*`
//! to forget to guard, and the frontend's exit criterion ("Statistics issues
//! no writing command at all") is a property of this surface, not of a
//! reviewer's diligence.

use tauri::{State, WebviewWindow};

use questiongame_host::stats::{StatsQuery, StatsResult};

use crate::error::AppResult;
use crate::guard;
use crate::state::AppState;

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
