//! Migration 6 (beta.2): the shared library goes, and nothing anyone could see
//! goes with it. A beta.1 library is built the way a beta.1 build left it:
//! written at step 5, then rows placed in the shared library or another
//! workspace by hand — no beta.1 binary needed.

use std::path::PathBuf;

use questiongame_host::catalog::db::{place_for_test, write_older_schema};
use questiongame_host::catalog::{
    Asset, BoardDomain, CatalogItem, CatalogLocation, CatalogService, CopyOptions, Domain,
    DomainMember, OpenOptions, Question, QuestionOption, Recipe, Selection, Team, TeamOverlay,
};
use questiongame_host::flags::{FlagService, GameSettings};
use questiongame_host::{
    AssetId, DomainId, MatchService, PlayId, QuestionId, RecipeId, TeamId, WorkspaceId,
};
use rusqlite::{Connection, OptionalExtension, params};

const NOW: u64 = 1_790_000_000_000;

struct Fixture {
    dir: PathBuf,
    ws1: String,
    b: String,
    c: String,
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = std::fs::remove_dir_all(&self.dir);
    }
}

impl Fixture {
    fn library(&self) -> PathBuf {
        self.dir.join("questiongame.sqlite3")
    }
    fn open(&self) -> CatalogService {
        CatalogService::open_file(
            &self.library(),
            &OpenOptions {
                app_version: "2.0.0-beta.2".into(),
                backup_dir: self.dir.join("backups"),
                keep: 5,
                stamp: "20261022-120000".into(),
            },
        )
        .unwrap()
        .0
    }
    fn sql(&self) -> Connection {
        Connection::open(self.library()).unwrap()
    }
}

fn question(id: &str, difficulty: u8, tags: &[&str]) -> Question {
    let mut q = Question::new(id, format!("Question {id}"), difficulty);
    q.options = vec![
        QuestionOption::new(format!("{id}-a"), "Yes", true),
        QuestionOption::new(format!("{id}-b"), "No", false),
    ];
    q.tags = tags.iter().map(|t| t.to_string()).collect();
    q
}
fn members(ids: &[&str]) -> Vec<DomainMember> {
    ids.iter()
        .enumerate()
        .map(|(i, q)| DomainMember {
            question_id: QuestionId::from(*q),
            sort_key: i as i64,
            group_id: None,
        })
        .collect()
}
fn upsert(c: &CatalogService, item: impl Into<CatalogItem>) {
    c.catalog_upsert(&item.into(), NOW).unwrap();
}

