//! questiongame Beta takes a copy of the stable library — and never touches
//! it (P13.1).
//!
//! "Never touches" is meant literally: not one byte written and not one file
//! created in the stable folder, the `-wal` / `-shm` sidecars a SQLite open
//! can make included. So SQLite never opens the stable file where it lies.
//! This module byte-copies `questiongame.sqlite3` (and a `-wal` a crash left)
//! through read-only handles into a temp folder **inside Beta's folder**, and
//! the host compacts that copy into Beta's library (`catalog::compact_copy`).
//!
//! A stable app that is running holds an exclusive lock on its
//! `questiongame.lock`. The copy takes a **shared** lock on that file —
//! through a read-only handle, which writes nothing — and holds it until the
//! copy is done: a stable app cannot start and write halfway through, and a
//! running one means "close questiongame first". A lock file that does not
//! exist is a stable app that never ran, and is not created.
//!
//! This file and `identity.rs` are the only ones that name the stable folder
//! (`tests/stable_folder.rs`).

use std::fs::File;
use std::path::{Path, PathBuf};

use crate::identity::{Channel, RELEASE_IDENTIFIER};
use crate::state::CATALOG_FILE;

const LOCK_FILE: &str = "questiongame.lock";
const TEMP_PREFIX: &str = "stable-copy-";

/// What a Beta first launch can offer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StableLibrary {
    Available,
    Missing,
    /// The stable app holds its lock: it is running.
    Running,
}

impl StableLibrary {
    /// What `beta_welcome_get` answers.
    pub fn wire(self) -> &'static str {
        match self {
            StableLibrary::Available => "available",
            StableLibrary::Missing => "missing",
            StableLibrary::Running => "running",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CopyError {
    Missing,
    Running,
    /// The stable library was written by a newer questiongame than this Beta.
    StableNewer,
    Io(String),
    Sqlite(String),
}

impl std::fmt::Display for CopyError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            CopyError::Missing => f.write_str("there is no stable library to copy"),
            CopyError::Running => f.write_str("questiongame is running; close it first, then copy"),
            CopyError::StableNewer => f.write_str("the stable library was written by a newer questiongame than this Beta"),
            CopyError::Io(reason) => write!(f, "the copy could not be written: {reason}"),
            CopyError::Sqlite(reason) => write!(f, "the stable library could not be read: {reason}"),
        }
    }
}

/// Where the stable library lives, for a Beta build: the release identity's
/// folder beside Beta's own. The e2e build playing Beta takes `e2e_override`
/// (`QUESTIONGAME_E2E_STABLE_DIR`) instead, and only an absolute folder that
/// exists and is not a real stable folder. Every other build has none.
pub fn stable_dir(beta_data_dir: &Path, channel: Channel, e2e_override: Option<&Path>) -> Option<PathBuf> {
    let dir = match channel {
        Channel::Beta => beta_data_dir.parent()?.join(RELEASE_IDENTIFIER),
        Channel::E2e(crate::identity::Line::Beta) => {
            let dir = e2e_override?;
            let real = dir.file_name().is_some_and(|n| n.eq_ignore_ascii_case(RELEASE_IDENTIFIER));
            if !dir.is_absolute() || !dir.is_dir() || real {
                return None;
            }
            dir.to_path_buf()
        }
        _ => return None,
    };
    let same = dir.to_string_lossy().to_lowercase() == beta_data_dir.to_string_lossy().to_lowercase();
    (!same).then_some(dir)
}

/// Is there a library to copy, and may it be copied now? Writes nothing.
pub fn probe(stable_dir: &Path) -> StableLibrary {
    match share_lock(stable_dir) {
        Err(()) => StableLibrary::Running,
        Ok(_held) if library_present(stable_dir) => StableLibrary::Available,
        Ok(_) => StableLibrary::Missing,
    }
}

/// Copy the stable library in `stable_dir` into a compact `dest` (which must
/// not exist), through a temp folder inside `beta_dir`.
pub fn copy_into(stable_dir: &Path, beta_dir: &Path, dest: &Path) -> Result<(), CopyError> {
    copy_with(stable_dir, beta_dir, dest, &|_| Ok(()))
}

/// The steps of a copy, for the fault-injection hook the tests use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Stage {
    CopyDb,
    CopyWal,
    Vacuum,
}

