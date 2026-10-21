//! The beta.2 host review (Opus, 2026-10-21): each finding pinned.

use std::path::PathBuf;
use questiongame_host::catalog::db::{place_for_test, write_older_schema};
use questiongame_host::catalog::{ArchiveScope, CopyOptions, CatalogLocation, CatalogService, Domain, DomainMember, OpenOptions, Question, QuestionOption, Recipe, Selection, Team, CatalogKind, Demo, SeedMode};
use questiongame_host::flags::GameSettings;
use questiongame_host::{QuestionId, TeamId, WorkspaceId, RecipeId};
use rusqlite::Connection;

const NOW: u64 = 1_790_000_000_000;

fn dir(tag: &str) -> PathBuf {
    let d = std::env::temp_dir().join(format!("qg-zz-{tag}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&d);
    std::fs::create_dir_all(&d).unwrap();
    d
}
fn opts(d: &std::path::Path) -> OpenOptions {
    OpenOptions { app_version: "2.0.0-beta.2".into(), backup_dir: d.join("backups"), keep: 5, stamp: "20261022-120000".into() }
}
fn q(id: &str, diff: u8) -> Question {
    let mut q = Question::new(id, format!("Q {id}"), diff);
    q.options = vec![QuestionOption::new(format!("{id}-a"), "Y", true), QuestionOption::new(format!("{id}-b"), "N", false)];
    q
}

/// Two shared teams of one family (a copy made, then both shared), and a game in B whose roster holds both.
#[test]
fn review_z1_two_shared_family_members_on_one_roster() {
    let d = dir("z1");
    let newer = d.join("newer.sqlite3");
    let b;
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
        s.catalog_upsert(&Team::new("t1", "Red", "RED").into(), NOW).unwrap();
        s.catalog_copy_to(&Selection { teams: vec![TeamId::from("t1")], ..Selection::default() }, &WorkspaceId::from(b.as_str()), CopyOptions::default(), NOW).unwrap();
        s.catalog_upsert(&Team::new("t3", "Other", "OTH").into(), NOW).unwrap();
        let mut r = Recipe::new("rb", "Game B", GameSettings::default());
        r.teams = vec![TeamId::from("t1"), TeamId::from("t3")];
        s.recipe_upsert(&r, NOW).unwrap();
    }
    let lib = d.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    let c = Connection::open(&lib).unwrap();
    let t2: String = c.query_row("SELECT id FROM teams WHERE workspace_id = ?1", [&b], |r| r.get(0)).unwrap();
    drop(c);
    place_for_test(&lib, "teams", "t1", None).unwrap();
    place_for_test(&lib, "teams", &t2, None).unwrap();
    place_for_test(&lib, "teams", "t3", None).unwrap();
    place_for_test(&lib, "recipes", "rb", Some(&b)).unwrap();
    let c = Connection::open(&lib).unwrap();
    c.execute("UPDATE recipe_teams SET team_id = ?1 WHERE recipe_id = 'rb' AND team_id = 't3'", [&t2]).unwrap();
    drop(c);
    let r = CatalogService::open_file(&lib, &opts(&d));
    if let Err(e) = &r {
        panic!("library failed to open: {e:?}");
    }
    let c = Connection::open(&lib).unwrap();
    let n: i64 = c.query_row("SELECT count(*) FROM recipe_teams WHERE recipe_id = 'rb'", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 2, "roster lost a team");
}

/// Same with questions: two shared same-family, same-shape questions in one B domain.
#[test]
fn review_z2_two_shared_family_questions_in_one_domain() {
    let d = dir("z2");
    let newer = d.join("newer.sqlite3");
    let b;
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
        s.catalog_upsert(&q("q1", 10).into(), NOW).unwrap();
        s.catalog_copy_to(&Selection { questions: vec![QuestionId::from("q1")], ..Selection::default() }, &WorkspaceId::from(b.as_str()), CopyOptions::default(), NOW).unwrap();
        s.catalog_upsert(&q("q3", 20).into(), NOW).unwrap();
        let mut dm = Domain::new("dm", "D", "DDD");
        dm.questions = vec![DomainMember { question_id: QuestionId::from("q1"), sort_key: 0, group_id: None }, DomainMember { question_id: QuestionId::from("q3"), sort_key: 1, group_id: None }];
        s.catalog_upsert(&dm.into(), NOW).unwrap();
    }
    let lib = d.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    let c = Connection::open(&lib).unwrap();
    let q2: String = c.query_row("SELECT id FROM questions WHERE workspace_id = ?1", [&b], |r| r.get(0)).unwrap();
    drop(c);
    place_for_test(&lib, "questions", "q1", None).unwrap();
    place_for_test(&lib, "questions", &q2, None).unwrap();
    place_for_test(&lib, "questions", "q3", None).unwrap();
    place_for_test(&lib, "domains", "dm", Some(&b)).unwrap();
    let c = Connection::open(&lib).unwrap();
    c.execute("UPDATE domain_questions SET question_id = ?1 WHERE domain_id = 'dm' AND question_id = 'q3'", [&q2]).unwrap();
    drop(c);
    CatalogService::open_file(&lib, &opts(&d)).unwrap();
    let c = Connection::open(&lib).unwrap();
    let n: i64 = c.query_row("SELECT count(*) FROM domain_questions WHERE domain_id = 'dm'", [], |r| r.get(0)).unwrap();
    assert_eq!(n, 2, "domain lost a question");
}