/// ws-1 (oldest), B, and C (archived). Shared in beta.1: asset `as1`, questions
/// `qs` `qs2` `qa` (archived) `qf`, team `ts`, domain `ds` (with a group). B
/// holds `qf2` (a copy of `qf`, same family), `qb`, `qx`, team `tb`, domain `dlb`
/// and game `rb` (whose board is already broken). ws-1 holds `dl1` and game `r1`
/// with an overlay naming `as1`, and a Play of `r1`.
fn beta1(tag: &str) -> Fixture {
    let dir = std::env::temp_dir().join(format!("qg-unshare-{tag}-{}-{}", std::process::id(), NOW));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let newer = dir.join("newer.sqlite3");
    let (ws1, b, c);
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        ws1 = s.current_workspace().to_string();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
        c = s.workspace_create("C", None, NOW).unwrap().id.to_string();
        upsert(&s, Asset::new("as1", "logo.png", "image"));
        let mut qs = question("qs", 10, &["Christmas"]);
        qs.media_asset_id = Some(AssetId::from("as1"));
        qs.stamps.created_at = 1;
        upsert(&s, qs);
        for (id, d) in [("qs2", 20), ("qa", 30), ("qf", 40), ("qb", 30), ("qx", 10)] {
            upsert(
                &s,
                question(id, d, if id == "qb" { &["CHRISTMAS"] } else { &[] }),
            );
        }
        let mut ts = Team::new("ts", "Shared team", "SH");
        ts.logo_asset_id = Some(AssetId::from("as1"));
        upsert(&s, ts);
        upsert(&s, Team::new("tl", "Local team", "LO"));
        upsert(&s, Team::new("tb", "B team", "BB"));
        let mut ds = Domain::new("ds", "Biblie", "BIB");
        ds.questions = members(&["qs", "qs2", "qa"]);
        upsert(&s, ds);
        let g = s
            .domain_group_create(&DomainId::from("ds"), "Kings", NOW)
            .unwrap();
        let CatalogItem::Domain(mut ds) = s
            .catalog_get(questiongame_host::catalog::CatalogKind::Domain, "ds")
            .unwrap()
        else {
            panic!()
        };
        ds.questions[0].group_id = Some(g.id.clone());
        upsert(&s, *ds);
        let mut dl1 = Domain::new("dl1", "Local", "LOC");
        dl1.questions = members(&["qs", "qf"]);
        upsert(&s, dl1);
        let mut dlb = Domain::new("dlb", "B domain", "BDO");
        dlb.questions = members(&["qs", "qb", "qx"]);
        upsert(&s, dlb);

        let mut r1 = Recipe::new("r1", "Game one", GameSettings::default());
        r1.teams = vec![TeamId::from("ts"), TeamId::from("tl")];
        r1.board = vec![BoardDomain {
            domain_id: DomainId::from("ds"),
            question_ids: vec![QuestionId::from("qs"), QuestionId::from("qs2")],
        }];
        r1.overlays.teams.insert(
            TeamId::from("ts"),
            TeamOverlay {
                logo_asset_id: Some(AssetId::from("as1")),
                ..TeamOverlay::default()
            },
        );
        s.recipe_upsert(&r1, NOW).unwrap();
        let mut rb = Recipe::new("rb", "Game B", GameSettings::default());
        rb.teams = vec![TeamId::from("ts"), TeamId::from("tb")];
        rb.board = vec![BoardDomain {
            domain_id: DomainId::from("dlb"),
            question_ids: vec![QuestionId::from("qs"), QuestionId::from("qb")],
        }];
        s.recipe_upsert(&rb, NOW).unwrap();

        // qf's copy in B: one family before beta.1 shared the original.
        s.catalog_copy_to(
            &Selection {
                questions: vec![QuestionId::from("qf")],
                ..Selection::default()
            },
            &WorkspaceId::from(b.as_str()),
            CopyOptions::default(),
            NOW,
        )
        .unwrap();
        s.catalog_archive(questiongame_host::catalog::CatalogKind::Question, "qa", NOW)
            .unwrap();
        s.workspace_archive(&WorkspaceId::from(c.as_str()), NOW)
            .unwrap();

        // A Play of r1, so its events can be compared.
        let mut flags = FlagService::default();
        flags.load_recipe(GameSettings::default()).unwrap();
        let snapshot = s
            .build_snapshot(
                &RecipeId::from("r1"),
                PlayId::from("play-1"),
                flags.freeze().unwrap(),
            )
            .unwrap();
        let mut play = MatchService::new();
        play.play_load(snapshot, 0).unwrap();
        play.play_start(0).unwrap();
        s.play_persist(play.get_state().unwrap()).unwrap();
    }
    let lib = dir.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    for (table, id) in [
        ("assets", "as1"),
        ("questions", "qs"),
        ("questions", "qs2"),
        ("questions", "qa"),
        ("questions", "qf"),
        ("teams", "ts"),
        ("domains", "ds"),
    ] {
        place_for_test(&lib, table, id, None).unwrap();
    }
    for (table, id) in [
        ("questions", "qb"),
        ("questions", "qx"),
        ("teams", "tb"),
        ("domains", "dlb"),
        ("recipes", "rb"),
    ] {
        place_for_test(&lib, table, id, Some(&b)).unwrap();
    }
    // rb's board already broken in beta.1: two questions of one difficulty in one domain.
    Connection::open(&lib)
        .unwrap()
        .execute("INSERT INTO recipe_questions (recipe_id, domain_id, question_id, position) VALUES ('rb', 'dlb', 'qx', 9)", [])
        .unwrap();
    Fixture { dir, ws1, b, c }
}

