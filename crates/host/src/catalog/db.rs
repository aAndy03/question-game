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
    // 4 — Beta 2.0: workspaces. One file holds several libraries and a shared
    // one. A library row's `workspace_id` is the workspace it lives in, `NULL`
    // is the shared library; a game always lives in one. `family_id` ties a
    // row to the rows copied from it (and to the row it was copied from).
    //
    // Every library has a workspace: what was there before moves into one
    // **unnamed** workspace, and Studio asks the operator to name it — nothing
    // suggests a name. An empty library gets the same unnamed workspace, so a
    // fresh install and a migrated one take the same path.
    r#"
    CREATE TABLE workspace_groups (
        id         TEXT PRIMARY KEY,
        name       TEXT NOT NULL,
        sort_key   INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );

    CREATE TABLE workspaces (
        id            TEXT PRIMARY KEY,
        name          TEXT,
        group_id      TEXT REFERENCES workspace_groups(id) ON DELETE SET NULL,
        sort_key      INTEGER NOT NULL,
        settings_json TEXT,
        created_at    INTEGER NOT NULL,
        updated_at    INTEGER NOT NULL,
        archived_at   INTEGER
    );
    INSERT INTO workspaces (id, name, group_id, sort_key, settings_json, created_at, updated_at)
    VALUES ('ws-1', NULL, NULL, 0, NULL, 0, 0);

    ALTER TABLE teams     ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    ALTER TABLE domains   ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    ALTER TABLE questions ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    ALTER TABLE assets    ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    ALTER TABLE recipes   ADD COLUMN workspace_id TEXT REFERENCES workspaces(id);
    ALTER TABLE teams     ADD COLUMN family_id INTEGER;
    ALTER TABLE domains   ADD COLUMN family_id INTEGER;
    ALTER TABLE questions ADD COLUMN family_id INTEGER;
    ALTER TABLE assets    ADD COLUMN family_id INTEGER;
    ALTER TABLE recipes   ADD COLUMN family_id INTEGER;

    UPDATE teams     SET workspace_id = 'ws-1';
    UPDATE domains   SET workspace_id = 'ws-1';
    UPDATE questions SET workspace_id = 'ws-1';
    UPDATE assets    SET workspace_id = 'ws-1';
    UPDATE recipes   SET workspace_id = 'ws-1';

    CREATE INDEX teams_by_workspace     ON teams(workspace_id);
    CREATE INDEX domains_by_workspace   ON domains(workspace_id);
    CREATE INDEX questions_by_workspace ON questions(workspace_id);
    CREATE INDEX assets_by_workspace    ON assets(workspace_id);
    CREATE INDEX recipes_by_workspace   ON recipes(workspace_id);
    CREATE INDEX teams_by_family        ON teams(family_id);
    CREATE INDEX domains_by_family      ON domains(family_id);
    CREATE INDEX questions_by_family    ON questions(family_id);
    CREATE INDEX assets_by_family       ON assets(family_id);

    INSERT INTO globals (key, value_json) VALUES ('workspace.current', '"ws-1"')
    ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
    "#,
];

/// The step that introduced workspaces, 1-based like `user_version`. A file
/// that has not seen it gets the pinned backup ([`backup::PRE_WORKSPACES_LABEL`]).
pub(crate) const WORKSPACES_STEP: u32 = 4;

/// Test support: write `to` as the library `from` would look to a build that
/// knew only the first `steps` migrations — the same rows, the columns that
/// build had. How the upgrade tests get a 1.x library with a real Play log in
/// it without a 1.x binary.
#[doc(hidden)]
pub fn write_older_schema(from: &Path, to: &Path, steps: u32) -> CatalogResult<()> {
    let conn = Connection::open(to)?;
    for step in &MIGRATIONS[..steps as usize] {
        conn.execute_batch(step)?;
    }
    conn.execute_batch(&format!("PRAGMA user_version = {steps}"))?;
    conn.execute(
        "ATTACH DATABASE ?1 AS newer",
        [from.to_str().expect("a UTF-8 test path")],
    )?;
    let tables: Vec<String> = {
        let mut stmt = conn.prepare(
            "SELECT name FROM main.sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
        )?;
        stmt.query_map([], |row| row.get(0))?
            .collect::<rusqlite::Result<_>>()?
    };
    for table in tables {
        let columns: Vec<String> = {
            let mut stmt = conn.prepare(&format!("PRAGMA main.table_info({table})"))?;
            stmt.query_map([], |row| row.get::<_, String>(1))?
                .collect::<rusqlite::Result<_>>()?
        };
        let list = columns.join(", ");
        conn.execute_batch(&format!(
            "INSERT INTO main.{table} ({list}) SELECT {list} FROM newer.{table}"
        ))?;
    }
    conn.execute(
        "DELETE FROM main.globals WHERE key = ?1",
        [META_CURRENT_WORKSPACE],
    )?;
    conn.execute_batch("DETACH DATABASE newer")?;
    Ok(())
}

