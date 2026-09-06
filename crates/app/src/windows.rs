//! The two webviews, and where the Stage one stands.
//!
//! ```text
//! main   Studio. Created at boot, a normal window.
//! stage  Fullscreen, undecorated, audience-facing. Created on **first Control
//!        Load**, not at boot (§9) — there is nothing to show before a recipe
//!        is in Control, and an empty black fullscreen window on the projector
//!        while the operator is still picking a game is worse than no window.
//! ```
//!
//! Both are created from Rust rather than declared in `tauri.conf.json`,
//! because Stage's existence depends on a Play, not on boot. Both use
//! `WebviewUrl::App`, which resolves against `devUrl` in dev and
//! `frontendDist` in the bundle — **there is no dev/prod branch here**, and
//! that is deliberate: a webview pointed at an *external* URL is `remote` to
//! Tauri's ACL even when it is `localhost`, and a remote webview is denied
//! every command and `event.listen`. The two Vite configs serve each app under
//! the same path it occupies in the bundle so that one URL works in both.
//!
//! Moving Stage between displays is a three-step dance, not a `set_position`:
//! a fullscreen window keeps its monitor, so it has to leave fullscreen, move,
//! and go back.

use questiongame_host::{MonitorKey, StageMove};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

use crate::error::AppResult;
use crate::guard::{MAIN, STAGE};
use crate::monitors;

/// The two frontends, at the path each occupies under `frontendDist` — and,
/// because both Vite configs set a matching `base`, under `devUrl` too.
const STUDIO_PATH: &str = "studio/index.html";
const STAGE_PATH: &str = "stage/index.html";

/// Studio. A normal window: one display is a valid configuration, and then
/// Studio is an Alt-Tab away from a fullscreen Stage (§9).
pub fn open_studio(app: &AppHandle) -> AppResult<WebviewWindow> {
    if let Some(existing) = app.get_webview_window(MAIN) {
        return Ok(existing);
    }
    Ok(
        WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App(STUDIO_PATH.into()))
            .title("questiongame Studio")
            .inner_size(1440.0, 920.0)
            .min_inner_size(1100.0, 720.0)
            .build()?,
    )
}

/// Stage, ready. Created on first Control Load and then left alone: it sits
/// fullscreen on the primary display and waits until the operator sends it
/// somewhere (§9 — the host never picks a display).
pub fn ensure_stage(app: &AppHandle) -> AppResult<WebviewWindow> {
    if let Some(existing) = app.get_webview_window(STAGE) {
        return Ok(existing);
    }
    let window = WebviewWindowBuilder::new(app, STAGE, WebviewUrl::App(STAGE_PATH.into()))
        .title("questiongame Stage")
        .decorations(false)
        .fullscreen(true)
        // Nobody clicks Stage; a focus steal mid-question is a lost lock.
        .focused(false)
        .build()?;
    Ok(window)
}

/// Re-read the OS display list, run the §9 policy over it, and **act on the
/// result** — move the window, raise the notice, tell `main`.
///
/// One function, because a caller that only refreshed the list would leave
/// `StageDisplay` believing Stage had moved when the window had not: the policy
/// decides and the window follows, always together.
pub fn refresh(app: &AppHandle, host: &mut crate::state::Host) -> AppResult<()> {
    let list = crate::monitors::list(app);
    let control = host.flags.control();
    let wanted = control.stage_monitor_id.clone().map(MonitorKey::new);
    let reattach = control.stage_reattach;
    let play_is_open = host.runtime().play_is_open();

    let mv = host
        .display
        .monitors_changed(list, wanted.as_ref(), reattach, play_is_open);

    apply(app, &mv)?;
    if let Some(notice) = &mv.notice {
        crate::emit::notice(app, notice);
    }

    crate::emit::monitors_changed(app, host);
    Ok(())
}

/// Carry out a [`StageMove`]. Does nothing if Stage has not been created yet —
/// the pick is remembered either way, and [`ensure_stage`] plus the next
/// monitor event will land it.
pub fn apply(app: &AppHandle, mv: &StageMove) -> AppResult<()> {
    let Some(target) = mv.to.as_ref() else {
        return Ok(());
    };
    let Some(window) = app.get_webview_window(STAGE) else {
        return Ok(());
    };
    move_to(app, &window, target.as_ref())
}

/// `None` is the primary display.
fn move_to(app: &AppHandle, window: &WebviewWindow, target: Option<&MonitorKey>) -> AppResult<()> {
    let origin = match target {
        Some(key) => monitors::physical_origin(app, key),
        None => app.primary_monitor()?.map(|m| *m.position()),
    };
    let Some(origin) = origin else {
        tracing::warn!("stage was sent to a display that is no longer listed");
        return Ok(());
    };

    // A fullscreen window belongs to its monitor: it has to come out, move,
    // and go back, in that order.
    window.set_fullscreen(false)?;
    window.set_position(origin)?;
    window.set_fullscreen(true)?;
    Ok(())
}

