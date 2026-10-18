//! An upgrade never touches a library without a copy of it first (P12.6).
//!
//! The operator updates by running the new installer over the old one; the
//! library stays where it was and the new build opens it. These tests stand in
//! for that moment: a file written by one version, opened by the next.

use std::path::{Path, PathBuf};

use questiongame_host::catalog::{
    CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, META_LAST_OPENED,
    OpenOptions, Team,
};

/// A folder that goes away when the test does.
struct TempDir(PathBuf);

impl TempDir {
    fn new(tag: &str) -> Self {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let path = std::env::temp_dir().join(format!(
            "questiongame-upgrade-{tag}-{}-{nanos}",
            std::process::id()
        ));
        std::fs::create_dir_all(&path).unwrap();
        TempDir(path)
    }

    fn library(&self) -> PathBuf {
        self.0.join("questiongame.sqlite3")
    }

    fn backups(&self) -> PathBuf {
        self.0.join("backups")
    }
}

impl Drop for TempDir {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.0);
    }
}

fn options(dir: &TempDir, version: &str, stamp: &str) -> OpenOptions {
    OpenOptions {
        app_version: version.to_string(),
        backup_dir: dir.backups(),
        keep: 5,
        stamp: stamp.to_string(),
    }
}

fn team(id: &str, name: &str) -> CatalogItem {
    CatalogItem::Team(Box::new(Team::new(id, name, "TM")))
}

fn backups_in(dir: &Path) -> Vec<String> {
    let mut names: Vec<String> = std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .collect()
        })
        .unwrap_or_default();
    names.sort();
    names
}

#[test]
fn an_existing_library_opened_by_a_new_version_is_backed_up_first() {
    let dir = TempDir::new("new-version");
    {
        let (catalog, report) =
            CatalogService::open_file(&dir.library(), &options(&dir, "1.0.1", "20261001-090000"))
                .unwrap();
        assert!(!report.existed);
        catalog.catalog_upsert(&team("team-a", "Alpha"), 1).unwrap();
    }

    let (catalog, report) =
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap();
    assert!(report.existed);
    assert_eq!(report.previous_version.as_deref(), Some("1.0.1"));
    let backup = report.backup.expect("a backup");
    assert_eq!(
        backup.file_name().unwrap().to_string_lossy(),
        "questiongame-1.0.1-20261018-120000.sqlite3"
    );
    assert_eq!(
        catalog.meta_get(META_LAST_OPENED).unwrap().as_deref(),
        Some("1.0.2")
    );

    let copy = CatalogService::open(CatalogLocation::file(&backup)).unwrap();
    let CatalogItem::Team(row) = copy.catalog_get(CatalogKind::Team, "team-a").unwrap() else {
        panic!("a team");
    };
    assert_eq!(row.name, "Alpha");
}

#[test]
fn a_library_without_a_stamp_is_treated_as_1_0_1() {
    let dir = TempDir::new("unstamped");
    {
        // 1.0.1 opened its library with `open` and wrote no version.
        let catalog = CatalogService::open(CatalogLocation::file(dir.library())).unwrap();
        catalog.catalog_upsert(&team("team-a", "Alpha"), 1).unwrap();
    }

    let (_, report) =
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap();
    assert!(report.existed);
    assert_eq!(report.previous_version, None);
    assert_eq!(
        backups_in(&dir.backups()),
        vec!["questiongame-1.0.1-20261018-120000.sqlite3".to_string()]
    );
}

#[test]
fn the_same_version_reopening_writes_no_backup() {
    let dir = TempDir::new("same");
    drop(
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap(),
    );
    let (_, report) =
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-130000"))
            .unwrap();
    assert!(report.existed);
    assert_eq!(report.backup, None);
    assert!(backups_in(&dir.backups()).is_empty());
}

#[test]
fn a_fresh_library_writes_no_backup_and_stamps_itself() {
    let dir = TempDir::new("fresh");
    let (catalog, report) =
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap();
    assert!(!report.existed);
    assert_eq!(report.backup, None);
    assert_eq!(
        catalog.meta_get(META_LAST_OPENED).unwrap().as_deref(),
        Some("1.0.2")
    );
    assert!(backups_in(&dir.backups()).is_empty());
}

