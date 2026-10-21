//! Migration 6 (beta.2): the shared library goes. Every row a workspace saw is
//! still there after it, as that workspace's own.
//!
//! A shared row (`workspace_id IS NULL`) keeps its id in the **oldest active
//! workspace that holds no member of its family** (the oldest active one if
//! every one does), so Plays and Statistics that name it still resolve there.
//! Every other workspace, archived ones too, gets it once: a member of the
//! row's family it already holds, when reusing it cannot change what the
//! workspace sees or plays — else a fresh copy in the same family (the
//! rulings R1–R5 in `docs/superpowers/plans/2026-10-21-remove-shared-library-tests.md`).
//! Then each workspace's references are pointed at its own row and its tags
//! re-spelled within it; the triggers that follow refuse a row without a
//! workspace from here on.
//!
//! Plain SQL over the schema as step 5 left it, not `store`: a migration must
//! read the same in every later build. Plays and events are never touched.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, OptionalExtension, params};

use super::error::{CatalogError, CatalogResult};
use super::workspace::fresh_id;

/// The library tables, in the order references point (an asset before the
/// question or team that shows it; a question before the domain that holds it).
const KINDS: [(&str, &str); 4] = [("assets", "asset"), ("questions", "q"), ("teams", "team"), ("domains", "dom")];

/// `(workspace, table, old id) → id in that workspace`.
type Map = BTreeMap<(String, &'static str, String), String>;

pub(crate) fn run(conn: &Connection) -> CatalogResult<()> {
    let workspaces: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM workspaces ORDER BY created_at, id")?;
        stmt.query_map([], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?
    };
    let active: Vec<String> = {
        let mut stmt = conn.prepare("SELECT id FROM workspaces WHERE archived_at IS NULL ORDER BY created_at, id")?;
        stmt.query_map([], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?
    };
    // R14: with no active workspace, the oldest of any state.
    let oldest = active.first().or(workspaces.first()).cloned().ok_or(CatalogError::NoWorkspace)?;

    let mut map: Map = BTreeMap::new();
    let mut copied_domains: Vec<(String, String, String)> = Vec::new(); // (workspace, original, copy)
    let mut reused_domains: Vec<(String, String, String)> = Vec::new(); // (workspace, shared, member)
    // A member stands in for one shared row only: two shared rows of one
    // family must not fold into one row there (review: a roster holding both
    // broke its key; a domain holding both lost one).
    let mut taken: BTreeSet<(String, &'static str, String)> = BTreeSet::new();
    // R5: each workspace's copies of a shared Demo take one free generation.
    let scopes = demo_scopes(conn, &workspaces)?;
    let mut next_family: i64 = conn.query_row(
        "SELECT COALESCE(MAX(f), 0) + 1 FROM (
             SELECT MAX(family_id) AS f FROM teams UNION ALL
             SELECT MAX(family_id) FROM domains UNION ALL
             SELECT MAX(family_id) FROM questions UNION ALL
             SELECT MAX(family_id) FROM assets UNION ALL
             SELECT MAX(family_id) FROM recipes)",
        [],
        |row| row.get(0),
    )?;

    for (table, prefix) in KINDS {
        let shared: Vec<(String, Option<i64>)> = {
            let mut stmt = conn.prepare(&format!("SELECT id, family_id FROM {table} WHERE workspace_id IS NULL ORDER BY id"))?;
            stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<rusqlite::Result<_>>()?
        };
        for (id, family) in shared {
            let family = match family {
                Some(f) => f,
                None => {
                    let f = next_family;
                    next_family += 1;
                    conn.execute(&format!("UPDATE {table} SET family_id = ?1 WHERE id = ?2"), params![f, id])?;
                    f
                }
            };
            // R1: the original goes where it twins nothing.
            let mut keeper = oldest.clone();
            for ws in &active {
                if member_in(conn, table, family, ws, None)?.is_none() {
                    keeper = ws.clone();
                    break;
                }
            }
            conn.execute(&format!("UPDATE {table} SET workspace_id = ?1 WHERE id = ?2"), params![keeper, id])?;
            let archived: bool = conn.query_row(&format!("SELECT archived_at IS NOT NULL FROM {table} WHERE id = ?1"), params![id], |row| row.get(0))?;
            for ws in workspaces.iter().filter(|w| **w != keeper) {
                // A member of the family already here is this workspace's row —
                // reused, never twinned (the "two Biblie" this removes) — when
                // reusing it cannot change what this workspace sees or plays,
                // and no other shared row already stands on it.
                let mut existing = None;
                for member in members_in(conn, table, family, ws, archived)? {
                    if !taken.contains(&(ws.clone(), table, member.clone())) && reusable(conn, table, &id, &member, ws)? {
                        existing = Some(member);
                        break;
                    }
                }
                if let Some(member) = &existing
                    && table == "domains"
                {
                    reused_domains.push((ws.clone(), id.clone(), member.clone()));
                }
                let to = match existing {
                    Some(member) => member,
                    None => {
                        let copy = seed_id(conn, table, &id, ws, &workspaces, &scopes)?.unwrap_or_else(|| fresh_id(prefix));
                        copy_row(conn, table, &id, &copy, ws)?;
                        if table == "domains" {
                            copied_domains.push((ws.clone(), id.clone(), copy.clone()));
                        }
                        copy
                    }
                };
                taken.insert((ws.clone(), table, to.clone()));
                map.insert((ws.clone(), table, id.clone()), to);
            }
        }
    }

    for ws in &workspaces {
        remap(conn, ws, &map)?;
    }
    // A reused domain holds what the shared one held: the questions added to
    // it after this workspace's copy was taken join at the end, in no group
    // (review: they had been in no domain).
    for (ws, shared, member) in &reused_domains {
        let wanted: Vec<String> = {
            let mut stmt = conn.prepare("SELECT question_id FROM domain_questions WHERE domain_id = ?1 ORDER BY sort_key, question_id")?;
            stmt.query_map(params![shared], |row| row.get::<_, String>(0))?.collect::<rusqlite::Result<_>>()?
        };
        let mut next: i64 = conn.query_row("SELECT COALESCE(MAX(sort_key), -1) + 1 FROM domain_questions WHERE domain_id = ?1", params![member], |row| row.get(0))?;
        for question in wanted {
            let here = map.get(&(ws.clone(), "questions", question.clone())).cloned().unwrap_or(question);
            let held: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM domain_questions WHERE domain_id = ?1 AND question_id = ?2)",
                params![member, here],
                |row| row.get(0),
            )?;
            let ours: bool = conn.query_row("SELECT EXISTS(SELECT 1 FROM questions WHERE id = ?1 AND workspace_id = ?2)", params![here, ws], |row| row.get(0))?;
            if !held && ours {
                conn.execute("INSERT INTO domain_questions (domain_id, question_id, sort_key, group_id) VALUES (?1, ?2, ?3, NULL)", params![member, here, next])?;
                next += 1;
            }
        }
    }
    for (ws, original, copy) in &copied_domains {
        copy_groups(conn, ws, original, copy)?;
    }
    for ws in &workspaces {
        respell(conn, ws)?;
    }
    Ok(())
}

