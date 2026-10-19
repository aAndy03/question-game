//! Who sees *What's new*, and from which version (P12.10).
//!
//! The notes themselves are Studio copy, in plain words and in every language
//! the app speaks; this only says where they start. The version the operator
//! last closed the window on is `app.last_seen_version` (`META_LAST_SEEN`), a
//! row beside the settings. 1.0.1 never wrote it — nor stamped the library at
//! all — so a library that was on disk **and** carried no
//! `app.last_opened_version` before this boot is one 1.0.1 left: its notes
//! start after 1.0.1. A library a later build created was stamped by it, so
//! it is not mistaken for one (P12.12).

use questiongame_host::catalog::{OpenReport, UNSTAMPED_VERSION};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Since {
    /// Show the notes for every version newer than this one.
    Show(String),
    /// Nothing is new to this library. Stamp the running version and say
    /// nothing.
    StampSilently,
}

/// `last_seen` is `META_LAST_SEEN`; `report` is what opening the library found
/// (`None` for a library opened without one — memory, tests).
pub fn since(last_seen: Option<String>, report: Option<&OpenReport>) -> Since {
    if let Some(version) = last_seen {
        return Since::Show(version);
    }
    let left_by_1_0_1 = report.is_some_and(|r| r.existed && r.previous_version.is_none());
    if left_by_1_0_1 {
        Since::Show(UNSTAMPED_VERSION.to_string())
    } else {
        Since::StampSilently
    }
}
