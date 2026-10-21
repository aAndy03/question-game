//! An upgrade never touches a library without a copy of it first (P12.6).
//!
//! The operator updates by running the new installer over the old one; the
//! library stays where it was and the new build opens it. These tests stand in
//! for that moment: a file written by one version, opened by the next.

use std::path::{Path, PathBuf};

use questiongame_host::catalog::{
    ArchiveScope, CatalogError, CatalogItem, CatalogKind, CatalogLocation, CatalogService, Demo,
    META_CURRENT_WORKSPACE, META_LAST_OPENED, OpenOptions, PRE_WORKSPACES_PREFIX, SeedMode, Team,
};
use questiongame_host::flags::{FlagService, GameSettings};
use questiongame_host::{MatchService, PlayId, RecipeId};

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

// ---- P13.1: a compact copy of a library, for questiongame Beta ----

use questiongame_host::catalog::compact_copy;

#[test]
fn a_compact_copy_holds_the_library_and_leaves_the_source_as_it_was() {
    let dir = TempDir::new("compact");
    let from = dir.library();
    let catalog = CatalogService::open(CatalogLocation::file(&from)).unwrap();
    catalog.catalog_upsert(&team("t1", "Alpha"), 1).unwrap();
    drop(catalog);
    let before = std::fs::read(&from).unwrap();
    let to = dir.0.join("copy.sqlite3");
    compact_copy(&from, &to).unwrap();
    assert_eq!(std::fs::read(&from).unwrap(), before);
    let copy = CatalogService::open(CatalogLocation::file(&to)).unwrap();
    assert!(copy.catalog_get(CatalogKind::Team, "t1").is_ok());
}

#[test]
fn a_compact_copy_never_writes_over_a_file() {
    let dir = TempDir::new("compact-exists");
    let from = dir.library();
    drop(CatalogService::open(CatalogLocation::file(&from)).unwrap());
    let to = dir.0.join("copy.sqlite3");
    std::fs::write(&to, b"already here").unwrap();
    assert!(compact_copy(&from, &to).is_err());
    assert_eq!(std::fs::read(&to).unwrap(), b"already here");
}

#[test]
fn a_compact_copy_refuses_a_library_newer_than_this_build() {
    let dir = TempDir::new("compact-newer");
    let from = dir.library();
    drop(CatalogService::open(CatalogLocation::file(&from)).unwrap());
    {
        let conn = rusqlite::Connection::open(&from).unwrap();
        conn.execute_batch("PRAGMA user_version = 999").unwrap();
    }
    let to = dir.0.join("copy.sqlite3");
    assert!(matches!(compact_copy(&from, &to), Err(CatalogError::SchemaTooNew { found: 999, .. })));
    assert!(!to.exists());
}

#[test]
fn a_compact_copy_of_garbage_is_an_error_and_leaves_nothing() {
    let dir = TempDir::new("compact-garbage");
    let from = dir.library();
    std::fs::write(&from, vec![0x5a; 4096]).unwrap();
    let to = dir.0.join("copy.sqlite3");
    assert!(compact_copy(&from, &to).is_err());
    assert!(!to.exists());
}

// ------------------------------------------------------------- workspaces (4)

/// A 1.0.2 library — schema 3, stamped `1.0.2` — holding the English Demo
/// and, with `open_play`, a Play left running when the app closed.
fn library_1_0_2(dir: &TempDir, open_play: bool) {
    let newer = dir.0.join("newer.sqlite3");
    {
        let service = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        service
            .seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), 1_000)
            .unwrap();
        if open_play {
            let mut flags = FlagService::default();
            flags.load_recipe(GameSettings::default()).unwrap();
            let snapshot = service
                .build_snapshot(
                    &RecipeId::from("seed-recipe-demo"),
                    PlayId::from("play-1"),
                    flags.freeze().unwrap(),
                )
                .unwrap();
            let mut play = MatchService::new();
            play.play_load(snapshot, 0).unwrap();
            play.play_start(0).unwrap();
            service.play_persist(play.get_state().unwrap()).unwrap();
        }
    }
    questiongame_host::catalog::db::write_older_schema(&newer, &dir.library(), 3).unwrap();
    let conn = rusqlite::Connection::open(dir.library()).unwrap();
    conn.execute(
        "INSERT INTO globals (key, value_json) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
        [META_LAST_OPENED, "\"1.0.2\""],
    )
    .unwrap();
}