/// Every member of `family` in `ws` in that archive state (R2), oldest first.
fn members_in(conn: &Connection, table: &str, family: i64, ws: &str, archived: bool) -> CatalogResult<Vec<String>> {
    let state = if archived { "archived_at IS NOT NULL" } else { "archived_at IS NULL" };
    let mut stmt = conn.prepare(&format!(
        "SELECT id FROM {table} WHERE family_id = ?1 AND workspace_id = ?2 AND {state} ORDER BY created_at, id"
    ))?;
    Ok(stmt.query_map(params![family, ws], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?)
}

/// A member of `family` in `ws`; with `archived`, only one in that state (R2).
fn member_in(conn: &Connection, table: &str, family: i64, ws: &str, archived: Option<bool>) -> CatalogResult<Option<String>> {
    let state = match archived {
        Some(true) => " AND archived_at IS NOT NULL",
        Some(false) => " AND archived_at IS NULL",
        None => "",
    };
    Ok(conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE family_id = ?1 AND workspace_id = ?2{state} ORDER BY created_at, id LIMIT 1"),
            params![family, ws],
            |row| row.get(0),
        )
        .optional()?)
}

/// Whether `ws` may use `member` in place of the shared `id` (R3, R4): no
/// container of `ws` holds both (that would fold two entries into one), and
/// nothing a game of `ws` plays could differ.
fn reusable(conn: &Connection, table: &str, id: &str, member: &str, ws: &str) -> CatalogResult<bool> {
    let both = |sql: &str| -> CatalogResult<bool> {
        Ok(conn.query_row(sql, params![id, member, ws], |row| row.get::<_, bool>(0))?)
    };
    let recipes = "SELECT id FROM recipes WHERE workspace_id = ?3";
    match table {
        "questions" => {
            if both(&format!(
                "SELECT EXISTS(SELECT 1 FROM domain_questions a JOIN domain_questions b ON a.domain_id = b.domain_id
                 WHERE a.question_id = ?1 AND b.question_id = ?2 AND a.domain_id IN (SELECT id FROM domains WHERE workspace_id = ?3))
                 OR EXISTS(SELECT 1 FROM recipe_questions a JOIN recipe_questions b ON a.recipe_id = b.recipe_id
                 WHERE a.question_id = ?1 AND b.question_id = ?2 AND a.recipe_id IN ({recipes}))
                 OR EXISTS(SELECT 1 FROM recipe_overlays a JOIN recipe_overlays b ON a.recipe_id = b.recipe_id AND a.target_kind = b.target_kind
                 WHERE a.target_kind = 'question' AND a.target_id = ?1 AND b.target_id = ?2 AND a.recipe_id IN ({recipes}))"
            ))? {
                return Ok(false);
            }
            // R4: what a board would ask of it is the same.
            let shape = |q: &str| -> CatalogResult<(i64, String)> {
                Ok(conn.query_row(
                    "SELECT q.difficulty, COALESCE((SELECT group_concat(o.is_correct, ',') FROM (SELECT is_correct FROM question_options WHERE question_id = q.id ORDER BY position) o), '')
                     FROM questions q WHERE q.id = ?1",
                    params![q],
                    |row| Ok((row.get(0)?, row.get(1)?)),
                )?)
            };
            Ok(shape(id)? == shape(member)?)
        }
        "teams" => Ok(!both(&format!(
            "SELECT EXISTS(SELECT 1 FROM recipe_teams a JOIN recipe_teams b ON a.recipe_id = b.recipe_id
             WHERE a.team_id = ?1 AND b.team_id = ?2 AND a.recipe_id IN ({recipes}))
             OR EXISTS(SELECT 1 FROM recipe_overlays a JOIN recipe_overlays b ON a.recipe_id = b.recipe_id AND a.target_kind = b.target_kind
             WHERE a.target_kind = 'team' AND a.target_id = ?1 AND b.target_id = ?2 AND a.recipe_id IN ({recipes}))"
        ))?),
        // R4: a domain a game of this workspace boards is copied, so the board
        // keeps exactly the members it had.
        "domains" => Ok(!both(&format!(
            // `?2 = ?2` only binds the member the shared closure passes; a boarded domain is copied whatever it is.
            "SELECT ?2 = ?2 AND EXISTS(SELECT 1 FROM recipe_domains WHERE domain_id = ?1 AND recipe_id IN ({recipes}))"
        ))?),
        _ => Ok(true),
    }
}