/// Duplicate a workspace holding two Demo generations.
#[test]
fn review_z3_duplicate_two_demo_generations() {
    let d = dir("z3");
    let s = CatalogService::open(CatalogLocation::file(d.join("lib.sqlite3"))).unwrap();
    let b = s.workspace_create("B", None, NOW).unwrap().id;
    s.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let sel = Selection { recipes: vec![RecipeId::from("seed-recipe-demo")], ..Selection::default() };
    s.catalog_move_to(&sel, &b, NOW).unwrap();
    s.workspace_switch(&b).unwrap();
    s.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let before = s.catalog_list(CatalogKind::Team, ArchiveScope::All).unwrap().len();
    let qb = s.catalog_list(CatalogKind::Question, ArchiveScope::All).unwrap().len();
    let dup = s.workspace_duplicate(&b, "B copy", NOW);
    let dup = dup.unwrap();
    s.workspace_switch(&dup.id).unwrap();
    let after = s.catalog_list(CatalogKind::Team, ArchiveScope::All).unwrap().len();
    let qa = s.catalog_list(CatalogKind::Question, ArchiveScope::All).unwrap().len();
    assert_eq!((before, qb), (after, qa));
}

/// Duplicate ws-1 with its Demo: is the copy recognised and unedited?
#[test]
fn review_z4_duplicate_demo_is_unedited() {
    let d = dir("z4");
    let s = CatalogService::open(CatalogLocation::file(d.join("lib.sqlite3"))).unwrap();
    s.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    let ws1 = s.current_workspace();
    let dup = s.workspace_duplicate(&ws1, "Copy", NOW).unwrap();
    s.workspace_switch(&dup.id).unwrap();
    let st = s.seed_status(Demo::En, GameSettings::default()).unwrap();
    assert_eq!(st.edited, 0);
    assert_eq!(st.missing, 0);
}

/// Migration 6: a shared Demo copied into B — recognised and unedited?
#[test]
fn review_z5_migrated_demo_copy_is_unedited() {
    let d = dir("z5");
    let newer = d.join("newer.sqlite3");
    let b;
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
        s.seed_demo(Demo::En, SeedMode::Missing, GameSettings::default(), NOW).unwrap();
    }
    let lib = d.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    let mut ids = vec![];
    {
        let c = Connection::open(&lib).unwrap();
        for t in ["teams", "domains", "questions"] {
            let mut st = c.prepare(&format!("SELECT id FROM {t}")).unwrap();
            for id in st.query_map([], |r| r.get::<_, String>(0)).unwrap() { ids.push((t, id.unwrap())); }
        }
    }
    for (t, id) in &ids { place_for_test(&lib, t, id, None).unwrap(); }
    let (s, _) = CatalogService::open_file(&lib, &opts(&d)).unwrap();
    s.workspace_switch(&WorkspaceId::from(b.as_str())).unwrap();
    let st = s.seed_status(Demo::En, GameSettings::default()).unwrap();
    assert_eq!(st.edited, 0, "migrated copies read as edited");
}