fn one(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> Option<String> {
    conn.query_row(sql, p, |row| row.get(0)).optional().unwrap()
}
fn n(conn: &Connection, sql: &str, p: &[&dyn rusqlite::ToSql]) -> i64 {
    conn.query_row(sql, p, |row| row.get(0)).unwrap()
}
/// The row of `old`'s family in `ws`.
fn in_ws(conn: &Connection, table: &str, old: &str, ws: &str) -> String {
    one(
        conn,
        &format!("SELECT id FROM {table} WHERE workspace_id = ?1 AND family_id = (SELECT family_id FROM {table} WHERE id = ?2)"),
        &[&ws, &old],
    )
    .unwrap_or_else(|| panic!("{table} {old} has no member in {ws}"))
}

#[test]
fn u01_the_oldest_workspace_keeps_the_id_and_every_other_gets_one_linked_row() {
    let f = beta1("u01");
    drop(f.open());
    let db = f.sql();
    assert_eq!(
        one(
            &db,
            "SELECT workspace_id FROM questions WHERE id = 'qs'",
            &[]
        )
        .as_deref(),
        Some(f.ws1.as_str())
    );
    for ws in [&f.b, &f.c] {
        let copy = in_ws(&db, "questions", "qs", ws);
        assert_ne!(copy, "qs");
        assert_eq!(
            n(
                &db,
                "SELECT count(*) FROM question_options WHERE question_id = ?1",
                &[&copy]
            ),
            2
        );
    }
    // B's own domain now holds B's row, not the one that went to ws-1.
    let qs_b = in_ws(&db, "questions", "qs", &f.b);
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM domain_questions WHERE domain_id = 'dlb' AND question_id = ?1",
            &[&qs_b]
        ),
        1
    );
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM domain_questions WHERE domain_id = 'dlb' AND question_id = 'qs'",
            &[]
        ),
        0
    );
}

#[test]
fn u02_a_shared_domain_is_copied_with_its_groups_and_its_members_mapped() {
    let f = beta1("u02");
    drop(f.open());
    let db = f.sql();
    let ds_b = in_ws(&db, "domains", "ds", &f.b);
    let qs_b = in_ws(&db, "questions", "qs", &f.b);
    let group = one(
        &db,
        "SELECT group_id FROM domain_questions WHERE domain_id = ?1 AND question_id = ?2",
        &[&ds_b, &qs_b],
    )
    .expect("a member, grouped");
    assert_eq!(
        one(
            &db,
            "SELECT domain_id FROM domain_groups WHERE id = ?1",
            &[&group]
        )
        .as_deref(),
        Some(ds_b.as_str())
    );
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM domain_questions WHERE domain_id = ?1",
            &[&ds_b]
        ),
        3
    );
    // ws-1's domain kept its own group.
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM domain_groups WHERE domain_id = 'ds'",
            &[]
        ),
        1
    );
}

#[test]
fn u03_u04_each_roster_overlay_logo_and_media_names_its_workspaces_row() {
    let f = beta1("u03");
    drop(f.open());
    let db = f.sql();
    let ts_b = in_ws(&db, "teams", "ts", &f.b);
    let as_b = in_ws(&db, "assets", "as1", &f.b);
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM recipe_teams WHERE recipe_id = 'rb' AND team_id = ?1",
            &[&ts_b]
        ),
        1
    );
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM recipe_teams WHERE recipe_id = 'r1' AND team_id = 'ts'",
            &[]
        ),
        1
    );
    assert_eq!(
        one(
            &db,
            "SELECT logo_asset_id FROM teams WHERE id = ?1",
            &[&ts_b]
        )
        .as_deref(),
        Some(as_b.as_str())
    );
    let qs_b = in_ws(&db, "questions", "qs", &f.b);
    assert_eq!(
        one(
            &db,
            "SELECT media_asset_id FROM questions WHERE id = ?1",
            &[&qs_b]
        )
        .as_deref(),
        Some(as_b.as_str())
    );
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM recipe_questions WHERE recipe_id = 'rb' AND question_id = ?1",
            &[&qs_b]
        ),
        1
    );
    // ws-1's game overlay still names ws-1's asset.
    let patch = one(
        &db,
        "SELECT patch_json FROM recipe_overlays WHERE recipe_id = 'r1' AND target_id = 'ts'",
        &[],
    )
    .unwrap();
    assert!(patch.contains("\"as1\""), "{patch}");
}

#[test]
fn u05_u11_archived_rows_arrive_archived_and_an_archived_workspace_gets_its_rows() {
    let f = beta1("u05");
    drop(f.open());
    let db = f.sql();
    for ws in [&f.b, &f.c] {
        let qa = in_ws(&db, "questions", "qa", ws);
        assert_eq!(
            n(
                &db,
                "SELECT archived_at IS NOT NULL FROM questions WHERE id = ?1",
                &[&qa]
            ),
            1,
            "{ws}"
        );
    }
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM teams WHERE workspace_id = ?1",
            &[&f.c]
        ),
        1,
        "C sees ts"
    );
}