/// R5: a Demo row copied into `ws` takes `ws`'s seed id in the generation
/// [`demo_scopes`] chose for it, so *Restore sample game* there recognises
/// it; `None` when the row is not a Demo row or that id is somehow taken.
fn seed_id(
    conn: &Connection,
    table: &str,
    id: &str,
    ws: &str,
    workspaces: &[String],
    scopes: &BTreeMap<String, String>,
) -> CatalogResult<Option<String>> {
    let (Some(rest), Some(scope)) = (seed_rest(id, workspaces), scopes.get(ws)) else { return Ok(None) };
    let candidate = format!("seed-{scope}{rest}");
    let taken: bool = conn.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = ?1)"), params![candidate], |row| row.get(0))?;
    Ok((!taken).then_some(candidate))
}

/// For each workspace, the first Demo generation — the scopes `demo_here`
/// tries, in its order — whose ids for every shared Demo row are all free.
fn demo_scopes(conn: &Connection, workspaces: &[String]) -> CatalogResult<BTreeMap<String, String>> {
    let mut rows: Vec<(&'static str, String)> = Vec::new();
    for (table, _) in KINDS {
        let mut stmt = conn.prepare(&format!("SELECT id FROM {table} WHERE workspace_id IS NULL AND id LIKE 'seed-%'"))?;
        for id in stmt.query_map([], |row| row.get::<_, String>(0))? {
            rows.push((table, id?));
        }
    }
    let mut out = BTreeMap::new();
    if rows.is_empty() {
        return Ok(out);
    }
    for ws in workspaces {
        for generation in 1.. {
            let scope = match (ws == "ws-1", generation) {
                (true, 1) => String::new(),
                (true, 2) | (false, 1) => format!("{ws}-"),
                (true, n) => format!("{ws}-r{}-", n - 1),
                (false, n) => format!("{ws}-r{n}-"),
            };
            let mut free = true;
            for (table, id) in &rows {
                let Some(rest) = seed_rest(id, workspaces) else { continue };
                let candidate = format!("seed-{scope}{rest}");
                let exists: bool = conn.query_row(&format!("SELECT EXISTS(SELECT 1 FROM {table} WHERE id = ?1)"), params![candidate], |row| row.get(0))?;
                if exists {
                    free = false;
                    break;
                }
            }
            if free {
                out.insert(ws.clone(), scope);
                break;
            }
        }
    }
    Ok(out)
}

/// A seed id without its workspace scope (and generation): `seed-ws-2-r2-team-red` → `team-red`.
pub(crate) fn seed_rest(id: &str, workspaces: &[String]) -> Option<String> {
    let mut rest = id.strip_prefix("seed-")?;
    if let Some(ws) = workspaces.iter().filter(|w| rest.starts_with(&format!("{w}-"))).max_by_key(|w| w.len()) {
        rest = &rest[ws.len() + 1..];
        if let Some(after) = rest.strip_prefix('r')
            && let Some(dash) = after.find('-')
            && after[..dash].chars().all(|c| c.is_ascii_digit())
            && dash > 0
        {
            rest = &after[dash + 1..];
        }
    }
    Some(rest.to_owned())
}

/// Every column of `id`'s row, under `copy`, in `ws`; with its child rows
/// (a question's options and tags, a domain's members — remapped later).
fn copy_row(conn: &Connection, table: &str, id: &str, copy: &str, ws: &str) -> CatalogResult<()> {
    let columns = columns(conn, table)?;
    let list = columns.join(", ");
    let picks: Vec<String> = columns
        .iter()
        .map(|c| match c.as_str() {
            "id" => "?1".to_owned(),
            "workspace_id" => "?2".to_owned(),
            other => other.to_owned(),
        })
        .collect();
    conn.execute(
        &format!("INSERT INTO {table} ({list}) SELECT {} FROM {table} WHERE id = ?3", picks.join(", ")),
        params![copy, ws, id],
    )?;
    match table {
        "questions" => {
            copy_children(conn, "question_options", "question_id", id, copy)?;
            // An option id written after its question's (`seed-q-geo-1-a`)
            // follows the new question id, so a Demo copy reads unedited.
            conn.execute(
                "UPDATE question_options SET id = ?1 || substr(id, length(?2) + 1) WHERE question_id = ?1 AND substr(id, 1, length(?2)) = ?2",
                params![copy, id],
            )?;
            copy_children(conn, "question_tags", "question_id", id, copy)?;
        }
        "domains" => copy_children(conn, "domain_questions", "domain_id", id, copy)?,
        _ => {}
    }
    Ok(())
}

fn copy_children(conn: &Connection, table: &str, key: &str, id: &str, copy: &str) -> CatalogResult<()> {
    let columns = columns(conn, table)?;
    let list = columns.join(", ");
    let picks: Vec<String> = columns.iter().map(|c| if c == key { "?1".to_owned() } else { c.clone() }).collect();
    conn.execute(
        &format!("INSERT INTO {table} ({list}) SELECT {} FROM {table} WHERE {key} = ?2", picks.join(", ")),
        params![copy, id],
    )?;
    Ok(())
}

fn columns(conn: &Connection, table: &str) -> CatalogResult<Vec<String>> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    Ok(stmt.query_map([], |row| row.get::<_, String>(1))?.collect::<rusqlite::Result<_>>()?)
}