/// The global that names the workspace in use.
pub const META_CURRENT_WORKSPACE: &str = "workspace.current";

/// Point the connection at a workspace. Every scoped statement in `store`
/// reads the one row of the `current_ws` TEMP table, so the scope lives on the
/// single writer connection and no query can forget to pass it.
pub(crate) fn bind_workspace(conn: &Connection, id: &str) -> CatalogResult<()> {
    conn.execute_batch("CREATE TEMP TABLE IF NOT EXISTS current_ws (id TEXT NOT NULL)")?;
    conn.execute("DELETE FROM temp.current_ws", [])?;
    conn.execute(
        "INSERT INTO temp.current_ws (id) VALUES (?1)",
        rusqlite::params![id],
    )?;
    Ok(())
}

/// The workspace the library opens in: the one an open Play's game lives in
/// (it has to resume where it was), else the stored current one if it is
/// still active, else the first active one.
pub(crate) fn opening_workspace(conn: &Connection) -> CatalogResult<String> {
    use rusqlite::OptionalExtension;
    let open_play: Option<String> = conn
        .query_row(
            "SELECT r.workspace_id FROM plays p JOIN recipes r ON r.id = p.recipe_id
             WHERE p.status IN ('playing', 'paused') AND r.workspace_id IS NOT NULL
             ORDER BY p.started_at_ms LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = open_play {
        return Ok(id);
    }
    let stored = super::store::global_get(conn, META_CURRENT_WORKSPACE)?
        .and_then(|json| serde_json::from_str::<String>(&json).ok());
    if let Some(id) = stored {
        let active: Option<i64> = conn
            .query_row(
                "SELECT 1 FROM workspaces WHERE id = ?1 AND archived_at IS NULL",
                rusqlite::params![id],
                |row| row.get(0),
            )
            .optional()?;
        if active.is_some() {
            return Ok(id);
        }
    }
    conn.query_row(
        "SELECT id FROM workspaces WHERE archived_at IS NULL ORDER BY sort_key, created_at, id LIMIT 1",
        [],
        |row| row.get(0),
    )
    .optional()?
    .ok_or(CatalogError::NoWorkspace)
}

/// Open the writer connection and bring the schema up to date.
pub(crate) fn open(location: &CatalogLocation) -> CatalogResult<Connection> {
    let conn = match location {
        CatalogLocation::Memory => Connection::open_in_memory()?,
        CatalogLocation::File(path) => Connection::open(path)?,
    };
    apply_pragmas(&conn, location.is_memory())?;
    migrate(&conn)?;
    bind_workspace(&conn, &opening_workspace(&conn)?)?;
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
        // The copy before workspaces is pinned outside the rotation, so later
        // upgrades cannot push it out; it stands in for the usual copy.
        // One pinned copy: a boot that failed after taking it would otherwise
        // pin another full copy on every launch, and prune never removes them
        // (review). Later attempts take an ordinary, rotated copy.
        let pre_workspaces = applied < WORKSPACES_STEP && !backup::has_pinned(&options.backup_dir);
        if migrating || new_build {
            let label = if pre_workspaces {
                backup::PRE_WORKSPACES_LABEL
            } else {
                report
                    .previous_version
                    .as_deref()
                    .unwrap_or(UNSTAMPED_VERSION)
            };
            let taken = backup::write(&conn, &options.backup_dir, label, &options.stamp)?;
            // Now, not after a good open: a boot that fails past this point
            // (a newer schema, a failed migration) would otherwise leave one
            // more full copy per launch.
            backup::prune(&options.backup_dir, options.keep, &taken);
            report.backup = Some(taken);
        }
    }

    migrate(&conn)?;
    super::store::global_set(
        &conn,
        META_LAST_OPENED,
        &serde_json::to_string(&options.app_version)?,
    )?;
    bind_workspace(&conn, &opening_workspace(&conn)?)?;
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