#[test]
fn u06_a_family_member_already_in_the_workspace_is_reused_not_twinned() {
    let f = beta1("u06");
    drop(f.open());
    let db = f.sql();
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM questions WHERE workspace_id = ?1 AND family_id = (SELECT family_id FROM questions WHERE id = 'qf')",
            &[&f.b]
        ),
        1
    );
    // Nowhere does a workspace hold two rows of one family.
    for table in ["teams", "domains", "questions", "assets"] {
        assert_eq!(
            n(
                &db,
                &format!(
                    "SELECT count(*) FROM (SELECT 1 FROM {table} WHERE family_id IS NOT NULL GROUP BY workspace_id, family_id HAVING count(*) > 1)"
                ),
                &[]
            ),
            0,
            "{table}"
        );
    }
}

#[test]
fn u08_boards_load_as_before_and_a_board_already_broken_stays_broken() {
    let f = beta1("u08");
    let s = f.open();
    let frozen = || {
        let mut flags = FlagService::default();
        flags.load_recipe(GameSettings::default()).unwrap();
        flags.freeze().unwrap()
    };
    s.build_snapshot(&RecipeId::from("r1"), PlayId::from("p-a"), frozen())
        .expect("ws-1's game loads");
    s.workspace_switch(&WorkspaceId::from(f.b.as_str()))
        .unwrap();
    let err = s
        .build_snapshot(&RecipeId::from("rb"), PlayId::from("p-b"), frozen())
        .expect_err("already broken in beta.1");
    assert!(err.to_string().contains("difficulty"), "{err}");
}

#[test]
fn u09_tags_take_one_spelling_within_each_workspace() {
    let f = beta1("u09");
    drop(f.open());
    let db = f.sql();
    let spellings = |ws: &str| -> Vec<String> {
        let mut stmt = db
            .prepare("SELECT DISTINCT qt.tag FROM question_tags qt JOIN questions q ON q.id = qt.question_id WHERE q.workspace_id = ?1 AND qt.tag_key = 'christmas'")
            .unwrap();
        stmt.query_map(params![ws], |r| r.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect()
    };
    assert_eq!(spellings(&f.ws1), ["Christmas"]);
    assert_eq!(spellings(&f.b).len(), 1, "B: {:?}", spellings(&f.b));
    assert_eq!(
        spellings(&f.b),
        ["Christmas"],
        "qs (created first) wins in B too"
    );
}

#[test]
fn u10_no_row_is_shared_and_a_row_without_a_workspace_is_refused() {
    let f = beta1("u10");
    drop(f.open());
    let db = f.sql();
    for table in ["teams", "domains", "questions", "assets", "recipes"] {
        assert_eq!(
            n(
                &db,
                &format!("SELECT count(*) FROM {table} WHERE workspace_id IS NULL"),
                &[]
            ),
            0,
            "{table}"
        );
        let err = db.execute(&format!("UPDATE {table} SET workspace_id = NULL WHERE rowid = (SELECT min(rowid) FROM {table})"), []);
        if n(&db, &format!("SELECT count(*) FROM {table}"), &[]) > 0 {
            assert!(
                err.unwrap_err()
                    .to_string()
                    .contains("lives in a workspace"),
                "{table}"
            );
        }
    }
    assert_eq!(n(&db, "PRAGMA user_version", &[]), 6);
}

#[test]
fn u12_plays_and_events_are_untouched() {
    let f = beta1("u12");
    let before = {
        let db = f.sql();
        (
            n(&db, "SELECT count(*) FROM events", &[]),
            one(
                &db,
                "SELECT group_concat(kind_json, '|') FROM (SELECT kind_json FROM events ORDER BY play_id, seq)",
                &[],
            ),
        )
    };
    drop(f.open());
    let db = f.sql();
    assert_eq!(n(&db, "SELECT count(*) FROM events", &[]), before.0);
    assert_eq!(
        one(
            &db,
            "SELECT group_concat(kind_json, '|') FROM (SELECT kind_json FROM events ORDER BY play_id, seq)",
            &[]
        ),
        before.1
    );
}

#[test]
fn u13_a_library_with_nothing_shared_only_gains_the_rule() {
    let dir = std::env::temp_dir().join(format!("qg-unshare-u13-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let newer = dir.join("newer.sqlite3");
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        upsert(&s, question("q1", 10, &[]));
    }
    let lib = dir.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    let before = n(
        &Connection::open(&lib).unwrap(),
        "SELECT count(*) FROM questions",
        &[],
    );
    drop(CatalogService::open(CatalogLocation::file(&lib)).unwrap());
    let db = Connection::open(&lib).unwrap();
    assert_eq!(n(&db, "SELECT count(*) FROM questions", &[]), before);
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM sqlite_master WHERE type = 'trigger' AND name LIKE '%_has_workspace_%'",
            &[]
        ),
        10
    );
    let _ = std::fs::remove_dir_all(&dir);
}