/// Point every reference a row of `ws` makes at `ws`'s own row.
fn remap(conn: &Connection, ws: &str, map: &Map) -> CatalogResult<()> {
    let to = |table: &'static str, id: &str| map.get(&(ws.to_owned(), table, id.to_owned())).cloned();
    let in_ws = |table: &str| format!("SELECT id FROM {table} WHERE workspace_id = '{}'", ws.replace('\'', "''"));

    // Rows of this workspace that show an asset.
    for (table, column) in [("questions", "media_asset_id"), ("teams", "logo_asset_id")] {
        for (id, asset) in pairs(conn, &format!("SELECT id, {column} FROM {table} WHERE workspace_id = ?1 AND {column} IS NOT NULL"), ws)? {
            if let Some(new) = to("assets", &asset) {
                conn.execute(&format!("UPDATE {table} SET {column} = ?1 WHERE id = ?2"), params![new, id])?;
            }
        }
    }

    // A domain of this workspace holds this workspace's questions. A domain
    // that already held the family member keeps one membership (the first).
    for (domain, question) in pairs(conn, &format!("SELECT domain_id, question_id FROM domain_questions WHERE domain_id IN ({})", in_ws("domains")), "")? {
        if let Some(new) = to("questions", &question) {
            let taken: bool = conn.query_row(
                "SELECT EXISTS(SELECT 1 FROM domain_questions WHERE domain_id = ?1 AND question_id = ?2)",
                params![domain, new],
                |row| row.get(0),
            )?;
            if taken {
                conn.execute("DELETE FROM domain_questions WHERE domain_id = ?1 AND question_id = ?2", params![domain, question])?;
            } else {
                conn.execute(
                    "UPDATE domain_questions SET question_id = ?1 WHERE domain_id = ?2 AND question_id = ?3",
                    params![new, domain, question],
                )?;
            }
        }
    }

    // This workspace's games: roster, board, overlays.
    let recipes = in_ws("recipes");
    for (recipe, team) in pairs(conn, &format!("SELECT recipe_id, team_id FROM recipe_teams WHERE recipe_id IN ({recipes})"), "")? {
        if let Some(new) = to("teams", &team) {
            conn.execute("UPDATE recipe_teams SET team_id = ?1 WHERE recipe_id = ?2 AND team_id = ?3", params![new, recipe, team])?;
        }
    }
    for (recipe, domain) in pairs(conn, &format!("SELECT recipe_id, domain_id FROM recipe_domains WHERE recipe_id IN ({recipes})"), "")? {
        if let Some(new) = to("domains", &domain) {
            conn.execute("UPDATE recipe_domains SET domain_id = ?1 WHERE recipe_id = ?2 AND domain_id = ?3", params![new, recipe, domain])?;
            conn.execute("UPDATE recipe_questions SET domain_id = ?1 WHERE recipe_id = ?2 AND domain_id = ?3", params![new, recipe, domain])?;
        }
    }
    for (recipe, question) in pairs(conn, &format!("SELECT recipe_id, question_id FROM recipe_questions WHERE recipe_id IN ({recipes})"), "")? {
        if let Some(new) = to("questions", &question) {
            conn.execute(
                "UPDATE recipe_questions SET question_id = ?1 WHERE recipe_id = ?2 AND question_id = ?3",
                params![new, recipe, question],
            )?;
        }
    }
    let overlays: Vec<(String, String, String, String)> = {
        let mut stmt = conn.prepare(&format!(
            "SELECT recipe_id, target_kind, target_id, patch_json FROM recipe_overlays WHERE recipe_id IN ({recipes})"
        ))?;
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))?.collect::<rusqlite::Result<_>>()?
    };
    for (recipe, kind, target, patch) in overlays {
        let table = match kind.as_str() {
            "team" => Some("teams"),
            "domain" => Some("domains"),
            "question" => Some("questions"),
            _ => None,
        };
        let new_target = table.and_then(|t| to(t, &target)).unwrap_or_else(|| target.clone());
        let new_patch = remap_patch(&patch, &|asset| to("assets", asset));
        if new_target != target || new_patch != patch {
            conn.execute(
                "UPDATE recipe_overlays SET target_id = ?1, patch_json = ?2 WHERE recipe_id = ?3 AND target_kind = ?4 AND target_id = ?5",
                params![new_target, new_patch, recipe, kind, target],
            )?;
        }
    }
    Ok(())
}