fn copy_with(
    stable_dir: &Path,
    beta_dir: &Path,
    dest: &Path,
    hook: &dyn Fn(Stage) -> Result<(), CopyError>,
) -> Result<(), CopyError> {
    remove_stale_temps(beta_dir);
    // Held until this function returns: a stable app cannot start mid-copy.
    let _held = share_lock(stable_dir).map_err(|()| CopyError::Running)?;
    if !library_present(stable_dir) {
        return Err(CopyError::Missing);
    }
    let temp = beta_dir.join(format!("{TEMP_PREFIX}{}", std::process::id()));
    let result = (|| {
        std::fs::create_dir_all(&temp).map_err(io)?;
        let db = temp.join(CATALOG_FILE);
        copy_read_only(&stable_dir.join(CATALOG_FILE), &db)?;
        hook(Stage::CopyDb)?;
        let wal = stable_dir.join(format!("{CATALOG_FILE}-wal"));
        if wal.is_file() {
            copy_read_only(&wal, &temp.join(format!("{CATALOG_FILE}-wal")))?;
        }
        hook(Stage::CopyWal)?;
        hook(Stage::Vacuum)?;
        questiongame_host::catalog::compact_copy(&db, dest).map_err(|e| match e {
            questiongame_host::catalog::CatalogError::SchemaTooNew { .. } => CopyError::StableNewer,
            questiongame_host::catalog::CatalogError::BackupFailed { reason, .. } => CopyError::Io(reason),
            other => CopyError::Sqlite(other.to_string()),
        })
    })();
    let _ = std::fs::remove_dir_all(&temp);
    if result.is_err() {
        let _ = std::fs::remove_file(dest);
    }
    result
}

fn library_present(stable_dir: &Path) -> bool {
    std::fs::metadata(stable_dir.join(CATALOG_FILE)).is_ok_and(|m| m.is_file() && m.len() > 0)
}

/// A shared lock on stable's lock file, through a read-only handle. `Ok(None)`
/// when there is no lock file (stable never ran); `Err` when stable holds it.
fn share_lock(stable_dir: &Path) -> Result<Option<File>, ()> {
    let Ok(file) = File::open(stable_dir.join(LOCK_FILE)) else {
        return Ok(None);
    };
    match file.try_lock_shared() {
        Ok(()) => Ok(Some(file)),
        Err(_) => Err(()),
    }
}

/// `from` is read through a read-only handle; nothing is asked of its folder.
fn copy_read_only(from: &Path, to: &Path) -> Result<(), CopyError> {
    let mut source = File::open(from).map_err(io)?;
    let mut target = File::create_new(to).map_err(io)?;
    std::io::copy(&mut source, &mut target).map_err(io)?;
    target.sync_all().map_err(io)
}

fn io(e: std::io::Error) -> CopyError {
    if e.kind() == std::io::ErrorKind::StorageFull {
        CopyError::Io("there is not enough disk space".to_string())
    } else {
        CopyError::Io(e.to_string())
    }
}

