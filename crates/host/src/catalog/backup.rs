//! A copy of the library before anything changes it (P12.6).
//!
//! An operator upgrades by installing the new build over the old one, and the
//! new build opens the same file. Two things can then rewrite it: a schema
//! migration, and the first write of a build that reads rows differently. So
//! before either, an existing library is copied with `VACUUM INTO` — a
//! consistent snapshot of the database, the WAL included — into
//! `<backup dir>/questiongame-<old version>-<stamp>.sqlite3`.
//!
//! The rule that matters is the order: **no copy, no change.** A backup that
//! cannot be written stops the open with [`CatalogError::BackupFailed`] and the
//! library is left exactly as the old build left it.
//!
//! Which version last opened the file is a row in `globals`
//! ([`META_LAST_OPENED`]), not a schema change, so a 1.0.1 binary can still
//! open a library 1.0.2 has stamped. A library with no stamp was last opened by
//! 1.0.1, the last build that did not write one.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::error::{CatalogError, CatalogResult};

/// The app version that last opened this library.
pub const META_LAST_OPENED: &str = "app.last_opened_version";
/// The newest version whose *What's new* the operator has closed (P12.10).
pub const META_LAST_SEEN: &str = "app.last_seen_version";

/// What an unstamped library was last opened by.
pub const UNSTAMPED_VERSION: &str = "1.0.1";

const PREFIX: &str = "questiongame-";
const SUFFIX: &str = ".sqlite3";

/// How [`super::CatalogService::open_file`] guards an upgrade. Every value
/// comes from the caller — the host has no clock and no app version of its
/// own.
#[derive(Debug, Clone)]
pub struct OpenOptions {
    /// The running build, `CARGO_PKG_VERSION` of the app crate.
    pub app_version: String,
    pub backup_dir: PathBuf,
    /// How many backups to keep; older ones are deleted after a good open.
    pub keep: usize,
    /// `yyyymmdd-hhmmss`, so names sort by time.
    pub stamp: String,
}

/// What opening the library found, for the boot log and *What's new*.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OpenReport {
    /// The file was there before this open.
    pub existed: bool,
    /// [`META_LAST_OPENED`] as it was before this open; `None` on a fresh or
    /// an unstamped library.
    pub previous_version: Option<String>,
    pub backup: Option<PathBuf>,
}

/// Copy the database `conn` is open on. Writes nothing to the library.
pub(super) fn write(
    conn: &Connection,
    dir: &Path,
    label: &str,
    stamp: &str,
) -> CatalogResult<PathBuf> {
    let failed = |reason: String| CatalogError::BackupFailed {
        dir: dir.to_path_buf(),
        reason,
    };
    std::fs::create_dir_all(dir).map_err(|e| failed(e.to_string()))?;
    let path = dir.join(format!("{PREFIX}{label}-{stamp}{SUFFIX}"));
    if path.exists() {
        return Err(failed(format!("{} already exists", path.display())));
    }
    let target = path
        .to_str()
        .ok_or_else(|| failed("the backup path is not valid UTF-8".to_string()))?;
    conn.execute("VACUUM INTO ?1", [target])
        .map_err(|e| failed(e.to_string()))?;
    // Windows flushes a file only through a handle that may write to it.
    std::fs::OpenOptions::new()
        .write(true)
        .open(&path)
        .and_then(|file| file.sync_all())
        .map_err(|e| failed(e.to_string()))?;
    tracing::info!(path = %path.display(), "library backed up");
    Ok(path)
}

/// Keep the `keep` newest backups. Only files this module names are touched;
/// anything else the operator put in the folder stays.
pub(super) fn prune(dir: &Path, keep: usize) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut ours: Vec<(String, PathBuf)> = entries
        .filter_map(|entry| entry.ok())
        .filter_map(|entry| {
            let name = entry.file_name().to_string_lossy().into_owned();
            let stamp = stamp_of(&name)?.to_string();
            Some((stamp, entry.path()))
        })
        .collect();
    ours.sort();
    let excess = ours.len().saturating_sub(keep);
    for (_, path) in ours.into_iter().take(excess) {
        if let Err(error) = std::fs::remove_file(&path) {
            tracing::warn!(path = %path.display(), %error, "could not prune a backup");
        }
    }
}

/// The `yyyymmdd-hhmmss` of a backup's file name, which is what orders them.
fn stamp_of(name: &str) -> Option<&str> {
    let rest = name.strip_prefix(PREFIX)?.strip_suffix(SUFFIX)?;
    let stamp = rest.get(rest.len().checked_sub(15)?..)?;
    let well_formed = stamp.len() == 15
        && stamp.as_bytes()[8] == b'-'
        && stamp
            .bytes()
            .enumerate()
            .all(|(i, b)| i == 8 || b.is_ascii_digit());
    well_formed.then_some(stamp)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_stamp_is_read_from_the_end_of_the_name() {
        assert_eq!(
            stamp_of("questiongame-1.0.1-20261018-120000.sqlite3"),
            Some("20261018-120000")
        );
        assert_eq!(stamp_of("questiongame-1.0.1.sqlite3"), None);
        assert_eq!(stamp_of("notes.txt"), None);
        assert_eq!(stamp_of("questiongame-1.0.1-2026101x-120000.sqlite3"), None);
    }
}
