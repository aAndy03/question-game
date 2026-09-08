//! The 100ms host tick, and the monitor watch.
//!
//! # The show loop
//!
//! The host is authoritative about time (§2.4): the countdown Stage draws is
//! `remaining_ms` from here, and no frontend clock may pass host zero. So this
//! runs at 100ms and **reads** `stage::project`.
//!
//! It is not a writer. `MatchService::tick` appends only when the T=0 table
//! fires, and it appends *at the computed zero instant*, so a late tick scores
//! exactly what a punctual one would. Every other tick appends nothing, the
//! log does not grow, and `Host::write` skips the fsync — which is how the show
//! loop stays off the disk.
//!
//! It also emits only when the emission changed, so an idle Play and a paused
//! one cost nothing on the wire.
//!
//! # The monitor watch
//!
//! Tauri has no cross-platform display-change event, so the list is polled — at
//! one second, not ten times a second: a cable is a human-scale event and
//! `available_monitors` is a syscall, not a projection.

use std::time::Duration;

use tauri::AppHandle;
use tauri::async_runtime;

use crate::state::{AppState, now_ms};
use crate::{emit, windows};

/// §2.4: the host emits `remaining_ms` every 100ms.
const TICK: Duration = Duration::from_millis(100);
/// A cable is a human-scale event.
const MONITOR_POLL: Duration = Duration::from_secs(1);

/// §12.6: health is a human-scale concern too. Thirty seconds between reports;
/// a failed save and a Stage report re-run it at once through [`health_once`].
const HEALTH_POLL: Duration = Duration::from_secs(30);

pub fn spawn(app: AppHandle) {
    spawn_show_loop(app.clone());
    spawn_monitor_watch(app.clone());
    spawn_health_watch(app);
}

/// Compute the health report now and emit it if it changed. Called at boot,
/// by the 30 s watch, and by the commands that change an input.
pub fn health_once(app: &AppHandle) {
    let state: tauri::State<'_, AppState> = tauri::Manager::state(app);
    let free = crate::state::user_data_dir(app)
        .ok()
        .and_then(|dir| fs4::available_space(&dir).ok());
    let stage_exists = tauri::Manager::get_webview_window(app, crate::guard::STAGE).is_some();
    let mut host = state.lock();
    let (report, changed) = host.health.report(stage_exists, free);
    if changed {
        emit::health(app, &report);
    }
}

fn spawn_health_watch(app: AppHandle) {
    async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(HEALTH_POLL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            health_once(&app);
        }
    });
}

fn spawn_show_loop(app: AppHandle) {
    async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(TICK);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let now = now_ms();
            let state: tauri::State<'_, AppState> = tauri::Manager::state(&app);
            let mut host = state.lock();
            if host.play.get_state().is_none() {
                continue;
            }
            if let Err(error) = host.write(now, |h| Ok(h.play.tick(now)?)) {
                // A tick cannot be refused by a rule; if it failed, the write
                // behind it did, and the operator has to hear about it.
                tracing::error!(%error, "tick");
                drop(host);
                health_once(&app);
                continue;
            }
            emit::play_state(&app, &mut host, now, false);
        }
    });
}

fn spawn_monitor_watch(app: AppHandle) {
    async_runtime::spawn(async move {
        let mut ticker = tokio::time::interval(MONITOR_POLL);
        ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            ticker.tick().await;
            let list = crate::monitors::list(&app);
            let state: tauri::State<'_, AppState> = tauri::Manager::state(&app);
            // The guard ends with the `if`: `windows::refresh` must be called
            // with the lock free, because everything it does to a window pumps
            // the message loop and can re-enter a synchronous command that
            // wants this very lock.
            if state.lock().display.monitors() == list.as_slice() {
                continue;
            }
            // §9: the window moves, the Play does not. Nothing on this path can
            // reach a Play, and the notice is what the operator sees instead.
            if let Err(error) = windows::refresh(&app, &state) {
                tracing::error!(%error, "handling a display change");
            }
        }
    });
}
