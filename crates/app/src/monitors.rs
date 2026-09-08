//! The real end of the monitor seam: Tauri's display list, converted to the
//! shape [`questiongame_host::monitor`] reasons about.
//!
//! Two conversions happen here and nowhere else:
//!
//! - **Physical → logical pixels.** Tauri reports a `Monitor` in physical
//!   pixels; a 4K panel at 200% is 3840 wide and 1920 logical, and the number
//!   the operator recognises in a picker is the logical one (§7).
//! - **A `Monitor` → a [`MonitorKey`].** Neither OS hands out a serial number
//!   through Tauri, so the key is the name plus the resolution. See
//!   `monitor.rs` for what that does and does not survive.
//!
//! The fake end of the seam is a `Vec<MonitorInfo>` literal in the host's own
//! tests — which is why the unplug path is testable without a second display.

use questiongame_host::{MonitorInfo, MonitorKey};
use tauri::AppHandle;

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
        .into_iter()
        .map(|monitor| {
            let scale = monitor.scale_factor();
            let size = monitor.size().to_logical::<u32>(scale);
            let position = monitor.position().to_logical::<i32>(scale);
            let name = monitor.name().cloned();
            MonitorInfo {
                key: MonitorKey::derive(name.as_deref(), size.width, size.height),
                primary: primary
                    .as_ref()
                    .is_some_and(|(pname, ppos)| *pname == name && ppos == monitor.position()),
                name,
                position: (position.x, position.y),
                size: (size.width, size.height),
                scale_factor: scale,
            }
        })
        .collect()
}

/// The physical top-left corner of a display, which is what a window position
/// has to be set in. `list` reports logical pixels for the operator's sake;
/// moving a window needs the untranslated ones back.
pub fn physical_origin(app: &AppHandle, key: &MonitorKey) -> Option<tauri::PhysicalPosition<i32>> {
    crate::state::assert_unlocked("monitors::physical_origin");
    app.available_monitors().ok()?.into_iter().find_map(|m| {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<u32>(scale);
        let name = m.name().cloned();
        (MonitorKey::derive(name.as_deref(), size.width, size.height) == *key)
            .then(|| *m.position())
    })
}
