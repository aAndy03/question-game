//! The library check (beta.5): references that point at nothing, or at a row
//! another workspace owns. Foreign keys keep most of them from existing; what
//! is left is a reference across workspaces — a library written before the
//! one-scope rule, or edited from outside — and an asset id, which no key
//! guards. Load refuses a game built on one, so health says so first.
//!
//! The check is counts in SQL, cheap enough for every health report. The
//! repair removes those references and nothing else, in one transaction.

use rusqlite::{Connection, Transaction, params};

use super::error::CatalogResult;

/// One kind of bad reference: the rows that hold it, as a `SELECT rowid …`
/// over its table, and how to clear one.
struct Problem {
    /// `SELECT x.rowid FROM …`: the holders of a bad reference.
    holders: &'static str,
    /// Clears the holders `holders` named, given as `rowid IN (…)`.
    clear: &'static str,
    /// A board reference: its game's `rev` moves when it is cleared.
    recipe_of: Option<&'static str>,
}

const PROBLEMS: &[Problem] = &[
    // A domain member whose question is gone or in another workspace.
    Problem {
        holders: "SELECT dq.rowid FROM domain_questions dq JOIN domains d ON d.id = dq.domain_id
                  LEFT JOIN questions q ON q.id = dq.question_id
                  WHERE q.id IS NULL OR q.workspace_id IS NOT d.workspace_id",
        clear: "DELETE FROM domain_questions WHERE rowid IN",
        recipe_of: None,
    },
    // A roster entry.
    Problem {
        holders: "SELECT x.rowid FROM recipe_teams x JOIN recipes r ON r.id = x.recipe_id
                  LEFT JOIN teams t ON t.id = x.team_id
                  WHERE t.id IS NULL OR t.workspace_id IS NOT r.workspace_id",
        clear: "DELETE FROM recipe_teams WHERE rowid IN",
        recipe_of: Some("SELECT recipe_id FROM recipe_teams WHERE rowid IN"),
    },
    // A board domain.
    Problem {
        holders: "SELECT x.rowid FROM recipe_domains x JOIN recipes r ON r.id = x.recipe_id
                  LEFT JOIN domains d ON d.id = x.domain_id
                  WHERE d.id IS NULL OR d.workspace_id IS NOT r.workspace_id",
        clear: "DELETE FROM recipe_domains WHERE rowid IN",
        recipe_of: Some("SELECT recipe_id FROM recipe_domains WHERE rowid IN"),
    },
    // A board question: gone, another workspace's, or under a domain the board no longer holds.
    Problem {
        holders: "SELECT x.rowid FROM recipe_questions x JOIN recipes r ON r.id = x.recipe_id
                  LEFT JOIN questions q ON q.id = x.question_id
                  WHERE q.id IS NULL OR q.workspace_id IS NOT r.workspace_id
                     OR NOT EXISTS (SELECT 1 FROM recipe_domains rd
                                    WHERE rd.recipe_id = x.recipe_id AND rd.domain_id = x.domain_id)",
        clear: "DELETE FROM recipe_questions WHERE rowid IN",
        recipe_of: Some("SELECT recipe_id FROM recipe_questions WHERE rowid IN"),
    },
    // A member in a domain group of another domain (an orphan group, review of
    // the roadmap's beta.5 line): the member stays, in no group.
    Problem {
        holders: "SELECT dq.rowid FROM domain_questions dq JOIN domain_groups g ON g.id = dq.group_id
                  WHERE g.domain_id IS NOT dq.domain_id",
        clear: "UPDATE domain_questions SET group_id = NULL WHERE rowid IN",
        recipe_of: None,
    },
    // A team logo.
    Problem {
        holders: "SELECT t.rowid FROM teams t LEFT JOIN assets a ON a.id = t.logo_asset_id
                  WHERE t.logo_asset_id IS NOT NULL AND (a.id IS NULL OR a.workspace_id IS NOT t.workspace_id)",
        clear: "UPDATE teams SET logo_asset_id = NULL WHERE rowid IN",
        recipe_of: None,
    },
    // A question's media.
    Problem {
        holders: "SELECT q.rowid FROM questions q LEFT JOIN assets a ON a.id = q.media_asset_id
                  WHERE q.media_asset_id IS NOT NULL AND (a.id IS NULL OR a.workspace_id IS NOT q.workspace_id)",
        clear: "UPDATE questions SET media_asset_id = NULL WHERE rowid IN",
        recipe_of: None,
    },
];

