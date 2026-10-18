//! The connection and the schema. Internal to `CatalogService` — nothing in
//! here is public, because the storage seam does not reach the interface.
//!
//! Three decisions from `04_ROADMAP.md` P5 live in this file:
//!
//! 1. **`bundled` SQLite.** No system library on either OS.
//! 2. **`journal_mode = WAL` with `synchronous = FULL`.** Writes are
//!    human-paced — a handful per question — so the fsync costs nothing
//!    measurable, and the durability claim stops depending on the kind of
//!    crash. WAL also gives readers a free lane, which is what lets the search
//!    index open its own read-only connection instead of sharing the writer.
//! 3. **Handwritten forward-only migrations** on the `user_version` pragma: an
//!    ordered `&[&str]` applied in one transaction at boot. No migration crate
//!    — it is thirty lines, and it should be readable in the diff. v1 has no
//!    downgrade story, so a file from a newer build is refused rather than
//!    guessed at.

use std::path::{Path, PathBuf};

use rusqlite::Connection;

use super::backup::{self, META_LAST_OPENED, OpenOptions, OpenReport, UNSTAMPED_VERSION};
use super::error::{CatalogError, CatalogResult};

/// Where the library lives. The in-memory variant is the test adapter — the
/// same code path, the same SQL, no file (`04_ROADMAP.md` P5: "the same suite
/// passes against both").
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CatalogLocation {
    Memory,
    File(PathBuf),
}

impl CatalogLocation {
    pub fn file(path: impl AsRef<Path>) -> Self {
        CatalogLocation::File(path.as_ref().to_path_buf())
    }

    fn is_memory(&self) -> bool {
        matches!(self, CatalogLocation::Memory)
    }
}

/// Every schema step ever shipped, in order. **Append only.** The index of the
/// last applied step is the `user_version` pragma, so editing an existing
/// string would silently skip the edit on every installed copy.
pub(crate) const MIGRATIONS: &[&str] = &[
    // 1 — the v1 library (§4.1), the recipe store (§11.B) and the Play log
    // (§5.10).
    r#"
    CREATE TABLE assets (
        id          TEXT PRIMARY KEY,
        path        TEXT NOT NULL,
        kind        TEXT NOT NULL,
        created_at  INTEGER NOT NULL,
        archived_at INTEGER
    );

    CREATE TABLE teams (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        short_code    TEXT NOT NULL,
        color         TEXT NOT NULL,
        logo_asset_id TEXT REFERENCES assets(id),
        notes         TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        archived_at   INTEGER,
        play_count    INTEGER NOT NULL DEFAULT 0,
        last_play_at  INTEGER
    );

    CREATE TABLE domains (
        id          TEXT PRIMARY KEY,
        name        TEXT NOT NULL,
        code        TEXT NOT NULL,
        description TEXT,
        created_at  INTEGER NOT NULL,
        updated_at  INTEGER NOT NULL,
        archived_at INTEGER
    );

    CREATE TABLE questions (
        id             TEXT PRIMARY KEY,
        stem           TEXT NOT NULL,
        media_asset_id TEXT REFERENCES assets(id),
        difficulty     INTEGER NOT NULL,
        explanation    TEXT,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        archived_at    INTEGER
    );

    CREATE TABLE question_options (
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        id          TEXT NOT NULL,
        position    INTEGER NOT NULL,
        text        TEXT NOT NULL,
        is_correct  INTEGER NOT NULL,
        PRIMARY KEY (question_id, id)
    );

    -- A question may sit in many domains; the sort key is the membership's,
    -- not the question's, so a difficulty edit does not reorder it (§4.1).
    CREATE TABLE domain_questions (
        domain_id   TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
        question_id TEXT NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
        sort_key    INTEGER NOT NULL,
        PRIMARY KEY (domain_id, question_id)
    );
    CREATE INDEX domain_questions_by_question ON domain_questions(question_id);

    CREATE TABLE operators (
        id             TEXT PRIMARY KEY,
        display_name   TEXT NOT NULL,
        pin_hash       TEXT,
        last_active_at INTEGER,
        plays_run      INTEGER NOT NULL DEFAULT 0,
        created_at     INTEGER NOT NULL,
        updated_at     INTEGER NOT NULL,
        archived_at    INTEGER
    );

    CREATE TABLE recipes (
        id            TEXT PRIMARY KEY,
        name          TEXT NOT NULL,
        folder        TEXT,
        tags_json     TEXT NOT NULL DEFAULT '[]',
        settings_json TEXT NOT NULL,
        layout_json   TEXT NOT NULL DEFAULT '{}',
        rev           INTEGER NOT NULL DEFAULT 1,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        archived_at   INTEGER
    );

    CREATE TABLE recipe_teams (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        team_id   TEXT NOT NULL REFERENCES teams(id),
        position  INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, team_id)
    );
    CREATE INDEX recipe_teams_by_team ON recipe_teams(team_id);

    CREATE TABLE recipe_domains (
        recipe_id TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        domain_id TEXT NOT NULL REFERENCES domains(id),
        position  INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, domain_id)
    );
    CREATE INDEX recipe_domains_by_domain ON recipe_domains(domain_id);

    CREATE TABLE recipe_questions (
        recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        domain_id   TEXT NOT NULL,
        question_id TEXT NOT NULL REFERENCES questions(id),
        position    INTEGER NOT NULL,
        PRIMARY KEY (recipe_id, domain_id, question_id)
    );
    CREATE INDEX recipe_questions_by_question ON recipe_questions(question_id);

    -- Per-recipe patches of a catalog field (§2.17). The original never moves.
    CREATE TABLE recipe_overlays (
        recipe_id   TEXT NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
        target_kind TEXT NOT NULL,
        target_id   TEXT NOT NULL,
        patch_json  TEXT NOT NULL,
        PRIMARY KEY (recipe_id, target_kind, target_id)
    );

    -- Truth for a Play. Append-only; nothing updates or deletes a row here.
    CREATE TABLE events (
        play_id   TEXT NOT NULL,
        seq       INTEGER NOT NULL,
        id        TEXT NOT NULL,
        at_ms     INTEGER NOT NULL,
        kind_json TEXT NOT NULL,
        PRIMARY KEY (play_id, seq)
    );

    -- Derived from `events`, and rebuilt from them at boot (§2.10, §5.10).
    -- Nothing may read a fact from here that the log does not already hold.
    CREATE TABLE plays (
        id                 TEXT PRIMARY KEY,
        recipe_id          TEXT NOT NULL,
        status             TEXT NOT NULL,
        started_at_ms      INTEGER,
        ended_at_ms        INTEGER,
        event_count        INTEGER NOT NULL,
        questions_consumed INTEGER NOT NULL,
        scores_json        TEXT NOT NULL
    );
    CREATE INDEX plays_by_recipe ON plays(recipe_id);

    CREATE TABLE globals (
        key        TEXT PRIMARY KEY,
        value_json TEXT NOT NULL
    );
    "#,
    // 2 — P10: who put a row in the library. Every row that already exists
    // was typed in by an operator, so the default is the right history, not
    // a guess.
    r#"
    ALTER TABLE teams     ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator';
    ALTER TABLE domains   ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator';
    ALTER TABLE questions ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator';
    ALTER TABLE recipes   ADD COLUMN origin TEXT NOT NULL DEFAULT 'operator';
    "#,
    // 3 — P11.1: who ran a Play. The fact is already in the log (the
    // `OperatorSwitched` event `play_load` appends), so this column is a
    // projection like every other column of `plays`, and the boot rebuild
    // fills it in for logs written before this step existed. `operators`
    // still carries a `plays_run` column; nothing reads it any more — the
    // count is `COUNT(*)` over this column, so it cannot drift from the log.
    r#"
    ALTER TABLE plays ADD COLUMN operator_id TEXT;
    CREATE INDEX plays_by_operator ON plays(operator_id);
    "#,
];