fn count(conn: &rusqlite::Connection, sql: &str) -> i64 {
    conn.query_row(sql, [], |row| row.get(0)).unwrap()
}

#[test]
fn migration_4_puts_every_row_into_one_unnamed_workspace() {
    let dir = TempDir::new("ws-migrate");
    library_1_0_2(&dir, false);
    let before: Vec<i64> = {
        let conn = rusqlite::Connection::open(dir.library()).unwrap();
        [
            "teams",
            "domains",
            "questions",
            "question_options",
            "domain_questions",
            "recipes",
            "recipe_questions",
        ]
        .iter()
        .map(|t| count(&conn, &format!("SELECT count(*) FROM {t}")))
        .collect()
    };
    assert!(
        before.iter().all(|n| *n > 0),
        "the fixture has rows: {before:?}"
    );

    let (service, _) = CatalogService::open_file(
        &dir.library(),
        &options(&dir, "2.0.0-beta.1", "20261021-120000"),
    )
    .unwrap();
    let (workspaces, groups) = service.workspace_list().unwrap();
    assert_eq!(workspaces.len(), 1);
    assert!(groups.is_empty());
    assert_eq!(workspaces[0].name, None, "the operator names it");
    assert_eq!(service.current_workspace(), workspaces[0].id);
    assert_eq!(
        service.meta_get(META_CURRENT_WORKSPACE).unwrap().as_deref(),
        Some(workspaces[0].id.as_str())
    );
    assert_eq!(
        service
            .catalog_list(CatalogKind::Team, ArchiveScope::All)
            .unwrap()
            .len(),
        2
    );
    assert!(
        service
            .catalog_list(CatalogKind::Question, ArchiveScope::All)
            .unwrap()
            .iter()
            .all(|q| !q.is_shared()),
        "nothing is shared after the migration"
    );
    drop(service);

    let conn = rusqlite::Connection::open(dir.library()).unwrap();
    let after: Vec<i64> = [
        "teams",
        "domains",
        "questions",
        "question_options",
        "domain_questions",
        "recipes",
        "recipe_questions",
    ]
    .iter()
    .map(|t| count(&conn, &format!("SELECT count(*) FROM {t}")))
    .collect();
    assert_eq!(before, after, "every row survives");
    for table in ["teams", "domains", "questions", "recipes"] {
        assert_eq!(
            count(
                &conn,
                &format!("SELECT count(*) FROM {table} WHERE workspace_id IS NOT 'ws-1'")
            ),
            0,
            "{table}"
        );
    }
    assert_eq!(
        count(&conn, "SELECT count(*) FROM pragma_foreign_key_check"),
        0
    );
}

#[test]
fn the_pre_workspaces_backup_is_pinned_and_never_pruned() {
    let dir = TempDir::new("ws-pinned");
    library_1_0_2(&dir, false);
    let (service, report) = CatalogService::open_file(
        &dir.library(),
        &options(&dir, "2.0.0-beta.1", "20261021-120000"),
    )
    .unwrap();
    drop(service);
    let pinned = report.backup.expect("a copy before the migration");
    let name = pinned.file_name().unwrap().to_string_lossy().into_owned();
    assert!(name.starts_with(PRE_WORKSPACES_PREFIX), "{name}");
    let version: u32 = rusqlite::Connection::open(&pinned)
        .unwrap()
        .pragma_query_value(None, "user_version", |row| row.get(0))
        .unwrap();
    assert_eq!(version, 3, "the copy is the library before the step");

    // Seven later upgrades: the rotation keeps five, the pinned copy stays.
    for n in 2..9 {
        let (service, report) = CatalogService::open_file(
            &dir.library(),
            &options(
                &dir,
                &format!("2.0.0-beta.{n}"),
                &format!("2026102{n}-120000"),
            ),
        )
        .unwrap();
        drop(service);
        assert!(report.backup.is_some());
    }
    let names = backups_in(&dir.backups());
    assert!(names.contains(&name), "{names:?}");
    assert_eq!(
        names
            .iter()
            .filter(|n| !n.starts_with(PRE_WORKSPACES_PREFIX))
            .count(),
        5,
        "{names:?}"
    );
}