#[test]
fn retention_keeps_the_five_newest() {
    let dir = TempDir::new("retention");
    drop(
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.0", "20260901-000000"))
            .unwrap(),
    );
    std::fs::create_dir_all(dir.backups()).unwrap();
    for day in 1..=6 {
        let name = format!("questiongame-0.9.0-202609{day:02}-000000.sqlite3");
        std::fs::write(dir.backups().join(name), b"old").unwrap();
    }
    std::fs::write(dir.backups().join("notes.txt"), b"mine").unwrap();

    drop(
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap(),
    );

    assert_eq!(
        backups_in(&dir.backups()),
        vec![
            "notes.txt".to_string(),
            "questiongame-0.9.0-20260903-000000.sqlite3".to_string(),
            "questiongame-0.9.0-20260904-000000.sqlite3".to_string(),
            "questiongame-0.9.0-20260905-000000.sqlite3".to_string(),
            "questiongame-0.9.0-20260906-000000.sqlite3".to_string(),
            "questiongame-1.0.0-20261018-120000.sqlite3".to_string(),
        ]
    );
}

#[test]
fn an_unwritable_backup_dir_refuses_to_open_and_leaves_the_file_unchanged() {
    let dir = TempDir::new("unwritable");
    drop(
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.1", "20261001-090000"))
            .unwrap(),
    );
    let before = std::fs::read(dir.library()).unwrap();

    // A file where the folder should be: nothing can be written under it.
    let blocked = dir.0.join("blocked");
    std::fs::write(&blocked, b"not a folder").unwrap();
    let opts = OpenOptions {
        backup_dir: blocked.clone(),
        ..options(&dir, "1.0.2", "20261018-120000")
    };
    match CatalogService::open_file(&dir.library(), &opts) {
        Err(CatalogError::BackupFailed { dir: named, .. }) => assert_eq!(named, blocked),
        Err(other) => panic!("expected BackupFailed, got {other}"),
        Ok(_) => panic!("expected BackupFailed, got a library"),
    }

    assert_eq!(std::fs::read(dir.library()).unwrap(), before);
    let reopened = CatalogService::open(CatalogLocation::file(dir.library())).unwrap();
    assert_eq!(
        reopened.meta_get(META_LAST_OPENED).unwrap().as_deref(),
        Some("1.0.1")
    );
}

/// From the final review: prune ordered by the stamp alone, so a clock that
/// is behind made the copy just taken the "oldest" and deleted it on the spot.
#[test]
fn retention_never_deletes_the_backup_just_taken() {
    let dir = TempDir::new("clock-behind");
    drop(CatalogService::open_file(&dir.library(), &options(&dir, "1.0.1", "20300101-000000")).unwrap());
    std::fs::create_dir_all(dir.backups()).unwrap();
    for day in 1..=5 {
        let name = format!("questiongame-1.0.0-203001{day:02}-000000.sqlite3");
        std::fs::write(dir.backups().join(name), b"old").unwrap();
    }

    // The machine's clock says 2026; the backups say 2030.
    let (_, report) =
        CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", "20261018-120000"))
            .unwrap();
    let taken = report.backup.expect("a backup");
    assert!(taken.exists(), "the copy just taken was pruned");
    assert_eq!(backups_in(&dir.backups()).len(), 5);
}

/// From the final review: a boot that fails after the copy (a schema from a
/// newer build, a failed migration) used to write a full copy per launch and
/// never prune.
#[test]
fn a_boot_that_fails_after_the_backup_still_keeps_only_five() {
    let dir = TempDir::new("fails-after");
    drop(CatalogService::open_file(&dir.library(), &options(&dir, "1.0.1", "20261001-000000")).unwrap());
    // A schema this build does not know, as a newer build would leave it.
    rusqlite::Connection::open(dir.library())
        .unwrap()
        .execute_batch("PRAGMA user_version = 99")
        .unwrap();

    for attempt in 0..7 {
        let stamp = format!("20261018-1200{attempt:02}");
        assert!(matches!(
            CatalogService::open_file(&dir.library(), &options(&dir, "1.0.2", &stamp)),
            Err(CatalogError::SchemaTooNew { .. })
        ));
    }
    assert_eq!(backups_in(&dir.backups()).len(), 5);
}
