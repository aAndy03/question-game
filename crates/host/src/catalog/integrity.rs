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
