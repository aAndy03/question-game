//! Who sees *What's new*, and from which version (P12.10).
//!
//! The notes themselves are Studio copy, in plain words and in every language
//! the app speaks; this only says where they start. The version the operator
//! last closed the window on is `app.last_seen_version` (`META_LAST_SEEN`), a
//! row beside the settings. 1.0.1 never wrote it, so a library that was there
//! before this build opened it is one 1.0.1 left: its notes start after 1.0.1.

use questiongame_host::catalog::UNSTAMPED_VERSION;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Since {
    /// Show the notes for every version newer than this one.
    Show(String),
    /// A library this build created: nothing is new to it. Stamp the running
    /// version and say nothing.
    StampSilently,
}

/// `last_seen` is `META_LAST_SEEN`; `existed` is whether the library was on
/// disk before this boot (`OpenReport::existed`).
pub fn since(last_seen: Option<String>, existed: bool) -> Since {
    match last_seen {
        Some(version) => Since::Show(version),
        None if existed => Since::Show(UNSTAMPED_VERSION.to_string()),
        None => Since::StampSilently,
    }
}