/// Open the writer connection and bring the schema up to date.
pub(crate) fn open(location: &CatalogLocation) -> CatalogResult<Connection> {
    let conn = match location {
        CatalogLocation::Memory => Connection::open_in_memory()?,
        CatalogLocation::File(path) => Connection::open(path)?,
    };
    apply_pragmas(&conn, location.is_memory())?;
    migrate(&conn)?;
    Ok(conn)
}

/// [`open`] for an installed library: copy it before anything can change it,
/// then migrate, then stamp the running version (P12.6, [`super::backup`]).
///
/// A copy is due when the file existed **and** either a migration is pending
/// or a different build opened it last. The copy is taken before `migrate` and
/// before the caller's first write — the projection rebuild — so it is the
/// library exactly as the previous build left it.
pub(crate) fn open_guarded(
    path: &Path,
    options: &OpenOptions,
) -> CatalogResult<(Connection, OpenReport)> {
    let existed = path.exists();
    let conn = Connection::open(path)?;
    apply_pragmas(&conn, false)?;

    let mut report = OpenReport {
        existed,
        previous_version: None,
        backup: None,
    };
    if existed {
        let applied: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
        // Before migration 1 there is no `globals` table to read; an error
        // here means "never stamped", which is what 1.0.1 left behind.
        report.previous_version = super::store::global_get(&conn, META_LAST_OPENED)
            .ok()
            .flatten()
            .and_then(|json| serde_json::from_str::<String>(&json).ok());
        let migrating = applied < MIGRATIONS.len() as u32;
        let new_build = report.previous_version.as_deref() != Some(options.app_version.as_str());
        if migrating || new_build {
            let label = report
                .previous_version
                .as_deref()
                .unwrap_or(UNSTAMPED_VERSION);
            report.backup = Some(backup::write(
                &conn,
                &options.backup_dir,
                label,
                &options.stamp,
            )?);
        }
    }

    migrate(&conn)?;
    super::store::global_set(
        &conn,
        META_LAST_OPENED,
        &serde_json::to_string(&options.app_version)?,
    )?;
    Ok((conn, report))
}

