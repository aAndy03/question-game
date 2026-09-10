//! The real end of the monitor seam: Tauri's display list, converted to the
//! shape [`questiongame_host::monitor`] reasons about.
//!
//! Two conversions happen here and nowhere else:
//!
//! - **Physical → logical pixels.** Tauri reports a `Monitor` in physical
//!   pixels. Both numbers go through: logical is what a window is *placed* in
//!   and what a fullscreen webview gets as its CSS viewport; physical is the
//!   mode the panel is actually running and what the operator is *shown* (§7).
//!   A 1080p TV at Windows' default 150% is 1920×1080 physical and 1280×720
//!   logical, and reporting only the latter told the operator their 1080p TV
//!   was 720p — while Stage, laying out a fixed 1920×1080 canvas into a
//!   1280×720 CSS viewport, drew 44% of it.
//! - **A `Monitor` → a [`MonitorKey`].** Neither OS hands out a serial number
//!   through Tauri, so the key is the name plus the **physical** resolution —
//!   a mode, not a preference, so changing the display's scaling no longer
//!   loses Stage's remembered pick. See `monitor.rs` for the rest.
//!
//! The fake end of the seam is a `Vec<MonitorInfo>` literal in the host's own
//! tests — which is why the unplug path is testable without a second display.

use questiongame_host::{MonitorInfo, MonitorKey};
use tauri::{AppHandle, Monitor, PhysicalPosition};

/// One Tauri `Monitor`, in the shape the host reasons about.
///
/// The single conversion point: [`list`] and [`physical_origin`] both go
/// through it, so the key rule and the physical/logical split are spelled once.
fn info(monitor: &Monitor, primary: Option<&(Option<String>, PhysicalPosition<i32>)>) -> MonitorInfo {
    let scale = monitor.scale_factor();
    let physical = *monitor.size();
    let size = physical.to_logical::<u32>(scale);
    let position = monitor.position().to_logical::<i32>(scale);
    let name = monitor.name().cloned();
    MonitorInfo {
        key: MonitorKey::derive(name.as_deref(), physical.width, physical.height),
        primary: primary.is_some_and(|(pname, ppos)| *pname == name && ppos == monitor.position()),
        name,
        position: (position.x, position.y),
        size: (size.width, size.height),
        physical_size: (physical.width, physical.height),
        scale_factor: scale,
    }
}

/// The connected displays, primary first-class rather than positional.
pub fn list(app: &AppHandle) -> Vec<MonitorInfo> {
    crate::state::assert_unlocked("monitors::list");
    let primary = app
        .primary_monitor()
        .ok()
        .flatten()
        .map(|m| (m.name().cloned(), *m.position()));

    app.available_monitors()
        .unwrap_or_default()
        .iter()
        .map(|monitor| info(monitor, primary.as_ref()))
        .collect()
}

/// The physical top-left corner of a display, which is what a window position
/// has to be set in. [`list`] reports logical pixels too; moving a window needs
/// the untranslated ones back.
///
/// Resolved through [`MonitorInfo::matches`] rather than a bare key comparison,
/// so a `stage.monitor_id` written when keys were derived from logical pixels
/// still finds its display.
pub fn physical_origin(app: &AppHandle, key: &MonitorKey) -> Option<PhysicalPosition<i32>> {
    crate::state::assert_unlocked("monitors::physical_origin");
    app.available_monitors()
        .ok()?
        .into_iter()
        .find_map(|m| info(&m, None).matches(key).then(|| *m.position()))
}