/// An overlay's asset ids (a team overlay's `logoAssetId`), pointed at this
/// workspace's assets. Anything else in the patch is left as it is.
fn remap_patch(patch: &str, to: &dyn Fn(&str) -> Option<String>) -> String {
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(patch) else {
        return patch.to_owned();
    };
    let mut changed = false;
    if let Some(object) = value.as_object_mut() {
        for key in ["logoAssetId", "mediaAssetId"] {
            if let Some(serde_json::Value::String(asset)) = object.get(key)
                && let Some(new) = to(asset)
            {
                object.insert(key.to_owned(), serde_json::Value::String(new));
                changed = true;
            }
        }
    }
    if changed { value.to_string() } else { patch.to_owned() }
}

fn pairs(conn: &Connection, sql: &str, param: &str) -> CatalogResult<Vec<(String, String)>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = if sql.contains("?1") {
        stmt.query_map(params![param], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?
    } else {
        stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?)))?.collect::<rusqlite::Result<Vec<_>>>()?
    };
    Ok(rows)
}

/// A copied domain takes its own groups, its members' groups mapped onto them.
fn copy_groups(conn: &Connection, _ws: &str, original: &str, copy: &str) -> CatalogResult<()> {
    let groups: Vec<(String, String, i64, i64, i64)> = {
        let mut stmt = conn.prepare("SELECT id, name, sort_key, created_at, updated_at FROM domain_groups WHERE domain_id = ?1")?;
        stmt.query_map(params![original], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?)))?
            .collect::<rusqlite::Result<_>>()?
    };
    let mut ids = BTreeMap::new();
    for (id, name, sort_key, created, updated) in groups {
        let new = fresh_id("grp");
        conn.execute(
            "INSERT INTO domain_groups (id, domain_id, name, sort_key, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![new, copy, name, sort_key, created, updated],
        )?;
        ids.insert(id, new);
    }
    for (old, new) in &ids {
        conn.execute("UPDATE domain_questions SET group_id = ?1 WHERE domain_id = ?2 AND group_id = ?3", params![new, copy, old])?;
    }
    Ok(())
}