/// How many bad references the library holds, every workspace's.
pub(super) fn count(conn: &Connection) -> CatalogResult<u32> {
    let mut total = 0u32;
    for problem in PROBLEMS {
        let n: i64 = conn.query_row(
            &format!("SELECT COUNT(*) FROM ({})", problem.holders),
            [],
            |row| row.get(0),
        )?;
        total += n as u32;
    }
    Ok(total)
}

/// Clear every bad reference, moving the `rev` of each game whose board or
/// roster changed, in `tx`. Returns how many, and those games with their new
/// `rev`.
pub(super) fn repair(
    tx: &Transaction<'_>,
    now_ms: u64,
) -> CatalogResult<(u32, Vec<(String, u32)>)> {
    let mut total = 0u32;
    let mut recipes: Vec<String> = Vec::new();
    for problem in PROBLEMS {
        if let Some(recipe_of) = problem.recipe_of {
            let mut stmt = tx.prepare(&format!(
                "SELECT DISTINCT recipe_id FROM ({recipe_of} ({}))",
                problem.holders
            ))?;
            for id in stmt.query_map(params![], |row| row.get::<_, String>(0))? {
                let id = id?;
                if !recipes.contains(&id) {
                    recipes.push(id);
                }
            }
        }
        total += tx.execute(&format!("{} ({})", problem.clear, problem.holders), [])? as u32;
    }
    let mut moved = Vec::with_capacity(recipes.len());
    for id in recipes {
        tx.execute(
            "UPDATE recipes SET rev = rev + 1, updated_at = ?2 WHERE id = ?1",
            params![id, now_ms as i64],
        )?;
        let rev: i64 = tx.query_row(
            "SELECT rev FROM recipes WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )?;
        moved.push((id, rev as u32));
    }
    Ok((total, moved))
}

/// Question tags of one key spelled two ways inside one workspace ("Rome" and
/// "rome"): how many such keys. `clean_tags` keeps one spelling on the way
/// in, so this is a library written before it, or edited from outside.
pub(super) fn tag_spellings(conn: &Connection) -> CatalogResult<u32> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM (SELECT q.workspace_id, t.tag_key FROM question_tags t
           JOIN questions q ON q.id = t.question_id
          GROUP BY q.workspace_id, t.tag_key HAVING COUNT(DISTINCT t.tag) > 1)",
        [],
        |row| row.get(0),
    )?;
    Ok(n as u32)
}

/// One spelling per key and workspace: the one on the earliest-created
/// question, as `clean_tags` would have kept. Returns how many tags changed.
pub(super) fn unify_tags(tx: &Transaction<'_>) -> CatalogResult<u32> {
    let changed = tx.execute(
        "UPDATE question_tags SET tag = (
            SELECT t2.tag FROM question_tags t2 JOIN questions q2 ON q2.id = t2.question_id
             WHERE t2.tag_key = question_tags.tag_key
               AND q2.workspace_id = (SELECT q.workspace_id FROM questions q WHERE q.id = question_tags.question_id)
             ORDER BY q2.created_at, q2.id LIMIT 1)
         WHERE tag <> (
            SELECT t2.tag FROM question_tags t2 JOIN questions q2 ON q2.id = t2.question_id
             WHERE t2.tag_key = question_tags.tag_key
               AND q2.workspace_id = (SELECT q.workspace_id FROM questions q WHERE q.id = question_tags.question_id)
             ORDER BY q2.created_at, q2.id LIMIT 1)",
        [],
    )?;
    Ok(changed as u32)
}

/// What each workspace holds, active rows only: teams, domains, questions, games.
pub(super) fn workspace_counts(conn: &Connection) -> CatalogResult<Vec<(String, [u32; 4])>> {
    let mut stmt = conn.prepare(
        "SELECT w.id,
                (SELECT COUNT(*) FROM teams x WHERE x.workspace_id = w.id AND x.archived_at IS NULL),
                (SELECT COUNT(*) FROM domains x WHERE x.workspace_id = w.id AND x.archived_at IS NULL),
                (SELECT COUNT(*) FROM questions x WHERE x.workspace_id = w.id AND x.archived_at IS NULL),
                (SELECT COUNT(*) FROM recipes x WHERE x.workspace_id = w.id AND x.archived_at IS NULL)
           FROM workspaces w ORDER BY w.sort_key, w.created_at",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, [row.get::<_, i64>(1)? as u32, row.get::<_, i64>(2)? as u32, row.get::<_, i64>(3)? as u32, row.get::<_, i64>(4)? as u32]))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    Ok(rows)
}
