//! `PresentationService` — the screen, the overlay queue, the reveals, and
//! where the Stage window stands (§13).
//!
//! The reveal commands go through `PresentationService`, which delegates to
//! `MatchService`. That is one hop more than calling `MatchService` directly,
//! and it is the hop that makes "reveals are Play state" true by construction
//! rather than by everyone remembering.
//!
//! Two commands here accept a call from the `stage` webview, and both are Stage
//! reporting on itself: `stage_ready` and `overlay_ack_complete`. The latter
//! carries **every** `AnimKey`, not only overlay ones — Stage reports each
//! timeline it plays, an overlay key retires the running overlay, and an
//! auto-mode channel chains its next beat off whatever finished (§4.2, §11.G).

use questiongame_host::{MonitorKey, Notice, OverlayRequest, Severity, StageScreen};
use tauri::{AppHandle, State, WebviewWindow};

use super::play_write;
use crate::error::AppResult;
use crate::state::{AppState, now_ms};
use crate::{emit, guard, windows};

/// `show_screen`. Any screen, any time, once the Play has started (§5.6); only
/// Idle before that.
#[tauri::command(async)]
pub fn show_screen(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    screen: StageScreen,
) -> AppResult<()> {
    guard::allow(window.label(), "show_screen")?;
    let now = now_ms();
    let mut host = state.lock();
    let status = host.play.get_state().map(|p| p.status());
    host.presentation.show_screen(screen, status)?;
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

/// `show_overlay` — the operator calling an overlay by hand, over whatever
/// screen is up. The same enqueue the automatic path uses; Stage cannot tell
/// them apart (§5.6).
#[tauri::command(async)]
pub fn show_overlay(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    overlay: OverlayRequest,
) -> AppResult<()> {
    guard::allow(window.label(), "show_overlay")?;
    let now = now_ms();
    let mut host = state.lock();
    let enabled = host.overlays_enabled();
    host.presentation.show_overlay(overlay, enabled);
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

/// Stage finished a timeline (§11.G). One of the two commands Stage may call.
///
/// `(async)` because an auto-mode chain appends a reveal to the Play, and an
/// append persists.
#[tauri::command(async)]
pub fn overlay_ack_complete(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    key: String,
) -> AppResult<()> {
    guard::allow(window.label(), "overlay_ack_complete")?;
    let now = now_ms();
    let mut host = state.lock();

    host.write(now, |h| {
        let modes = h.flags.reveal_modes();
        // Split borrow: `PresentationService` writes reveals *through*
        // `MatchService`, so it needs both halves of `Host` at once.
        let (presentation, play) = (&mut h.presentation, &mut h.play);
        presentation.anim_complete(&key, play, modes, now)?;
        Ok(())
    })?;

    emit::anim_complete(&app, &key);
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

/// Stage has mounted and is listening. The other command Stage may call, and
/// it writes nothing: it says which contract version this webview was built
/// against and asks for the current state.
///
/// It exists because the emission is deduplicated — a Stage window that mounts
/// after the host's last emission would otherwise wait for the next *change*,
/// and on an idle Play there may not be one.
///
/// The version it carries is what turns a contract mismatch into a §14 notice
/// on the operator's screen instead of a blank one on the audience's (the P1
/// exit criterion). Stage shows no notices; it can only report.
#[tauri::command(async)]
pub fn stage_ready(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    contract_version: u32,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_ready")?;
    if contract_version != questiongame_host::stage::CONTRACT_VERSION {
        emit::notice(
            &app,
            &Notice::new("stage.contract_mismatch", Severity::Error, &["reinstall"])
                .with("stage", contract_version.to_string())
                .with(
                    "host",
                    questiongame_host::stage::CONTRACT_VERSION.to_string(),
                ),
        );
    }
    let now = now_ms();
    {
        let mut host = state.lock();
        host.health.stage_ready(contract_version);
        emit::play_state(&app, &mut host, now, true);
    }
    crate::tick::health_once(&app);
    Ok(())
}

/// Stage reporting a fault on itself — a cue file that would not load. Stage
/// shows no notice (§5.7); the fact becomes a health item the operator sees in
/// Studio. An unknown code or cue is ignored: Stage is a projection and cannot
/// be allowed to invent findings.
#[tauri::command(async)]
pub fn stage_report(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    code: String,
    detail: Option<std::collections::BTreeMap<String, String>>,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_report")?;
    let detail = detail.unwrap_or_default();
    let cue = detail.get("cue").and_then(|c| {
        questiongame_host::CueKey::ALL
            .into_iter()
            .find(|k| k.as_str() == c)
    });
    if let Some(cue) = cue {
        match code.as_str() {
            "audio_missing_cue" => {
                let file = detail.get("file").cloned().unwrap_or_default();
                state.lock().health.missing_cue(cue, file);
            }
            // A playback fault. Still reported as a cue finding: the operator's
            // remedy is the same and there is only one cue notice. That it
            // reads as "missing" when the file is present is a wording bug,
            // left alone here rather than widened into a new notice code.
            "audio_failed" => {
                let file = detail.get("file").cloned().unwrap_or_default();
                state.lock().health.missing_cue(cue, file);
            }
            // It loaded after all. Every input needs a way back.
            "audio_ok" => state.lock().health.cue_ok(cue),
            _ => {}
        }
    }
    crate::tick::health_once(&app);
    Ok(())
}

#[tauri::command(async)]
pub fn reveal_stem(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "reveal_stem", |h, now| {
        Ok(h.presentation.reveal_stem(&mut h.play, now)?)
    })
}

#[tauri::command(async)]
pub fn reveal_next_option(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    play_write(&window, &app, &state, "reveal_next_option", |h, now| {
        Ok(h.presentation.reveal_next_option(&mut h.play, now)?)
    })
}

/// FinalLeaderboard, one rank at a time, lowest place first (§5.5).
#[tauri::command(async)]
pub fn reveal_leaderboard_rank(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    rank: u32,
) -> AppResult<()> {
    play_write(
        &window,
        &app,
        &state,
        "reveal_leaderboard_rank",
        |h, now| {
            Ok(h.presentation
                .reveal_leaderboard_rank(&mut h.play, rank, now)?)
        },
    )
}

// ------------------------------------------------------------------- monitors

/// The connected displays, for Control's top picker and Settings ▸ Monitors.
#[tauri::command(async)]
pub fn monitors_list(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Vec<questiongame_host::MonitorInfo>> {
    guard::allow(window.label(), "monitors_list")?;
    // Not a bare read: resolving the list may find the remembered display back,
    // and the window has to follow that decision rather than be told about it.
    //
    // Refresh **before** taking the lock, never under it. This command is
    // synchronous, so it runs on the main thread, and moving a window there
    // pumps the message loop — which dispatches the next queued command onto
    // this same thread. If the lock were held, that command's `state.lock()`
    // would wait for a guard only this thread could release.
    windows::refresh(&app, &state)?;
    let host = state.lock();
    Ok(host.display.monitors().to_vec())
}

/// `stage_set_monitor` — the manual send (§9). `None` brings Stage back to
/// primary and forgets the pick, which is the operator saying "primary, please"
/// rather than the host guessing.
#[tauri::command(async)]
pub fn stage_set_monitor(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    monitor_id: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_set_monitor")?;

    // Refresh first: the picker may be a few seconds stale, and sending Stage
    // to a display that just left should say so rather than remember a wish.
    // Before the lock, because refreshing touches windows.
    windows::refresh(&app, &state)?;

    // The decision under the lock; the window work after it. `ensure_stage`
    // *creates* a webview, which pumps the message loop and lets the new
    // window invoke before this returns — with the lock held that is a wait
    // on ourselves.
    let mv = {
        let mut host = state.lock();
        let key = monitor_id.clone().map(MonitorKey::new);
        let mv = host.display.set_monitor(key)?;

        let ctx = host.runtime();
        host.flags.settings_set_global(
            questiongame_host::flags::GlobalSetting::StageMonitorId(monitor_id),
            ctx,
        )?;
        let globals = host.flags.globals().clone();
        host.catalog.settings_store(&globals)?;
        mv
    };

    windows::ensure_stage(&app)?;
    windows::apply(&app, &mv)?;
    let stats_open = windows::stats_is_open(&app);
    let host = state.lock();
    emit::monitors_changed(&app, &host, stats_open);
    Ok(())
}

/// Create the Stage window without loading a recipe — the operator wanting to
/// see the Idle screen on the projector before the show starts. Idempotent.
#[tauri::command(async)]
pub fn stage_open(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<()> {
    guard::allow(window.label(), "stage_open")?;
    windows::ensure_stage(&app)?;
    let now = now_ms();
    let mut host = state.lock();
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}