#[test]
fn migration_keeps_an_open_play_resumable() {
    let dir = TempDir::new("ws-open-play");
    library_1_0_2(&dir, true);
    let (service, _) = CatalogService::open_file(
        &dir.library(),
        &options(&dir, "2.0.0-beta.1", "20261021-120000"),
    )
    .unwrap();
    let play = service
        .resume_open_play()
        .unwrap()
        .expect("the Play was open");
    let mut match_service = MatchService::new();
    match_service.adopt(play).expect("its game is in view");
    assert!(
        service
            .recipe_get(&RecipeId::from("seed-recipe-demo"))
            .is_ok()
    );
}

#[test]
fn a_library_from_a_newer_build_is_still_refused() {
    let dir = TempDir::new("ws-future");
    {
        let service = CatalogService::open(CatalogLocation::file(dir.library())).unwrap();
        drop(service);
        let conn = rusqlite::Connection::open(dir.library()).unwrap();
        conn.execute_batch("PRAGMA user_version = 7").unwrap();
    }
    assert!(matches!(
        CatalogService::open_file(
            &dir.library(),
            &options(&dir, "2.0.0-beta.1", "20261021-120000")
        ),
        Err(CatalogError::SchemaTooNew { found: 7, known: 6 })
    ));
}

#[test]
fn a_second_failed_boot_does_not_pin_a_second_copy() {
    let dir = TempDir::new("ws-pinned-once");
    library_1_0_2(&dir, false);
    std::fs::create_dir_all(dir.backups()).unwrap();
    // A copy pinned by an earlier boot that did not get past the migration.
    std::fs::copy(dir.library(), dir.backups().join(format!("{PRE_WORKSPACES_PREFIX}20261020-120000.sqlite3"))).unwrap();
    let (service, report) = CatalogService::open_file(&dir.library(), &options(&dir, "2.0.0-beta.1", "20261021-120000")).unwrap();
    drop(service);
    let names = backups_in(&dir.backups());
    assert_eq!(names.iter().filter(|n| n.starts_with(PRE_WORKSPACES_PREFIX)).count(), 1, "{names:?}");
    assert!(report.backup.is_some(), "still no copy, no change: {names:?}");
}

// --------------------------------------------------------- groups, tags (5)

#[test]
fn m2_m3_migration_5_keeps_every_membership_adds_nothing_and_backs_up_first() {
    let dir = TempDir::new("m5");
    let newer = dir.0.join("newer.sqlite3");
    {
        let service = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        service.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), 1_000).unwrap();
    }
    questiongame_host::catalog::db::write_older_schema(&newer, &dir.library(), 4).unwrap();
    let before: i64 = rusqlite::Connection::open(dir.library())
        .unwrap()
        .query_row("SELECT count(*) FROM domain_questions", [], |r| r.get(0))
        .unwrap();
    let (service, report) = CatalogService::open_file(&dir.library(), &options(&dir, "2.1.0-beta.1", "20261022-120000")).unwrap();
    drop(service);
    let backup = report.backup.expect("a copy first");
    let name = backup.file_name().unwrap().to_string_lossy().into_owned();
    assert!(!name.starts_with(PRE_WORKSPACES_PREFIX), "{name}: an ordinary rotated copy");
    let version: u32 = rusqlite::Connection::open(&backup).unwrap().pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
    assert_eq!(version, 4);

    let conn = rusqlite::Connection::open(dir.library()).unwrap();
    assert_eq!(count(&conn, "SELECT count(*) FROM domain_questions"), before);
    assert_eq!(count(&conn, "SELECT count(*) FROM domain_questions WHERE group_id IS NOT NULL"), 0);
    assert_eq!(count(&conn, "SELECT count(*) FROM domain_groups"), 0);
    assert_eq!(count(&conn, "SELECT count(*) FROM question_tags"), 0);
    let head: u32 = conn.pragma_query_value(None, "user_version", |r| r.get(0)).unwrap();
    assert_eq!(head, 6, "through 5, then 6");
}
