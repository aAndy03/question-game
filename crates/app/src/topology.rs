//! The display **topology**: what the OS knows about connected panels beyond
//! the list of displays it is drawing on.
//!
//! Tauri's `available_monitors` answers one question — which displays can a
//! window be placed on — and it is the right answer for that. It is the wrong
//! list to show an operator who has just plugged a recorder in, for two
//! reasons that both surfaced on 2026-09-11 with an Atomos on a laptop:
//!
//! - Windows names a display `\\.\DISPLAY3`. The panel's own name — its EDID
//!   name, `Atomos Ninja V` — is the one the operator is looking for.
//! - Windows attaches a new display to a laptop as a **Duplicate** of the
//!   primary more often than not, and a Duplicate group is *one* display to
//!   `EnumDisplayMonitors`. The recorder shows the picture and appears in no
//!   list, which reads as the app ignoring it. The same holds for a panel set
//!   to "Show only on 1": connected, unused, invisible.
//!
//! `QueryDisplayConfig` sees all of that. This module reads it once per call
//! and hands back a value the rest of the crate joins onto `MonitorInfo` by
//! the GDI name `available_monitors` already reports. On any other OS the
//! answer is empty and every field it feeds stays `None` / empty.

use std::collections::BTreeMap;

/// What the OS knows about the connected panels, keyed by GDI display name.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct Topology {
    /// GDI name (`\\.\DISPLAY2`) → the panel's EDID name, for every active
    /// path whose panel has one.
    pub friendly: BTreeMap<String, String>,
    /// GDI name → the **other** panels the OS is duplicating that source onto.
    pub also_on: BTreeMap<String, Vec<String>>,
    /// Panels that are connected and that no active path draws on. Names.
    pub unused: Vec<String>,
}

/// Fold a list of paths into a [`Topology`]. Pure, so the Windows-specific
/// part is only the reading, and a test can hand in what `QueryDisplayConfig`
/// would have.
pub fn fold(paths: &[Path]) -> Topology {
    let mut topology = Topology::default();

    // Active paths, grouped by source: one group is one display to the OS.
    let mut by_source: BTreeMap<(u64, u32), Vec<&Path>> = BTreeMap::new();
    for path in paths.iter().filter(|p| p.active) {
        by_source.entry(path.source).or_default().push(path);
    }
    // One entry per group: its first path is the display's face, the rest are
    // the panels it is duplicated onto. Every path of a group carries the same
    // GDI name, since the name belongs to the source.
    for group in by_source.values() {
        let Some(face) = group.first() else { continue };
        let Some(gdi) = face.gdi_name.clone() else {
            continue;
        };
        if let Some(friendly) = face.friendly_name.clone() {
            topology.friendly.insert(gdi.clone(), friendly);
        }
        let others: Vec<String> = group
            .iter()
            .filter(|other| other.target != face.target)
            .map(|other| other.label())
            .collect();
        if !others.is_empty() {
            topology.also_on.insert(gdi, others);
        }
    }

    // A target is unused when it is available on some path and active on none.
    let mut seen: Vec<(u64, u32)> = Vec::new();
    for path in paths.iter().filter(|p| p.available && !p.active) {
        if seen.contains(&path.target) || paths.iter().any(|p| p.active && p.target == path.target)
        {
            continue;
        }
        seen.push(path.target);
        topology.unused.push(path.label());
    }
    topology
}

/// One `DISPLAYCONFIG_PATH_INFO`, reduced to what [`fold`] reads.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Path {
    /// `(adapterId, sourceId)`: the framebuffer the OS draws.
    pub source: (u64, u32),
    /// `(adapterId, targetId)`: the connector a panel hangs off.
    pub target: (u64, u32),
    pub active: bool,
    /// A panel is physically connected on this target.
    pub available: bool,
    /// `\\.\DISPLAYn` — what `available_monitors` calls the display.
    pub gdi_name: Option<String>,
    /// The panel's EDID name, when it carries one.
    pub friendly_name: Option<String>,
}

