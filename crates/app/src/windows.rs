//! The webviews, and where each one stands.
//!
//! ```text
//! main   Studio. Created at boot, a normal window.
//! stage  Fullscreen, undecorated, audience-facing. Created on **first Control
//!        Load**, not at boot (§9) — there is nothing to show before a recipe
//!        is in Control, and an empty black fullscreen window on the projector
//!        while the operator is still picking a game is worse than no window.
//! stats  Optional, off unless the operator picks a display (§11.K, P11).
//!        **Studio's Statistics page, in a window of its own** — same bundle,
//!        same tokens, `?stats` on the URL — so it can never become a second
//!        Stage. `guard::STATS_COMMANDS` is what it may ask for: reads.
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
use crate::guard::{MAIN, STAGE, STATS};
use crate::monitors;

/// The two frontends, at the path each occupies under `frontendDist` — and,
/// because both Vite configs set a matching `base`, under `devUrl` too.
const STUDIO_PATH: &str = "studio/index.html";
const STAGE_PATH: &str = "stage/index.html";
/// Studio again, told by its query string to render Statistics alone.
const STATS_PATH: &str = "studio/index.html?stats";
/// A **mirror** of the Stage window: the same bundle, told it is a mirror.
///
/// `?mirror` rather than reading the label at runtime, the way `?viewer`
/// already works: a webview then knows what it is **synchronously**, on its
/// first render, with no async label fetch to sequence against mounting the
/// audio. Mounting Howler and unmounting it a tick later is exactly the shape
/// P11.8 was about.
const MIRROR_PATH: &str = "stage/index.html?mirror";

/// Studio. A normal window: one display is a valid configuration, and then
/// Studio is an Alt-Tab away from a fullscreen Stage (§9).
pub fn open_studio(app: &AppHandle) -> AppResult<WebviewWindow> {
    crate::state::assert_unlocked("windows::open_studio");
    if let Some(existing) = app.get_webview_window(MAIN) {
        return Ok(existing);
    }
    Ok(debuggable(
        WebviewWindowBuilder::new(app, MAIN, WebviewUrl::App(STUDIO_PATH.into()))
            .title("questiongame Studio")
            .inner_size(1440.0, 920.0)
            .min_inner_size(1100.0, 720.0),
    )
    .build()?)
}

/// The switches wry hands WebView2 when nobody else does — the "mini menu"
/// and SmartScreen off. Passing our own replaces them, so they are repeated.
#[cfg(windows)]
const WRY_DEFAULT_BROWSER_ARGS: &str =
    "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection";