/// One spelling per tag within the workspace: the earliest-created
/// question's, as a write would choose it.
fn respell(conn: &Connection, ws: &str) -> CatalogResult<()> {
    let keys: BTreeSet<String> = {
        let mut stmt = conn.prepare(
            "SELECT DISTINCT qt.tag_key FROM question_tags qt JOIN questions q ON q.id = qt.question_id WHERE q.workspace_id = ?1",
        )?;
        stmt.query_map(params![ws], |row| row.get(0))?.collect::<rusqlite::Result<_>>()?
    };
    for key in keys {
        let spelling: String = conn.query_row(
            "SELECT qt.tag FROM question_tags qt JOIN questions q ON q.id = qt.question_id
             WHERE q.workspace_id = ?1 AND qt.tag_key = ?2 ORDER BY q.created_at, q.id LIMIT 1",
            params![ws, key],
            |row| row.get(0),
        )?;
        conn.execute(
            "UPDATE question_tags SET tag = ?1
             WHERE tag_key = ?2 AND tag <> ?1 AND question_id IN (SELECT id FROM questions WHERE workspace_id = ?3)",
            params![spelling, key, ws],
        )?;
    }
    Ok(())
}

/// From step 6 on, a library row lives in a workspace.
pub(crate) const TRIGGERS: &str = r#"
CREATE TRIGGER teams_has_workspace_insert BEFORE INSERT ON teams WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER teams_has_workspace_update BEFORE UPDATE OF workspace_id ON teams WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER domains_has_workspace_insert BEFORE INSERT ON domains WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER domains_has_workspace_update BEFORE UPDATE OF workspace_id ON domains WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER questions_has_workspace_insert BEFORE INSERT ON questions WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER questions_has_workspace_update BEFORE UPDATE OF workspace_id ON questions WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER assets_has_workspace_insert BEFORE INSERT ON assets WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER assets_has_workspace_update BEFORE UPDATE OF workspace_id ON assets WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER recipes_has_workspace_insert BEFORE INSERT ON recipes WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
CREATE TRIGGER recipes_has_workspace_update BEFORE UPDATE OF workspace_id ON recipes WHEN NEW.workspace_id IS NULL
BEGIN SELECT RAISE(ABORT, 'a library row lives in a workspace'); END;
"#;