impl Path {
    fn label(&self) -> String {
        self.friendly_name
            .clone()
            .or_else(|| self.gdi_name.clone())
            .unwrap_or_else(|| format!("display {}", self.target.1))
    }
}

/// The topology now. Empty off Windows.
pub fn read() -> Topology {
    fold(&os::paths())
}

#[cfg(windows)]
mod os {
    use super::Path;
    use windows::Win32::Devices::Display::{
        DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME, DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
        DISPLAYCONFIG_DEVICE_INFO_HEADER, DISPLAYCONFIG_MODE_INFO, DISPLAYCONFIG_PATH_INFO,
        DISPLAYCONFIG_SOURCE_DEVICE_NAME, DISPLAYCONFIG_TARGET_DEVICE_NAME,
        DisplayConfigGetDeviceInfo, GetDisplayConfigBufferSizes, QDC_ALL_PATHS, QueryDisplayConfig,
    };
    use windows::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_SUCCESS, LUID, WIN32_ERROR};
    use windows::Win32::Graphics::Gdi::DISPLAYCONFIG_PATH_ACTIVE;

    fn luid(id: LUID) -> u64 {
        (u64::from(id.HighPart as u32) << 32) | u64::from(id.LowPart)
    }

    fn wide(chars: &[u16]) -> Option<String> {
        let end = chars.iter().position(|&c| c == 0).unwrap_or(chars.len());
        let s = String::from_utf16_lossy(&chars[..end]).trim().to_owned();
        (!s.is_empty()).then_some(s)
    }

    fn source_name(adapter: LUID, id: u32) -> Option<String> {
        let mut info = DISPLAYCONFIG_SOURCE_DEVICE_NAME {
            header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_SOURCE_NAME,
                size: std::mem::size_of::<DISPLAYCONFIG_SOURCE_DEVICE_NAME>() as u32,
                adapterId: adapter,
                id,
            },
            ..Default::default()
        };
        // SAFETY: `header.size` is the size of the struct the pointer names.
        let rc = unsafe { DisplayConfigGetDeviceInfo(&mut info.header) };
        (rc == ERROR_SUCCESS.0 as i32)
            .then(|| wide(&info.viewGdiDeviceName))
            .flatten()
    }

    fn target_name(adapter: LUID, id: u32) -> Option<String> {
        let mut info = DISPLAYCONFIG_TARGET_DEVICE_NAME {
            header: DISPLAYCONFIG_DEVICE_INFO_HEADER {
                r#type: DISPLAYCONFIG_DEVICE_INFO_GET_TARGET_NAME,
                size: std::mem::size_of::<DISPLAYCONFIG_TARGET_DEVICE_NAME>() as u32,
                adapterId: adapter,
                id,
            },
            ..Default::default()
        };
        // SAFETY: as above.
        let rc = unsafe { DisplayConfigGetDeviceInfo(&mut info.header) };
        if rc != ERROR_SUCCESS.0 as i32 {
            return None;
        }
        // SAFETY: `flags` is a union of a bitfield and its `u32` value; reading
        // the integer is always defined. Bit 0 is `friendlyNameFromEdid`.
        let has_name = unsafe { info.flags.Anonymous.value } & 1 != 0;
        has_name
            .then(|| wide(&info.monitorFriendlyDeviceName))
            .flatten()
    }

    pub fn paths() -> Vec<Path> {
        // The buffer can grow between the size query and the read; retry.
        for _ in 0..4 {
            let mut n_paths = 0u32;
            let mut n_modes = 0u32;
            // SAFETY: out-pointers to two locals.
            let rc =
                unsafe { GetDisplayConfigBufferSizes(QDC_ALL_PATHS, &mut n_paths, &mut n_modes) };
            if rc != ERROR_SUCCESS {
                return Vec::new();
            }
            let mut paths = vec![DISPLAYCONFIG_PATH_INFO::default(); n_paths as usize];
            let mut modes = vec![DISPLAYCONFIG_MODE_INFO::default(); n_modes as usize];
            // SAFETY: the buffers are sized by the call above and the counts
            // are passed with them.
            let rc: WIN32_ERROR = unsafe {
                QueryDisplayConfig(
                    QDC_ALL_PATHS,
                    &mut n_paths,
                    paths.as_mut_ptr(),
                    &mut n_modes,
                    modes.as_mut_ptr(),
                    None,
                )
            };
            if rc == ERROR_INSUFFICIENT_BUFFER {
                continue;
            }
            if rc != ERROR_SUCCESS {
                return Vec::new();
            }
            paths.truncate(n_paths as usize);
            return paths
                .iter()
                .map(|p| {
                    let source_adapter = p.sourceInfo.adapterId;
                    let target_adapter = p.targetInfo.adapterId;
                    Path {
                        source: (luid(source_adapter), p.sourceInfo.id),
                        target: (luid(target_adapter), p.targetInfo.id),
                        active: p.flags & DISPLAYCONFIG_PATH_ACTIVE != 0,
                        available: p.targetInfo.targetAvailable.as_bool(),
                        gdi_name: source_name(source_adapter, p.sourceInfo.id),
                        friendly_name: target_name(target_adapter, p.targetInfo.id),
                    }
                })
                .collect();
        }
        Vec::new()
    }
}