/// Debug builds only: let a debugger reach the webview **from outside**.
///
/// A webview that has stopped responding cannot be inspected from inside it —
/// the context menu is drawn by the page that is hung — and the log can only
/// say which step did not return, not where inside it. With
/// `--remote-debugging-port`, `scripts/js-stack.mjs` attaches over the Chrome
/// DevTools Protocol, interrupts the busy thread, and prints the JavaScript
/// stack it was on. That is the difference between a night of bisecting and
/// one look. It goes through the builder rather than
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` because wry sets
/// `AdditionalBrowserArguments` itself, and the option is what the browser
/// process reads. All webviews share one browser process, so the first window
/// built decides; every window says it anyway. Release builds add nothing: an
/// open debug port on a shipped app is a hole, not a feature.
/// `QUESTIONGAME_DEBUG_PORT` overrides the port (default 9222).
fn debuggable<'a>(
    builder: WebviewWindowBuilder<'a, tauri::Wry, AppHandle>,
) -> WebviewWindowBuilder<'a, tauri::Wry, AppHandle> {
    #[cfg(all(windows, debug_assertions))]
    {
        let port = std::env::var("QUESTIONGAME_DEBUG_PORT").unwrap_or_else(|_| "9222".into());
        let args = format!("{WRY_DEFAULT_BROWSER_ARGS} --remote-debugging-port={port}");
        return builder.additional_browser_args(&args);
    }
    #[allow(unreachable_code)]
    builder
}

/// Stage, ready. Created on first Control Load and then left alone: it sits
/// fullscreen on the primary display and waits until the operator sends it
/// somewhere (§9 — the host never picks a display).
pub fn ensure_stage(app: &AppHandle) -> AppResult<WebviewWindow> {
    crate::state::assert_unlocked("windows::ensure_stage");
    if let Some(existing) = app.get_webview_window(STAGE) {
        return Ok(existing);
    }
    let window = debuggable(
        WebviewWindowBuilder::new(app, STAGE, WebviewUrl::App(STAGE_PATH.into()))
            .title("questiongame Stage")
            .decorations(false)
            .fullscreen(true)
            // Nobody clicks Stage; a focus steal mid-question is a lost lock.
            .focused(false),
    )
    .build()?;
    Ok(window)
}

/// The label of the n-th mirror. Positional, starting at 2, so the pacer keeps
/// the bare `stage` label that `emit`, `guard`, the capabilities file and every
/// doc name.
pub fn mirror_label(index: usize) -> String {
    format!("stage-{}", index + 2)
}

/// Make the mirror windows match `wanted` — [`StageDisplay::live_mirrors`],
/// the connected displays that should carry one right now (§9, P11.11).
///
/// **Idempotent by construction:** it opens what is missing, moves what is in
/// the wrong place, and closes anything past the end of the list. Calling it
/// twice changes nothing the second time, which is what lets the monitor watch
/// call it on every display change without tracking what it did last time.
///
/// **The caller must not hold the host lock.** Building and moving a webview
/// pumps the Windows message loop, and that dispatches whatever IPC the new
/// window has already queued — with the lock held, that is a wait on ourselves
/// (2026-09-08). `assert_unlocked` makes the mistake a panic naming this
/// function rather than a hang.
pub fn reconcile_mirrors(app: &AppHandle, wanted: &[MonitorKey]) -> AppResult<()> {
    crate::state::assert_unlocked("windows::reconcile_mirrors");

    for (index, key) in wanted.iter().enumerate() {
        let label = mirror_label(index);
        let window = match app.get_webview_window(&label) {
            Some(existing) => existing,
            None => debuggable(
                WebviewWindowBuilder::new(app, &label, WebviewUrl::App(MIRROR_PATH.into()))
                    .title("questiongame Stage")
                    .decorations(false)
                    .fullscreen(true)
                    // Nobody clicks a mirror either, and a focus steal
                    // mid-question is a lost lock.
                    .focused(false),
            )
            .build()?,
        };
        move_to(app, &window, Some(key))?;
    }

    // Anything past the end is a mirror the operator removed, or one whose
    // display went away. Closing from the end down keeps the labels dense, so
    // `wanted[i]` is always `stage-(i+2)`.
    let mut index = wanted.len();
    while let Some(extra) = app.get_webview_window(&mirror_label(index)) {
        extra.close()?;
        index += 1;
    }
    Ok(())
}

/// Open the Statistics window, on the remembered display (§11.K, P11).
///
/// **Only the operator calls this.** Nothing in the host opens this window:
/// not a setting, not a display coming back, not the monitor watch. Choosing a
/// display says *where* it would go; `stats_window` is what makes it appear,
/// and closing it — by the button or by the window's own close box — means it
/// stays closed (revised 2026-09-07).
///
/// Fullscreen is the operator's choice (`stats.fullscreen`): right on a wall
/// display, wrong on the single display a laptop has, where it would bury
/// Studio behind a screen of numbers.
///
/// **The caller must not hold the host lock.** Building a webview pumps the
/// Windows message loop, and the new window's first act is to `invoke` — which
/// wants the same lock. That is what left the window white and unresponsive
/// when it was built inside `monitors_list`.
pub fn open_stats(app: &AppHandle, key: Option<&MonitorKey>, fullscreen: bool) -> AppResult<()> {
    crate::state::assert_unlocked("windows::open_stats");
    let origin = match key {
        Some(k) => monitors::physical_origin(app, k),
        None => app.primary_monitor()?.map(|m| *m.position()),
    };

    if let Some(window) = app.get_webview_window(STATS) {
        // Already there: place it again, because the operator may have picked
        // another display since, and raise it — pressing Show on a window
        // hiding behind Studio should bring it forward.
        place(&window, origin, fullscreen)?;
        window.set_focus()?;
        return Ok(());
    }

    // Built at its destination rather than moved there afterwards: a window
    // that is created centred and then thrown across the desktop flashes on
    // the wrong display first.
    let mut builder = debuggable(
        WebviewWindowBuilder::new(app, STATS, WebviewUrl::App(STATS_PATH.into()))
            .title("questiongame Statistics")
            .inner_size(1280.0, 800.0)
            .focused(false),
    );
    if let Some(origin) = origin {
        builder = builder.position(f64::from(origin.x), f64::from(origin.y));
    }
    let window = builder.build()?;
    if fullscreen {
        window.set_fullscreen(true)?;
    }
    Ok(())
}

/// Close the Statistics window if it is open. Closing it changes nothing about
/// the Play — there is nothing on the other side of it but numbers.
pub fn close_stats(app: &AppHandle) -> AppResult<()> {
    crate::state::assert_unlocked("windows::close_stats");
    if let Some(window) = app.get_webview_window(STATS) {
        window.close()?;
    }
    Ok(())
}

/// Is it on screen right now? The one piece of Statistics-window state, and it
/// lives where it actually is — in the window list, not in the settings
/// document. Studio reads it through `monitors_list` / `monitors-changed`.
pub fn stats_is_open(app: &AppHandle) -> bool {
    app.get_webview_window(STATS).is_some()
}

/// Move an **already open** Statistics window; never create one.
///
/// Called from the monitor watch, where creating a window would be the host
/// deciding to show something. A window whose display is gone is closed, and
/// the operator is told.
fn follow_stats(
    app: &AppHandle,
    list: &[questiongame_host::MonitorInfo],
    stats_monitor_id: Option<String>,
    fullscreen: bool,
) -> AppResult<()> {
    let Some(window) = app.get_webview_window(STATS) else {
        return Ok(());
    };
    let Some(id) = stats_monitor_id else {
        // No remembered display: it opened on primary and stays there.
        return Ok(());
    };
    let key = MonitorKey::new(id.clone());
    if list.iter().any(|m| m.matches(&key)) {
        place(&window, monitors::physical_origin(app, &key), fullscreen)?;
        return Ok(());
    }

    close_stats(app)?;
    crate::emit::notice(
        app,
        &questiongame_host::notice::Notice::new(
            "stats.monitor_lost",
            questiongame_host::notice::Severity::Warn,
            &["pick_monitor"],
        )
        .at("stats.monitor_id")
        .with("monitor", id),
    );
    Ok(())
}

/// Put a window on a display. A fullscreen window belongs to its monitor, so
/// it leaves fullscreen, moves, and goes back — the same dance Stage does.
fn place(
    window: &WebviewWindow,
    origin: Option<tauri::PhysicalPosition<i32>>,
    fullscreen: bool,
) -> AppResult<()> {
    let Some(origin) = origin else {
        tracing::warn!("statistics was sent to a display that is no longer listed");
        return Ok(());
    };
    window.set_fullscreen(false)?;
    window.set_position(origin)?;
    if fullscreen {
        window.set_fullscreen(true)?;
    }
    Ok(())
}

/// Re-read the OS display list, run the §9 policy over it, and **act on the
/// result** — move the window, raise the notice, tell `main`.
///
/// One function, because a caller that only refreshed the list would leave
/// `StageDisplay` believing Stage had moved when the window had not: the policy
/// decides and the window follows, always together.
///
/// # Read the OS, then decide, then act — and never under the lock
///
/// Every OS call in here — `available_monitors`, `primary_monitor`,
/// `set_position`, `set_fullscreen`, closing a window — pumps the platform's
/// message loop, and pumping it dispatches whatever IPC the webview has
/// queued. If that turns out to be one of the **synchronous** commands
/// (`get_state`, `settings_get`, `health_get`, `monitors_list`,
/// `catalog_seed_status`) it runs on this very thread and takes the host lock,
/// which is a plain `Mutex` and is not reentrant. Holding the lock across any
/// of these deadlocks the app against itself, with no second thread to blame:
/// the window stops repainting, stops taking input, and does not even reload.
///
/// This function therefore takes `&AppState` and not a guard, and it takes the
/// lock exactly once, for the decision, with no OS call inside it. Do not
/// "simplify" it back to a `&mut Host` parameter — the caller would then be
/// holding the lock for the whole of it, which is the bug this shape exists to
/// prevent (§9, 2026-09-08).
pub fn refresh(app: &AppHandle, state: &crate::state::AppState) -> AppResult<()> {
    let list = crate::monitors::list(app);
    let stats_open = stats_is_open(app);

    let (mv, mirrors, stats_monitor_id, stats_fullscreen) = {
        let mut host = state.lock();
        let control = host.flags.control();
        let wanted = control.stage_monitor_id.clone().map(MonitorKey::new);
        let wanted_mirrors: Vec<MonitorKey> = control
            .stage_mirror_ids
            .iter()
            .cloned()
            .map(MonitorKey::new)
            .collect();
        let reattach = control.stage_reattach;
        let stats_monitor_id = control.stats_monitor_id.clone();
        let stats_fullscreen = control.stats_fullscreen;
        let play_is_open = host.runtime().play_is_open();
        host.display.set_wanted_mirrors(wanted_mirrors);
        let mv =
            host.display
                .monitors_changed(list.clone(), wanted.as_ref(), reattach, play_is_open);
        let mirrors = host.display.live_mirrors();
        (mv, mirrors, stats_monitor_id, stats_fullscreen)
    };

    apply(app, &mv)?;
    // After `apply`, so a mirror is never opened on the display the pacer is
    // about to be moved onto.
    reconcile_mirrors(app, &mirrors)?;
    if let Some(notice) = &mv.notice {
        crate::emit::notice(app, notice);
    }

    // The Statistics window follows its own display and is never opened by
    // this path: it is on screen because the operator asked for it, and it
    // goes when its display does (§11.K).
    follow_stats(app, &list, stats_monitor_id, stats_fullscreen)?;

    {
        let host = state.lock();
        crate::emit::monitors_changed(app, &host, stats_open);
    }
    Ok(())
}

/// Carry out a [`StageMove`]. Does nothing if Stage has not been created yet —
/// the pick is remembered either way, and [`ensure_stage`] plus the next
/// monitor event will land it.
pub fn apply(app: &AppHandle, mv: &StageMove) -> AppResult<()> {
    crate::state::assert_unlocked("windows::apply");
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

#[cfg(test)]
mod tests {
    use super::*;

    /// P11 exit criterion: the Statistics window is never a second Stage. It
    /// loads Studio's bundle with `?stats`, so it has Studio's tokens, Studio's
    /// chrome and no screen at all — and `guard::STATS_COMMANDS` keeps it from
    /// asking for anything but reads.
    /// The host never decides to put something on a display (§9, §11.K). The
    /// monitor watch may *follow* the Statistics window and close it when its
    /// display goes, but opening one is `stats_window`'s alone — a display
    /// coming back must not raise a window the operator closed.
    #[test]
    fn nothing_but_the_command_opens_the_statistics_window() {
        const SOURCE: &str = include_str!("windows.rs");
        let refresh = SOURCE
            .split_once("pub fn refresh(")
            .expect("refresh exists")
            .1;
        let refresh = refresh
            .split_once(
                "
/// ",
            )
            .map_or(refresh, |(body, _)| body);
        assert!(
            !refresh.contains("open_stats"),
            "the monitor watch opened a window"
        );
        assert!(
            refresh.contains("follow_stats"),
            "it should still follow one"
        );
    }

    #[test]
    fn the_statistics_window_is_studio_not_stage() {
        assert!(STATS_PATH.starts_with("studio/"), "{STATS_PATH}");
        assert!(STATS_PATH.ends_with("?stats"), "{STATS_PATH}");
        assert_ne!(STATS_PATH, STAGE_PATH);
        assert!(!crate::guard::stats_may_call("show_screen"));
        assert!(!crate::guard::stats_may_call("overlay_ack_complete"));
    }
}