#[test]
fn u14_a_failure_inside_step_6_leaves_the_library_at_5_with_its_backup() {
    let f = beta1("u14");
    // A row that cannot be copied: a question naming an option table row twice
    // is impossible, so break the step another way — a domain member whose
    // question vanished trips the foreign key when the copy writes it.
    let db = f.sql();
    db.execute_batch("PRAGMA foreign_keys = OFF; INSERT INTO domain_questions (domain_id, question_id, sort_key) VALUES ('ds', 'ghost', 99);").unwrap();
    drop(db);
    let result = CatalogService::open_file(
        &f.library(),
        &OpenOptions {
            app_version: "2.0.0-beta.2".into(),
            backup_dir: f.dir.join("backups"),
            keep: 5,
            stamp: "20261022-120000".into(),
        },
    );
    assert!(result.is_err());
    let db = f.sql();
    assert_eq!(n(&db, "PRAGMA user_version", &[]), 5);
    assert_eq!(
        n(
            &db,
            "SELECT count(*) FROM questions WHERE workspace_id IS NULL",
            &[]
        ),
        4,
        "nothing half-done"
    );
    assert!(std::fs::read_dir(f.dir.join("backups")).unwrap().count() >= 1);
}

#[test]
fn r4_a_member_whose_difficulty_drifted_is_not_reused_so_boards_keep_what_they_asked() {
    let f = beta1("r4");
    // B's copy of qf was re-graded after the copy: reusing it could change a board.
    f.sql().execute("UPDATE questions SET difficulty = 77 WHERE workspace_id = ?1 AND family_id = (SELECT family_id FROM questions WHERE id = 'qf')", params![f.b]).unwrap();
    drop(f.open());
    let db = f.sql();
    let mut stmt = db
        .prepare("SELECT difficulty FROM questions WHERE workspace_id = ?1 AND family_id = (SELECT family_id FROM questions WHERE id = 'qf') ORDER BY difficulty")
        .unwrap();
    let found: Vec<i64> = stmt
        .query_map(params![f.b], |r| r.get(0))
        .unwrap()
        .map(|r| r.unwrap())
        .collect();
    assert_eq!(found, [40, 77], "a fresh copy beside the drifted one");
}

#[test]
fn r5_a_shared_demo_becomes_each_workspaces_own_demo() {
    use questiongame_host::catalog::{Demo, SeedMode};
    let dir = std::env::temp_dir().join(format!("qg-unshare-r5-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    let newer = dir.join("newer.sqlite3");
    let b;
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        s.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW)
            .unwrap();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
    }
    let lib = dir.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    let rows: Vec<(String, String)> = {
        let db = Connection::open(&lib).unwrap();
        let mut out = Vec::new();
        for table in ["teams", "domains", "questions"] {
            let mut stmt = db
                .prepare(&format!("SELECT id FROM {table} WHERE id LIKE 'seed-%'"))
                .unwrap();
            out.extend(
                stmt.query_map([], |r| r.get::<_, String>(0))
                    .unwrap()
                    .map(|r| (table.to_owned(), r.unwrap())),
            );
        }
        out
    };
    for (table, id) in &rows {
        place_for_test(&lib, table, id, None).unwrap();
    }
    let s = CatalogService::open(CatalogLocation::file(&lib)).unwrap();
    s.workspace_switch(&WorkspaceId::from(b.as_str())).unwrap();
    let status = s.seed_status(Demo::En, GameSettings::default()).unwrap();
    assert_eq!(
        status.missing, 1,
        "only the game, which was never shared: {status:?}"
    );
    drop(s);
    let _ = std::fs::remove_dir_all(&dir);
}
