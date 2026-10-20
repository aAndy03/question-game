//! The §13 command surface, as `#[tauri::command]`.
//!
//! One file per service, mirroring `COMMAND_GROUPS` in
//! `packages/contract/src/commands.ts`. Nothing here holds state or decides a
//! rule: a command is a guard, a clock reading, a call into `crates/host`, and
//! an emission. When one of these functions starts branching on game state,
//! the branch belongs in the host.
//!
//! # Threading
//!
//! Tauri runs a plain `#[tauri::command]` **on the main thread**; only
//! `#[tauri::command(async)]` (or an `async fn`) moves it off. So:
//!
//! - **Everything that can reach the database is `(async)`.** `play_persist`
//!   is a ~2.5 ms fsync (WAL + `synchronous = FULL`) and it runs after every
//!   command that appends an event, and `CatalogService` is disk by definition.
//!   Two and a half milliseconds on the UI thread is a dropped frame for no
//!   reason.
//! - **Pure reads stay synchronous.** `get_state` and `settings_get` are a
//!   projection and a struct copy; hopping to the runtime would cost more than
//!   the work.
//!
//! The 100ms tick is neither: it reads `stage::project` and touches no disk
//! unless the T=0 table fires, so the show loop never waits on an fsync.
//!
//! # The write path
//!
//! Every Play write goes through [`play_write`], which does the three things
//! that always follow one: let `PresentationService` see the cause, persist if
//! the log grew, and emit. A command that skips it would be a second writer in
//! all but name.

pub mod app;
pub mod beta;
pub mod catalog;
pub mod flags;
pub mod groups;
pub mod play;
pub mod presentation;
pub mod stats;
pub mod workspace;

use tauri::{AppHandle, State, WebviewWindow};

use crate::error::AppResult;
use crate::state::{AppState, Host, now_ms};
use crate::{emit, guard};

/// Guard, clock, lock, write, emit — the shape of every Play command.
fn play_write<T>(
    window: &WebviewWindow,
    app: &AppHandle,
    state: &State<'_, AppState>,
    command: &'static str,
    body: impl FnOnce(&mut Host, u64) -> AppResult<T>,
) -> AppResult<T> {
    guard::allow(window.label(), command)?;
    let now = now_ms();
    let mut host = state.lock();
    let out = host.write(now, |h| body(h, now))?;
    emit::play_state(app, &mut host, now, true);
    Ok(out)
}

/// A catalog write: guard, clock, lock, write, emit `catalog-changed`. No Play
/// is touched, and an open Play's snapshot does not move (§4.3).
fn catalog_write<T>(
    window: &WebviewWindow,
    state: &State<'_, AppState>,
    command: &'static str,
    body: impl FnOnce(&Host, u64) -> AppResult<T>,
) -> AppResult<T> {
    guard::allow(window.label(), command)?;
    let now = now_ms();
    let host = state.lock();
    body(&host, now)
}