/// Copy a game whose team overlay shows a logo, into a workspace that already holds its domain.
#[test]
fn review_z6_overlay_logo_survives_a_reused_domain() {
    use questiongame_host::catalog::{Asset, BoardDomain, TeamOverlay};
    use questiongame_host::{AssetId, DomainId};
    let d = dir("z6");
    let s = CatalogService::open(CatalogLocation::file(d.join("lib.sqlite3"))).unwrap();
    let b = s.workspace_create("B", None, NOW).unwrap().id;
    s.catalog_upsert(&Asset::new("a1", "logo.png", "image").into(), NOW).unwrap();
    s.catalog_upsert(&Team::new("t1", "Red", "RED").into(), NOW).unwrap();
    s.catalog_upsert(&q("q1", 10).into(), NOW).unwrap();
    let mut dm = Domain::new("d1", "D", "DDD");
    dm.questions = vec![DomainMember { question_id: QuestionId::from("q1"), sort_key: 0, group_id: None }];
    s.catalog_upsert(&dm.into(), NOW).unwrap();
    let mut r = Recipe::new("r1", "G", GameSettings::default());
    r.teams = vec![TeamId::from("t1")];
    r.board = vec![BoardDomain { domain_id: DomainId::from("d1"), question_ids: vec![QuestionId::from("q1")] }];
    r.overlays.teams.insert(TeamId::from("t1"), TeamOverlay { logo_asset_id: Some(AssetId::from("a1")), ..TeamOverlay::default() });
    s.recipe_upsert(&r, NOW).unwrap();
    s.catalog_copy_to(&Selection { domains: vec![DomainId::from("d1")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    let rep = s.catalog_copy_to(&Selection { recipes: vec![RecipeId::from("r1")], ..Selection::default() }, &b, CopyOptions::default(), NOW).unwrap();
    let c = Connection::open(d.join("lib.sqlite3")).unwrap();
    let new_recipe = &rep.created.iter().find(|t| t.kind == CatalogKind::Recipe).unwrap().id;
    let patch: String = c.query_row("SELECT patch_json FROM recipe_overlays WHERE recipe_id = ?1 AND target_kind = 'team'", [new_recipe], |r| r.get(0)).unwrap();
    let asset_ws: Option<String> = c.query_row("SELECT a.workspace_id FROM assets a WHERE a.id = json_extract(?1, '$.logoAssetId')", [&patch], |r| r.get(0)).unwrap();
    assert_eq!(asset_ws.as_deref(), Some(b.as_str()), "overlay logo points outside B");
}

/// A shared domain B already had an older copy of: reused, and what was added since lands in no domain.
#[test]
fn review_z7_reused_domain_drops_members_added_since() {
    use questiongame_host::DomainId;
    let d = dir("z7");
    let newer = d.join("newer.sqlite3");
    let b;
    {
        let s = CatalogService::open(CatalogLocation::file(&newer)).unwrap();
        b = s.workspace_create("B", None, NOW).unwrap().id.to_string();
        s.catalog_upsert(&q("q1", 10).into(), NOW).unwrap();
        let mut dm = Domain::new("d1", "Biblie", "BIB");
        dm.questions = vec![DomainMember { question_id: QuestionId::from("q1"), sort_key: 0, group_id: None }];
        s.catalog_upsert(&dm.clone().into(), NOW).unwrap();
        s.catalog_copy_to(&Selection { domains: vec![DomainId::from("d1")], ..Selection::default() }, &WorkspaceId::from(b.as_str()), CopyOptions::default(), NOW).unwrap();
        s.catalog_upsert(&q("q2", 20).into(), NOW).unwrap();
        dm.questions.push(DomainMember { question_id: QuestionId::from("q2"), sort_key: 1, group_id: None });
        s.catalog_upsert(&dm.into(), NOW).unwrap();
    }
    let lib = d.join("questiongame.sqlite3");
    write_older_schema(&newer, &lib, 5).unwrap();
    for (t, id) in [("domains", "d1"), ("questions", "q1"), ("questions", "q2")] { place_for_test(&lib, t, id, None).unwrap(); }
    CatalogService::open_file(&lib, &opts(&d)).unwrap();
    let c = Connection::open(&lib).unwrap();
    let q2b: String = c.query_row("SELECT id FROM questions WHERE workspace_id = ?1 AND family_id = (SELECT family_id FROM questions WHERE id='q2')", [&b], |r| r.get(0)).unwrap();
    let _doms: i64 = c.query_row("SELECT count(*) FROM domains WHERE workspace_id = ?1", [&b], |r| r.get(0)).unwrap();
    let held: i64 = c.query_row("SELECT count(*) FROM domain_questions WHERE question_id = ?1", [&q2b], |r| r.get(0)).unwrap();
    assert!(held >= 1, "q2 in B sits in no domain (B saw it in Biblie before)");
}