#[cfg(not(windows))]
mod os {
    pub fn paths() -> Vec<super::Path> {
        Vec::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn path(
        source: u32,
        target: u32,
        active: bool,
        gdi: Option<&str>,
        friendly: Option<&str>,
    ) -> Path {
        Path {
            source: (1, source),
            target: (1, target),
            active,
            available: true,
            gdi_name: gdi.map(str::to_owned),
            friendly_name: friendly.map(str::to_owned),
        }
    }

    #[test]
    fn extended_displays_get_their_panel_names_and_nothing_else() {
        let t = fold(&[
            path(0, 10, true, Some(r"\\.\DISPLAY1"), None),
            path(1, 11, true, Some(r"\\.\DISPLAY2"), Some("DELL G2724D")),
        ]);
        assert_eq!(
            t.friendly.get(r"\\.\DISPLAY2").map(String::as_str),
            Some("DELL G2724D")
        );
        assert!(!t.friendly.contains_key(r"\\.\DISPLAY1"));
        assert!(t.also_on.is_empty());
        assert!(t.unused.is_empty());
    }

    /// The Atomos on a laptop: Windows attached it as a Duplicate of the
    /// built-in panel, so `available_monitors` reports one display. The
    /// recorder has to be reported *on that display's card*.
    #[test]
    fn a_duplicate_group_names_the_other_panels_on_the_one_display_the_os_reports() {
        let t = fold(&[
            path(0, 10, true, Some(r"\\.\DISPLAY1"), None),
            path(0, 12, true, Some(r"\\.\DISPLAY1"), Some("Atomos Ninja V")),
        ]);
        assert_eq!(
            t.also_on.get(r"\\.\DISPLAY1"),
            Some(&vec!["Atomos Ninja V".to_owned()])
        );
        assert!(t.unused.is_empty());
    }

    /// "Show only on 1": the panel is plugged in and draws nothing. The OS
    /// offers it on many inactive paths (one per source); it is one finding.
    #[test]
    fn a_connected_panel_no_path_draws_on_is_unused_once() {
        let mut inactive = path(0, 12, false, None, Some("Atomos Ninja V"));
        inactive.source = (1, 1);
        let t = fold(&[
            path(0, 10, true, Some(r"\\.\DISPLAY1"), None),
            path(0, 12, false, None, Some("Atomos Ninja V")),
            inactive,
        ]);
        assert_eq!(t.unused, vec!["Atomos Ninja V".to_owned()]);
    }

    #[test]
    fn a_panel_that_is_active_somewhere_is_not_unused_for_its_inactive_paths() {
        let t = fold(&[
            path(0, 10, true, Some(r"\\.\DISPLAY1"), None),
            path(1, 10, false, None, None),
        ]);
        assert!(t.unused.is_empty());
    }
}