/// A copy a crash interrupted is never reused.
fn remove_stale_temps(beta_dir: &Path) {
    let Ok(entries) = std::fs::read_dir(beta_dir) else {
        return;
    };
    for entry in entries.flatten() {
        if entry.file_name().to_string_lossy().starts_with(TEMP_PREFIX) {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::identity::{BETA_IDENTIFIER, Line};
    use questiongame_host::catalog::{CatalogItem, CatalogKind, CatalogLocation, CatalogService, Team};
    use std::collections::BTreeMap;
    use std::sync::atomic::{AtomicU32, Ordering};

    /// `<tmp>/qg-stable-copy-<pid>-<n>/<name>/{stable, beta}`, removed on drop.
    struct Folders {
        base: PathBuf,
        stable: PathBuf,
        beta: PathBuf,
    }

    impl Folders {
        fn new(name: &str) -> Self {
            static N: AtomicU32 = AtomicU32::new(0);
            let base = std::env::temp_dir()
                .join(format!("qg-stable-copy-{}-{}", std::process::id(), N.fetch_add(1, Ordering::SeqCst)))
                .join(name);
            let stable = base.join(RELEASE_IDENTIFIER);
            let beta = base.join(BETA_IDENTIFIER);
            std::fs::create_dir_all(&stable).unwrap();
            std::fs::create_dir_all(&beta).unwrap();
            Folders { base, stable, beta }
        }

        fn dest(&self) -> PathBuf {
            self.beta.join("questiongame.copy.sqlite3")
        }

        /// A closed stable library holding `teams` teams.
        fn library(&self, teams: usize) {
            let catalog = CatalogService::open(CatalogLocation::file(self.stable.join(CATALOG_FILE))).unwrap();
            for i in 0..teams {
                let team = Team::new(format!("t{i}"), format!("Team {i}"), "TM");
                catalog.catalog_upsert(&CatalogItem::Team(Box::new(team)), i as u64 + 1).unwrap();
            }
        }

        fn copy(&self) -> Result<(), CopyError> {
            copy_into(&self.stable, &self.beta, &self.dest())
        }

        fn teams_in_dest(&self) -> usize {
            let copy = CatalogService::open(CatalogLocation::file(self.dest())).unwrap();
            copy.catalog_list(CatalogKind::Team, questiongame_host::catalog::ArchiveScope::Active).unwrap().len()
        }

        fn temps_left(&self) -> Vec<String> {
            names(&self.beta).into_iter().filter(|n| n.starts_with(TEMP_PREFIX)).collect()
        }
    }

    impl Drop for Folders {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(self.base.parent().unwrap());
        }
    }

    fn names(dir: &Path) -> Vec<String> {
        let mut n: Vec<String> = std::fs::read_dir(dir).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        n.sort();
        n
    }

    /// Every file in a folder: its bytes and its mtime. Access times are left
    /// out — NTFS and APFS change them on a read.
    fn snapshot(dir: &Path) -> BTreeMap<String, (Vec<u8>, std::time::SystemTime)> {
        names(dir)
            .into_iter()
            .map(|n| {
                let p = dir.join(&n);
                (n, (std::fs::read(&p).unwrap_or_default(), std::fs::metadata(&p).unwrap().modified().unwrap()))
            })
            .collect()
    }

    fn hold_exclusive(dir: &Path) -> File {
        let f = std::fs::OpenOptions::new().create(true).truncate(false).read(true).write(true).open(dir.join(LOCK_FILE)).unwrap();
        f.try_lock().unwrap();
        f
    }

    /// SC01, SC06, SC09.
    #[test]
    fn the_stable_folder_is_untouched() {
        let f = Folders::new("untouched");
        f.library(3);
        let before = snapshot(&f.stable);
        assert_eq!(names(&f.stable), [CATALOG_FILE], "a closed library is one file");
        f.copy().unwrap();
        assert_eq!(snapshot(&f.stable), before, "same files, same bytes, same mtimes");
        assert_eq!(names(&f.stable), [CATALOG_FILE], "no sidecar, and no lock file created");
        assert_eq!(f.teams_in_dest(), 3);
    }

    /// SC02, SC14: a crash left rows only in the `-wal`; the copy has them.
    #[test]
    fn copies_a_library_with_a_pending_wal() {
        let f = Folders::new("wal");
        let live = f.base.join("live");
        std::fs::create_dir_all(&live).unwrap();
        let catalog = CatalogService::open(CatalogLocation::file(live.join(CATALOG_FILE))).unwrap();
        for i in 0..40 {
            let team = Team::new(format!("t{i}"), format!("Team {i}"), "TM");
            catalog.catalog_upsert(&CatalogItem::Team(Box::new(team)), i + 1).unwrap();
        }
        // The crash image: the two files as they stand while the app is open.
        for name in [CATALOG_FILE.to_string(), format!("{CATALOG_FILE}-wal")] {
            std::fs::copy(live.join(&name), f.stable.join(&name)).unwrap();
        }
        drop(catalog);
        assert!(std::fs::metadata(f.stable.join(format!("{CATALOG_FILE}-wal"))).unwrap().len() > 0, "the wal holds pages");
        let before = snapshot(&f.stable);
        f.copy().unwrap();
        assert_eq!(snapshot(&f.stable), before);
        assert_eq!(f.teams_in_dest(), 40);
    }

    /// SC03, SC07, SC08, SC13.
    #[test]
    fn refuses_while_stable_holds_its_lock() {
        let f = Folders::new("running");
        f.library(1);
        let held = hold_exclusive(&f.stable);
        let before = snapshot(&f.stable);
        assert_eq!(probe(&f.stable), StableLibrary::Running);
        assert_eq!(f.copy(), Err(CopyError::Running));
        assert_eq!(snapshot(&f.stable), before);
        assert!(!f.dest().exists());
        assert!(f.temps_left().is_empty());
        drop(held);
        f.copy().unwrap();
        // SC13: the copy let go of its shared lock.
        hold_exclusive(&f.stable);
    }

    /// SC10, SC11: a lock file nobody holds, or one another reader shares.
    #[test]
    fn a_free_or_shared_lock_is_not_running() {
        let f = Folders::new("free");
        f.library(1);
        drop(hold_exclusive(&f.stable));
        assert_eq!(probe(&f.stable), StableLibrary::Available);
        let reader = File::open(f.stable.join(LOCK_FILE)).unwrap();
        reader.try_lock_shared().unwrap();
        f.copy().unwrap();
    }

    /// SC12: while the copy runs, stable could not take its lock.
    #[test]
    fn the_lock_is_held_for_the_whole_copy() {
        let f = Folders::new("held");
        f.library(1);
        drop(hold_exclusive(&f.stable));
        let lock = f.stable.join(LOCK_FILE);
        copy_with(&f.stable, &f.beta, &f.dest(), &|stage| {
            if stage == Stage::CopyWal {
                let other = std::fs::OpenOptions::new().read(true).write(true).open(&lock).unwrap();
                assert!(other.try_lock().is_err(), "a stable app starting now would be refused");
            }
            Ok(())
        })
        .unwrap();
        hold_exclusive(&f.stable);
    }

    /// SC04, SC30: a failure at any step leaves both sides as they were.
    #[test]
    fn a_failure_at_any_step_cleans_up() {
        for stage in [Stage::CopyDb, Stage::CopyWal, Stage::Vacuum] {
            let f = Folders::new("faults");
            f.library(1);
            let before = snapshot(&f.stable);
            let r = copy_with(&f.stable, &f.beta, &f.dest(), &|s| {
                if s == stage { Err(CopyError::Io("there is not enough disk space".into())) } else { Ok(()) }
            });
            assert!(r.is_err(), "{stage:?}");
            assert_eq!(snapshot(&f.stable), before, "{stage:?}");
            assert!(!f.dest().exists(), "{stage:?}");
            assert!(f.temps_left().is_empty(), "{stage:?}");
        }
    }

    /// SC29, SC31: the temp folder is Beta's, and a crashed one is not reused.
    #[test]
    fn the_temp_folder_is_inside_beta_and_never_reused() {
        let f = Folders::new("temp");
        f.library(2);
        let stale = f.beta.join(format!("{TEMP_PREFIX}{}", std::process::id()));
        std::fs::create_dir_all(&stale).unwrap();
        std::fs::write(stale.join(CATALOG_FILE), b"junk from a crash").unwrap();
        let beta = f.beta.clone();
        copy_with(&f.stable, &f.beta, &f.dest(), &|s| {
            if s == Stage::CopyDb {
                let t = names(&beta).into_iter().find(|n| n.starts_with(TEMP_PREFIX)).expect("a temp folder");
                assert!(beta.join(&t).starts_with(&beta));
            }
            Ok(())
        })
        .unwrap();
        assert_eq!(f.teams_in_dest(), 2);
        assert!(f.temps_left().is_empty());
    }

    /// SC17, SC21, SC22, SC23.
    #[test]
    fn nothing_to_copy_is_missing() {
        let f = Folders::new("missing");
        assert_eq!(probe(&f.stable), StableLibrary::Missing);
        assert_eq!(f.copy(), Err(CopyError::Missing));
        std::fs::write(f.stable.join(format!("{CATALOG_FILE}-wal")), b"orphan").unwrap();
        assert_eq!(f.copy(), Err(CopyError::Missing));
        std::fs::write(f.stable.join(CATALOG_FILE), b"").unwrap();
        assert_eq!(probe(&f.stable), StableLibrary::Missing);
        assert_eq!(f.copy(), Err(CopyError::Missing));
        let gone = Folders::new("no-folder");
        std::fs::remove_dir_all(&gone.stable).unwrap();
        assert_eq!(probe(&gone.stable), StableLibrary::Missing);
        assert!(!gone.stable.exists(), "probing creates nothing");
        assert!(gone.temps_left().is_empty());
    }

    /// SC18: a stray `-shm` is neither read nor copied.
    #[test]
    fn a_stray_shm_is_left_alone() {
        let f = Folders::new("shm");
        f.library(1);
        std::fs::write(f.stable.join(format!("{CATALOG_FILE}-shm")), vec![7u8; 32768]).unwrap();
        let before = snapshot(&f.stable);
        f.copy().unwrap();
        assert_eq!(snapshot(&f.stable), before);
        assert_eq!(f.teams_in_dest(), 1);
    }

    /// SC24, SC25: garbage and a truncated file fail cleanly.
    #[test]
    fn a_corrupt_library_fails_cleanly() {
        for (name, bytes) in [("garbage", vec![0x5au8; 4096]), ("truncated", Vec::new())] {
            let f = Folders::new(name);
            if bytes.is_empty() {
                f.library(30);
                let full = std::fs::read(f.stable.join(CATALOG_FILE)).unwrap();
                std::fs::write(f.stable.join(CATALOG_FILE), &full[..full.len() / 3]).unwrap();
            } else {
                std::fs::write(f.stable.join(CATALOG_FILE), &bytes).unwrap();
            }
            let before = snapshot(&f.stable);
            let r = f.copy();
            if name == "garbage" {
                assert!(matches!(r, Err(CopyError::Sqlite(_))), "{r:?}");
            }
            if r.is_err() {
                assert!(!f.dest().exists());
            }
            assert_eq!(snapshot(&f.stable), before);
            assert!(f.temps_left().is_empty());
        }
    }

    /// SC26.
    #[test]
    fn a_newer_stable_library_is_refused() {
        let f = Folders::new("newer");
        f.library(1);
        let conn = rusqlite_free_bump(&f.stable.join(CATALOG_FILE));
        assert!(conn);
        assert_eq!(f.copy(), Err(CopyError::StableNewer));
        assert!(!f.dest().exists());
    }

    /// Raise `user_version` without a SQLite dependency in this crate: the
    /// header field at offset 60, big-endian (SQLite's file format).
    fn rusqlite_free_bump(path: &Path) -> bool {
        let mut bytes = std::fs::read(path).unwrap();
        bytes[60..64].copy_from_slice(&999u32.to_be_bytes());
        std::fs::write(path, bytes).is_ok()
    }

    /// SC33, SC34: the names people really have.
    #[test]
    fn any_folder_name_works() {
        for name in ["Ștefan-Ădrian Pânză 日本語 😀", "O'Brien with spaces"] {
            let f = Folders::new(name);
            f.library(2);
            f.copy().unwrap();
            assert_eq!(f.teams_in_dest(), 2, "{name}");
        }
    }

    /// SC51–SC55.
    #[test]
    fn where_the_stable_folder_is() {
        let roaming = std::env::temp_dir().join(format!("qg-roaming-{}", std::process::id()));
        let beta = roaming.join(BETA_IDENTIFIER);
        assert_eq!(stable_dir(&beta, Channel::Beta, None), Some(roaming.join(RELEASE_IDENTIFIER)));
        assert_eq!(stable_dir(&beta, Channel::Beta, Some(&roaming)), Some(roaming.join(RELEASE_IDENTIFIER)), "Beta ignores the override");
        for c in [Channel::Stable, Channel::Dev, Channel::E2e(Line::Stable)] {
            assert_eq!(stable_dir(&beta, c, Some(&roaming)), None, "{c:?}");
        }
        let fixture = roaming.join("questiongame-e2e-stable");
        std::fs::create_dir_all(&fixture).unwrap();
        let e2e = roaming.join(crate::identity::E2E_IDENTIFIER);
        let e2e_beta = Channel::E2e(Line::Beta);
        assert_eq!(stable_dir(&e2e, e2e_beta, Some(&fixture)), Some(fixture.clone()));
        assert_eq!(stable_dir(&e2e, e2e_beta, None), None);
        assert_eq!(stable_dir(&e2e, e2e_beta, Some(Path::new("relative"))), None);
        assert_eq!(stable_dir(&e2e, e2e_beta, Some(&roaming.join("absent"))), None);
        let real = roaming.join(RELEASE_IDENTIFIER);
        std::fs::create_dir_all(&real).unwrap();
        assert_eq!(stable_dir(&e2e, e2e_beta, Some(&real)), None, "the e2e build never reads a real stable folder");
        assert_eq!(stable_dir(&fixture, e2e_beta, Some(&fixture)), None, "never itself");
        let _ = std::fs::remove_dir_all(&roaming);
    }
}