fn apply_pragmas(conn: &Connection, memory: bool) -> CatalogResult<()> {
    // Referential integrity is off by default in SQLite, and every `REFERENCES`
    // above is load-bearing for "cannot purge a row a recipe points at".
    conn.pragma_update(None, "foreign_keys", "ON")?;
    if !memory {
        // An in-memory database has no journal to write ahead of, and asking
        // for WAL there silently leaves the mode alone.
        let mode: String =
            conn.pragma_update_and_check(None, "journal_mode", "WAL", |row| row.get(0))?;
        debug_assert_eq!(mode.to_ascii_uppercase(), "WAL");
    }
    conn.pragma_update(None, "synchronous", "FULL")?;
    Ok(())
}

/// Apply every step the file has not seen, in one transaction, and stamp
/// `user_version`. Idempotent: a database already at the head does no work.
fn migrate(conn: &Connection) -> CatalogResult<()> {
    let applied: u32 = conn.pragma_query_value(None, "user_version", |row| row.get(0))?;
    let known = MIGRATIONS.len() as u32;
    if applied > known {
        return Err(CatalogError::SchemaTooNew {
            found: applied,
            known,
        });
    }
    if applied == known {
        return Ok(());
    }

    tracing::info!(from = applied, to = known, "migrating the library");
    conn.execute_batch("BEGIN")?;
    let result = (|| -> CatalogResult<()> {
        for step in &MIGRATIONS[applied as usize..] {
            conn.execute_batch(step)?;
        }
        // `pragma_update` cannot be parameterized, and `user_version` is not a
        // table, so this is the one place a literal is formatted into SQL. The
        // value is a `u32` from a slice length, never operator input.
        conn.execute_batch(&format!("PRAGMA user_version = {known}"))?;
        Ok(())
    })();
    match result {
        Ok(()) => {
            conn.execute_batch("COMMIT")?;
            Ok(())
        }
        Err(error) => {
            conn.execute_batch("ROLLBACK")?;
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_fresh_database_lands_on_the_head_revision() {
        let conn = open(&CatalogLocation::Memory).unwrap();
        let version: u32 = conn
            .pragma_query_value(None, "user_version", |row| row.get(0))
            .unwrap();
        assert_eq!(version, MIGRATIONS.len() as u32);
    }

    #[test]
    fn migrating_twice_is_a_no_op() {
        let conn = open(&CatalogLocation::Memory).unwrap();
        migrate(&conn).unwrap();
        migrate(&conn).unwrap();
        let tables: u32 = conn
            .query_row(
                "SELECT count(*) FROM sqlite_master WHERE type = 'table'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert!(
            tables >= 15,
            "expected the v1 schema, found {tables} tables"
        );
    }

    #[test]
    fn a_file_from_a_newer_build_is_refused_rather_than_guessed_at() {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch("PRAGMA user_version = 99").unwrap();
        assert!(matches!(
            migrate(&conn),
            Err(CatalogError::SchemaTooNew { found: 99, .. })
        ));
    }

    #[test]
    fn foreign_keys_are_on_so_a_referenced_row_cannot_vanish() {
        let conn = open(&CatalogLocation::Memory).unwrap();
        let on: i32 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .unwrap();
        assert_eq!(on, 1);
    }

    /// The copy is the library *before* the migration: a backup taken after
    /// it would be a copy of the thing it exists to undo.
    #[test]
    fn a_pending_migration_is_backed_up_before_it_runs() {
        let dir = std::env::temp_dir().join(format!(
            "questiongame-premigrate-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join("questiongame.sqlite3");
        let behind = MIGRATIONS.len() as u32 - 1;
        {
            // A library one step behind, stamped by this very build, so the
            // pending migration is the only reason to copy it.
            let conn = Connection::open(&path).unwrap();
            for step in &MIGRATIONS[..behind as usize] {
                conn.execute_batch(step).unwrap();
            }
            conn.execute_batch(&format!("PRAGMA user_version = {behind}")).unwrap();
            super::super::store::global_set(&conn, META_LAST_OPENED, "\"1.0.2\"").unwrap();
        }

        let options = OpenOptions {
            app_version: "1.0.2".to_string(),
            backup_dir: dir.join("backups"),
            keep: 5,
            stamp: "20261018-120000".to_string(),
        };
        let (conn, report) = open_guarded(&path, &options).unwrap();
        let version = |c: &Connection| -> u32 {
            c.pragma_query_value(None, "user_version", |row| row.get(0)).unwrap()
        };
        assert_eq!(version(&conn), MIGRATIONS.len() as u32);
        let backup = report.backup.expect("a backup before migrating");
        assert_eq!(version(&Connection::open(&backup).unwrap()), behind);

        drop(conn);
        let _ = std::fs::remove_dir_all(&dir);
    }
}
