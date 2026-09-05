//! Every SQL statement in the project, in one file.
//!
//! Private to `CatalogService`: these functions take a `&Connection` or a
//! `&Transaction` and are never reachable from outside the module, which is
//! what "the storage seam stays internal" means in practice
//! (`01_codebase-design-spec-v1.md`). A caller that wanted to run its own SQL
//! would have to add a public function here, and that is exactly the review
//! moment the rule is for.
//!
//! Multi-row entities — a domain's membership, a question's options, a
//! recipe's roster and board — are written **delete-then-insert inside the
//! caller's transaction**. That keeps the child rows a property of the parent
//! write rather than a second write that could half-land.

use std::collections::BTreeMap;

use rusqlite::{Connection, OptionalExtension, Row, Transaction, params};

use crate::ids::{AssetId, DomainId, OperatorId, OptionId, PlayId, QuestionId, RecipeId, TeamId};

use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{
    ArchiveScope, Asset, BoardDomain, Domain, DomainMember, DomainOverlay, Operator, Question,
    QuestionOption, QuestionOverlay, Recipe, RecipeOverlays, Stamps, Team, TeamOverlay,
};

fn ms(value: u64) -> i64 {
    value as i64
}

fn opt_ms(value: Option<u64>) -> Option<i64> {
    value.map(ms)
}

fn read_u64(row: &Row<'_>, index: &str) -> rusqlite::Result<u64> {
    Ok(row.get::<_, i64>(index)? as u64)
}

fn read_opt_u64(row: &Row<'_>, index: &str) -> rusqlite::Result<Option<u64>> {
    Ok(row.get::<_, Option<i64>>(index)?.map(|v| v as u64))
}

fn stamps(row: &Row<'_>) -> rusqlite::Result<Stamps> {
    Ok(Stamps {
        created_at: read_u64(row, "created_at")?,
        updated_at: read_u64(row, "updated_at")?,
        archived_at: read_opt_u64(row, "archived_at")?,
    })
}

/// `created_at` is kept from the stored row; `updated_at` moves to now. This is
/// the one place metadata is decided, so a caller cannot backdate a row.
fn carried_created_at(
    conn: &Connection,
    table: &'static str,
    id: &str,
    now_ms: u64,
) -> CatalogResult<u64> {
    let sql = format!("SELECT created_at FROM {table} WHERE id = ?1");
    let existing: Option<i64> = conn
        .query_row(&sql, params![id], |row| row.get(0))
        .optional()?;
    Ok(existing.map(|v| v as u64).unwrap_or(now_ms))
}

// ----------------------------------------------------------------------- teams

pub(super) fn team_row(row: &Row<'_>) -> rusqlite::Result<Team> {
    Ok(Team {
        id: TeamId::new(row.get::<_, String>("id")?),
        name: row.get("name")?,
        short_code: row.get("short_code")?,
        color: row.get("color")?,
        logo_asset_id: row
            .get::<_, Option<String>>("logo_asset_id")?
            .map(AssetId::new),
        notes: row.get("notes")?,
        stamps: stamps(row)?,
        play_count: row.get::<_, i64>("play_count")? as u32,
        last_play_at: read_opt_u64(row, "last_play_at")?,
    })
}

pub(super) fn team_get(conn: &Connection, id: &TeamId) -> CatalogResult<Team> {
    conn.query_row(
        "SELECT * FROM teams WHERE id = ?1",
        params![id.as_str()],
        team_row,
    )
    .optional()?
    .ok_or_else(|| CatalogError::not_found(CatalogKind::Team, id.as_str()))
}

pub(super) fn team_list(conn: &Connection, scope: ArchiveScope) -> CatalogResult<Vec<Team>> {
    let sql = format!(
        "SELECT * FROM teams WHERE {} ORDER BY name, id",
        scope.sql()
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map([], team_row)?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn team_upsert(tx: &Transaction<'_>, team: &Team, now_ms: u64) -> CatalogResult<()> {
    let created_at = carried_created_at(tx, "teams", team.id.as_str(), now_ms)?;
    tx.execute(
        "INSERT INTO teams (id, name, short_code, color, logo_asset_id, notes,
                            created_at, updated_at, archived_at, play_count, last_play_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8,
                 COALESCE((SELECT archived_at FROM teams WHERE id = ?1), NULL),
                 COALESCE((SELECT play_count FROM teams WHERE id = ?1), 0),
                 (SELECT last_play_at FROM teams WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, short_code = excluded.short_code,
             color = excluded.color, logo_asset_id = excluded.logo_asset_id,
             notes = excluded.notes, updated_at = excluded.updated_at",
        params![
            team.id.as_str(),
            team.name,
            team.short_code,
            team.color,
            team.logo_asset_id.as_ref().map(|a| a.as_str()),
            team.notes,
            ms(created_at),
            ms(now_ms),
        ],
    )?;
    Ok(())
}

// --------------------------------------------------------------------- domains

fn domain_row(row: &Row<'_>) -> rusqlite::Result<Domain> {
    Ok(Domain {
        id: DomainId::new(row.get::<_, String>("id")?),
        name: row.get("name")?,
        code: row.get("code")?,
        description: row.get("description")?,
        questions: Vec::new(),
        stamps: stamps(row)?,
    })
}

fn domain_members(conn: &Connection, id: &DomainId) -> CatalogResult<Vec<DomainMember>> {
    let mut stmt = conn.prepare(
        "SELECT question_id, sort_key FROM domain_questions
         WHERE domain_id = ?1 ORDER BY sort_key, question_id",
    )?;
    let rows = stmt.query_map(params![id.as_str()], |row| {
        Ok(DomainMember {
            question_id: QuestionId::new(row.get::<_, String>(0)?),
            sort_key: row.get(1)?,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn domain_get(conn: &Connection, id: &DomainId) -> CatalogResult<Domain> {
    let mut domain = conn
        .query_row(
            "SELECT * FROM domains WHERE id = ?1",
            params![id.as_str()],
            domain_row,
        )
        .optional()?
        .ok_or_else(|| CatalogError::not_found(CatalogKind::Domain, id.as_str()))?;
    domain.questions = domain_members(conn, id)?;
    Ok(domain)
}

pub(super) fn domain_list(conn: &Connection, scope: ArchiveScope) -> CatalogResult<Vec<Domain>> {
    let sql = format!(
        "SELECT * FROM domains WHERE {} ORDER BY name, id",
        scope.sql()
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut domains = stmt
        .query_map([], domain_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for domain in &mut domains {
        domain.questions = domain_members(conn, &domain.id)?;
    }
    Ok(domains)
}

pub(super) fn domain_upsert(
    tx: &Transaction<'_>,
    domain: &Domain,
    now_ms: u64,
) -> CatalogResult<()> {
    let created_at = carried_created_at(tx, "domains", domain.id.as_str(), now_ms)?;
    tx.execute(
        "INSERT INTO domains (id, name, code, description, created_at, updated_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6,
                 (SELECT archived_at FROM domains WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, code = excluded.code,
             description = excluded.description, updated_at = excluded.updated_at",
        params![
            domain.id.as_str(),
            domain.name,
            domain.code,
            domain.description,
            ms(created_at),
            ms(now_ms),
        ],
    )?;
    tx.execute(
        "DELETE FROM domain_questions WHERE domain_id = ?1",
        params![domain.id.as_str()],
    )?;
    for member in &domain.questions {
        tx.execute(
            "INSERT INTO domain_questions (domain_id, question_id, sort_key) VALUES (?1, ?2, ?3)",
            params![
                domain.id.as_str(),
                member.question_id.as_str(),
                member.sort_key
            ],
        )?;
    }
    Ok(())
}

// ------------------------------------------------------------------- questions

fn question_row(row: &Row<'_>) -> rusqlite::Result<Question> {
    Ok(Question {
        id: QuestionId::new(row.get::<_, String>("id")?),
        stem: row.get("stem")?,
        media_asset_id: row
            .get::<_, Option<String>>("media_asset_id")?
            .map(AssetId::new),
        options: Vec::new(),
        difficulty: row.get::<_, i64>("difficulty")? as u8,
        explanation: row.get("explanation")?,
        stamps: stamps(row)?,
    })
}

fn question_options(conn: &Connection, id: &QuestionId) -> CatalogResult<Vec<QuestionOption>> {
    let mut stmt = conn.prepare(
        "SELECT id, text, is_correct FROM question_options
         WHERE question_id = ?1 ORDER BY position",
    )?;
    let rows = stmt.query_map(params![id.as_str()], |row| {
        Ok(QuestionOption {
            id: OptionId::new(row.get::<_, String>(0)?),
            text: row.get(1)?,
            correct: row.get::<_, i64>(2)? != 0,
        })
    })?;
    Ok(rows.collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn question_get(conn: &Connection, id: &QuestionId) -> CatalogResult<Question> {
    let mut question = conn
        .query_row(
            "SELECT * FROM questions WHERE id = ?1",
            params![id.as_str()],
            question_row,
        )
        .optional()?
        .ok_or_else(|| CatalogError::not_found(CatalogKind::Question, id.as_str()))?;
    question.options = question_options(conn, id)?;
    Ok(question)
}

pub(super) fn question_list(
    conn: &Connection,
    scope: ArchiveScope,
) -> CatalogResult<Vec<Question>> {
    let sql = format!(
        "SELECT * FROM questions WHERE {} ORDER BY difficulty, id",
        scope.sql()
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut questions = stmt
        .query_map([], question_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    for question in &mut questions {
        question.options = question_options(conn, &question.id)?;
    }
    Ok(questions)
}

pub(super) fn question_upsert(
    tx: &Transaction<'_>,
    question: &Question,
    now_ms: u64,
) -> CatalogResult<()> {
    let created_at = carried_created_at(tx, "questions", question.id.as_str(), now_ms)?;
    tx.execute(
        "INSERT INTO questions (id, stem, media_asset_id, difficulty, explanation,
                                created_at, updated_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7,
                 (SELECT archived_at FROM questions WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET
             stem = excluded.stem, media_asset_id = excluded.media_asset_id,
             difficulty = excluded.difficulty, explanation = excluded.explanation,
             updated_at = excluded.updated_at",
        params![
            question.id.as_str(),
            question.stem,
            question.media_asset_id.as_ref().map(|a| a.as_str()),
            i64::from(question.difficulty),
            question.explanation,
            ms(created_at),
            ms(now_ms),
        ],
    )?;
    tx.execute(
        "DELETE FROM question_options WHERE question_id = ?1",
        params![question.id.as_str()],
    )?;
    for (position, option) in question.options.iter().enumerate() {
        tx.execute(
            "INSERT INTO question_options (question_id, id, position, text, is_correct)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                question.id.as_str(),
                option.id.as_str(),
                position as i64,
                option.text,
                i64::from(option.correct),
            ],
        )?;
    }
    Ok(())
}

// ------------------------------------------------------------------- operators

fn operator_row(row: &Row<'_>) -> rusqlite::Result<Operator> {
    Ok(Operator {
        id: OperatorId::new(row.get::<_, String>("id")?),
        display_name: row.get("display_name")?,
        pin_hash: row.get("pin_hash")?,
        last_active_at: read_opt_u64(row, "last_active_at")?,
        plays_run: row.get::<_, i64>("plays_run")? as u32,
        stamps: stamps(row)?,
    })
}

pub(super) fn operator_get(conn: &Connection, id: &OperatorId) -> CatalogResult<Operator> {
    conn.query_row(
        "SELECT * FROM operators WHERE id = ?1",
        params![id.as_str()],
        operator_row,
    )
    .optional()?
    .ok_or_else(|| CatalogError::not_found(CatalogKind::Operator, id.as_str()))
}

pub(super) fn operator_list(
    conn: &Connection,
    scope: ArchiveScope,
) -> CatalogResult<Vec<Operator>> {
    let sql = format!(
        "SELECT * FROM operators WHERE {} ORDER BY display_name, id",
        scope.sql()
    );
    let mut stmt = conn.prepare(&sql)?;
    Ok(stmt
        .query_map([], operator_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn operator_upsert(
    tx: &Transaction<'_>,
    operator: &Operator,
    now_ms: u64,
) -> CatalogResult<()> {
    let created_at = carried_created_at(tx, "operators", operator.id.as_str(), now_ms)?;
    tx.execute(
        "INSERT INTO operators (id, display_name, pin_hash, last_active_at, plays_run,
                                created_at, updated_at, archived_at)
         VALUES (?1, ?2, ?3, ?4,
                 COALESCE((SELECT plays_run FROM operators WHERE id = ?1), 0), ?5, ?6,
                 (SELECT archived_at FROM operators WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET
             display_name = excluded.display_name, pin_hash = excluded.pin_hash,
             last_active_at = excluded.last_active_at, updated_at = excluded.updated_at",
        params![
            operator.id.as_str(),
            operator.display_name,
            operator.pin_hash,
            opt_ms(operator.last_active_at),
            ms(created_at),
            ms(now_ms),
        ],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------- assets

fn asset_row(row: &Row<'_>) -> rusqlite::Result<Asset> {
    Ok(Asset {
        id: AssetId::new(row.get::<_, String>("id")?),
        path: row.get("path")?,
        kind: row.get("kind")?,
        stamps: Stamps {
            created_at: read_u64(row, "created_at")?,
            updated_at: read_u64(row, "created_at")?,
            archived_at: read_opt_u64(row, "archived_at")?,
        },
    })
}

pub(super) fn asset_get(conn: &Connection, id: &AssetId) -> CatalogResult<Asset> {
    conn.query_row(
        "SELECT * FROM assets WHERE id = ?1",
        params![id.as_str()],
        asset_row,
    )
    .optional()?
    .ok_or_else(|| CatalogError::not_found(CatalogKind::Asset, id.as_str()))
}

pub(super) fn asset_list(conn: &Connection, scope: ArchiveScope) -> CatalogResult<Vec<Asset>> {
    let sql = format!("SELECT * FROM assets WHERE {} ORDER BY id", scope.sql());
    let mut stmt = conn.prepare(&sql)?;
    Ok(stmt
        .query_map([], asset_row)?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn asset_upsert(tx: &Transaction<'_>, asset: &Asset, now_ms: u64) -> CatalogResult<()> {
    let created_at = carried_created_at(tx, "assets", asset.id.as_str(), now_ms)?;
    tx.execute(
        "INSERT INTO assets (id, path, kind, created_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, (SELECT archived_at FROM assets WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET path = excluded.path, kind = excluded.kind",
        params![asset.id.as_str(), asset.path, asset.kind, ms(created_at)],
    )?;
    Ok(())
}

// --------------------------------------------------------------------- recipes

fn recipe_row(row: &Row<'_>) -> CatalogResult<Recipe> {
    Ok(Recipe {
        id: RecipeId::new(row.get::<_, String>("id")?),
        name: row.get("name")?,
        folder: row.get("folder")?,
        tags: serde_json::from_str(&row.get::<_, String>("tags_json")?)?,
        teams: Vec::new(),
        board: Vec::new(),
        settings: serde_json::from_str(&row.get::<_, String>("settings_json")?)?,
        layout: serde_json::from_str(&row.get::<_, String>("layout_json")?)?,
        overlays: RecipeOverlays::default(),
        rev: row.get::<_, i64>("rev")? as u32,
        stamps: stamps(row)?,
    })
}

fn recipe_children(conn: &Connection, recipe: &mut Recipe) -> CatalogResult<()> {
    let id = recipe.id.as_str().to_owned();

    let mut stmt =
        conn.prepare("SELECT team_id FROM recipe_teams WHERE recipe_id = ?1 ORDER BY position")?;
    recipe.teams = stmt
        .query_map(params![id], |row| Ok(TeamId::new(row.get::<_, String>(0)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut stmt = conn
        .prepare("SELECT domain_id FROM recipe_domains WHERE recipe_id = ?1 ORDER BY position")?;
    let domains = stmt
        .query_map(params![id], |row| {
            Ok(DomainId::new(row.get::<_, String>(0)?))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut stmt = conn.prepare(
        "SELECT question_id FROM recipe_questions
         WHERE recipe_id = ?1 AND domain_id = ?2 ORDER BY position",
    )?;
    recipe.board = domains
        .into_iter()
        .map(|domain_id| -> CatalogResult<BoardDomain> {
            let question_ids = stmt
                .query_map(params![id, domain_id.as_str()], |row| {
                    Ok(QuestionId::new(row.get::<_, String>(0)?))
                })?
                .collect::<rusqlite::Result<Vec<_>>>()?;
            Ok(BoardDomain {
                domain_id,
                question_ids,
            })
        })
        .collect::<CatalogResult<Vec<_>>>()?;

    recipe.overlays = overlays_get(conn, &recipe.id)?;
    Ok(())
}

pub(super) fn recipe_get(conn: &Connection, id: &RecipeId) -> CatalogResult<Recipe> {
    let mut recipe = conn
        .query_row(
            "SELECT * FROM recipes WHERE id = ?1",
            params![id.as_str()],
            |row| Ok(recipe_row(row)),
        )
        .optional()?
        .transpose()?
        .ok_or_else(|| CatalogError::not_found(CatalogKind::Recipe, id.as_str()))?;
    recipe_children(conn, &mut recipe)?;
    Ok(recipe)
}

pub(super) fn recipe_list(conn: &Connection, scope: ArchiveScope) -> CatalogResult<Vec<Recipe>> {
    let sql = format!(
        "SELECT * FROM recipes WHERE {} ORDER BY name, id",
        scope.sql()
    );
    let mut stmt = conn.prepare(&sql)?;
    let mut recipes = stmt
        .query_map([], |row| Ok(recipe_row(row)))?
        .collect::<rusqlite::Result<Vec<_>>>()?
        .into_iter()
        .collect::<CatalogResult<Vec<_>>>()?;
    for recipe in &mut recipes {
        recipe_children(conn, recipe)?;
    }
    Ok(recipes)
}

/// The whole recipe in **one transaction** (§11.B). Roster, board, settings,
/// layout and overlays land together or not at all, and `rev` advances once.
pub(super) fn recipe_upsert(
    tx: &Transaction<'_>,
    recipe: &Recipe,
    now_ms: u64,
) -> CatalogResult<u32> {
    let id = recipe.id.as_str();
    let created_at = carried_created_at(tx, "recipes", id, now_ms)?;
    let rev: i64 = tx
        .query_row(
            "SELECT rev FROM recipes WHERE id = ?1",
            params![id],
            |row| row.get(0),
        )
        .optional()?
        .unwrap_or(0)
        + 1;

    tx.execute(
        "INSERT INTO recipes (id, name, folder, tags_json, settings_json, layout_json, rev,
                              created_at, updated_at, archived_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9,
                 (SELECT archived_at FROM recipes WHERE id = ?1))
         ON CONFLICT(id) DO UPDATE SET
             name = excluded.name, folder = excluded.folder, tags_json = excluded.tags_json,
             settings_json = excluded.settings_json, layout_json = excluded.layout_json,
             rev = excluded.rev, updated_at = excluded.updated_at",
        params![
            id,
            recipe.name,
            recipe.folder,
            serde_json::to_string(&recipe.tags)?,
            serde_json::to_string(&recipe.settings)?,
            serde_json::to_string(&recipe.layout)?,
            rev,
            ms(created_at),
            ms(now_ms),
        ],
    )?;

    tx.execute("DELETE FROM recipe_teams WHERE recipe_id = ?1", params![id])?;
    for (position, team) in recipe.teams.iter().enumerate() {
        tx.execute(
            "INSERT INTO recipe_teams (recipe_id, team_id, position) VALUES (?1, ?2, ?3)",
            params![id, team.as_str(), position as i64],
        )?;
    }
    tx.execute(
        "DELETE FROM recipe_domains WHERE recipe_id = ?1",
        params![id],
    )?;
    tx.execute(
        "DELETE FROM recipe_questions WHERE recipe_id = ?1",
        params![id],
    )?;
    for (position, domain) in recipe.board.iter().enumerate() {
        tx.execute(
            "INSERT INTO recipe_domains (recipe_id, domain_id, position) VALUES (?1, ?2, ?3)",
            params![id, domain.domain_id.as_str(), position as i64],
        )?;
        for (index, question) in domain.question_ids.iter().enumerate() {
            tx.execute(
                "INSERT INTO recipe_questions (recipe_id, domain_id, question_id, position)
                 VALUES (?1, ?2, ?3, ?4)",
                params![
                    id,
                    domain.domain_id.as_str(),
                    question.as_str(),
                    index as i64
                ],
            )?;
        }
    }

    overlays_replace(tx, &recipe.id, &recipe.overlays)?;
    Ok(rev as u32)
}

// -------------------------------------------------------------------- overlays

const OVERLAY_TEAM: &str = "team";
const OVERLAY_DOMAIN: &str = "domain";
const OVERLAY_QUESTION: &str = "question";

fn overlays_get(conn: &Connection, recipe: &RecipeId) -> CatalogResult<RecipeOverlays> {
    let mut stmt = conn.prepare(
        "SELECT target_kind, target_id, patch_json FROM recipe_overlays WHERE recipe_id = ?1",
    )?;
    let rows = stmt
        .query_map(params![recipe.as_str()], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    let mut overlays = RecipeOverlays::default();
    for (kind, id, patch) in rows {
        match kind.as_str() {
            OVERLAY_TEAM => {
                overlays.teams.insert(
                    TeamId::new(id),
                    serde_json::from_str::<TeamOverlay>(&patch)?,
                );
            }
            OVERLAY_DOMAIN => {
                overlays.domains.insert(
                    DomainId::new(id),
                    serde_json::from_str::<DomainOverlay>(&patch)?,
                );
            }
            OVERLAY_QUESTION => {
                overlays.questions.insert(
                    QuestionId::new(id),
                    serde_json::from_str::<QuestionOverlay>(&patch)?,
                );
            }
            // A kind this build does not know is left alone rather than
            // dropped: the row belongs to a recipe, not to this function.
            _ => {}
        }
    }
    Ok(overlays)
}

fn overlays_replace(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    overlays: &RecipeOverlays,
) -> CatalogResult<()> {
    tx.execute(
        "DELETE FROM recipe_overlays WHERE recipe_id = ?1 AND target_kind IN (?2, ?3, ?4)",
        params![
            recipe.as_str(),
            OVERLAY_TEAM,
            OVERLAY_DOMAIN,
            OVERLAY_QUESTION
        ],
    )?;
    for (id, patch) in &overlays.teams {
        overlay_put(tx, recipe, OVERLAY_TEAM, id.as_str(), patch)?;
    }
    for (id, patch) in &overlays.domains {
        overlay_put(tx, recipe, OVERLAY_DOMAIN, id.as_str(), patch)?;
    }
    for (id, patch) in &overlays.questions {
        overlay_put(tx, recipe, OVERLAY_QUESTION, id.as_str(), patch)?;
    }
    Ok(())
}

fn overlay_put<T: serde::Serialize>(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    kind: &str,
    target: &str,
    patch: &T,
) -> CatalogResult<()> {
    tx.execute(
        "INSERT INTO recipe_overlays (recipe_id, target_kind, target_id, patch_json)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(recipe_id, target_kind, target_id)
         DO UPDATE SET patch_json = excluded.patch_json",
        params![recipe.as_str(), kind, target, serde_json::to_string(patch)?],
    )?;
    Ok(())
}

pub(super) fn overlay_set_team(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    team: &TeamId,
    patch: Option<&TeamOverlay>,
) -> CatalogResult<()> {
    overlay_set(tx, recipe, OVERLAY_TEAM, team.as_str(), patch)
}

pub(super) fn overlay_set_domain(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    domain: &DomainId,
    patch: Option<&DomainOverlay>,
) -> CatalogResult<()> {
    overlay_set(tx, recipe, OVERLAY_DOMAIN, domain.as_str(), patch)
}

pub(super) fn overlay_set_question(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    question: &QuestionId,
    patch: Option<&QuestionOverlay>,
) -> CatalogResult<()> {
    overlay_set(tx, recipe, OVERLAY_QUESTION, question.as_str(), patch)
}

/// `None` drops the overlay — that is Reset (§2.17), and it is a delete of a
/// patch, never of a catalog row.
fn overlay_set<T: serde::Serialize>(
    tx: &Transaction<'_>,
    recipe: &RecipeId,
    kind: &str,
    target: &str,
    patch: Option<&T>,
) -> CatalogResult<()> {
    match patch {
        Some(patch) => overlay_put(tx, recipe, kind, target, patch),
        None => {
            tx.execute(
                "DELETE FROM recipe_overlays
                 WHERE recipe_id = ?1 AND target_kind = ?2 AND target_id = ?3",
                params![recipe.as_str(), kind, target],
            )?;
            Ok(())
        }
    }
}

// ------------------------------------------------------------- archive and refs

/// Soft delete / restore. One statement, and no path in the crate deletes a
/// catalog row (§4.1: hard delete is not v1).
pub(super) fn set_archived(
    conn: &Connection,
    kind: CatalogKind,
    id: &str,
    at_ms: Option<u64>,
) -> CatalogResult<()> {
    let sql = format!("UPDATE {} SET archived_at = ?1 WHERE id = ?2", kind.table());
    let changed = conn.execute(&sql, params![opt_ms(at_ms), id])?;
    if changed == 0 {
        return Err(CatalogError::not_found(kind, id));
    }
    Ok(())
}

/// What still points at this row. `None` means nothing does.
///
/// This is the guard behind "cannot purge a row recipes or open Plays still
/// point at" (§4.1). Archiving stays legal — an archived team a recipe uses is
/// a warn for the operator, not a corrupted board — so this is consulted by
/// the paths that would *remove* data, and by `catalog_archive` to report it.
pub(super) fn referenced_by(
    conn: &Connection,
    kind: CatalogKind,
    id: &str,
) -> CatalogResult<Option<&'static str>> {
    let queries: &[(&str, &'static str)] = match kind {
        CatalogKind::Team => &[(
            "SELECT 1 FROM recipe_teams WHERE team_id = ?1 LIMIT 1",
            "a recipe roster",
        )],
        CatalogKind::Domain => &[(
            "SELECT 1 FROM recipe_domains WHERE domain_id = ?1 LIMIT 1",
            "a recipe board",
        )],
        CatalogKind::Question => &[
            (
                "SELECT 1 FROM recipe_questions WHERE question_id = ?1 LIMIT 1",
                "a recipe board",
            ),
            (
                "SELECT 1 FROM domain_questions WHERE question_id = ?1 LIMIT 1",
                "a domain",
            ),
        ],
        CatalogKind::Asset => &[
            (
                "SELECT 1 FROM teams WHERE logo_asset_id = ?1 LIMIT 1",
                "a team logo",
            ),
            (
                "SELECT 1 FROM questions WHERE media_asset_id = ?1 LIMIT 1",
                "question media",
            ),
        ],
        CatalogKind::Recipe => &[(
            "SELECT 1 FROM plays WHERE recipe_id = ?1 AND status IN ('playing', 'paused') LIMIT 1",
            "an open play",
        )],
        CatalogKind::Operator => &[],
    };
    for (sql, used_by) in queries {
        let hit: Option<i64> = conn
            .query_row(sql, params![id], |row| row.get(0))
            .optional()?;
        if hit.is_some() {
            return Ok(Some(used_by));
        }
    }
    Ok(None)
}

// --------------------------------------------------------------------- globals

pub(super) fn global_get(conn: &Connection, key: &str) -> CatalogResult<Option<String>> {
    Ok(conn
        .query_row(
            "SELECT value_json FROM globals WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .optional()?)
}

pub(super) fn global_set(conn: &Connection, key: &str, value_json: &str) -> CatalogResult<()> {
    conn.execute(
        "INSERT INTO globals (key, value_json) VALUES (?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
        params![key, value_json],
    )?;
    Ok(())
}

// ----------------------------------------------------------------- the play log

/// The highest `seq` already stored for a Play, `0` when it is new.
pub(super) fn events_high_water(conn: &Connection, play: &PlayId) -> CatalogResult<u64> {
    let seq: Option<i64> = conn.query_row(
        "SELECT MAX(seq) FROM events WHERE play_id = ?1",
        params![play.as_str()],
        |row| row.get(0),
    )?;
    Ok(seq.unwrap_or(0) as u64)
}

pub(super) fn events_append(
    tx: &Transaction<'_>,
    play: &PlayId,
    events: &[crate::event::Event],
) -> CatalogResult<()> {
    for event in events {
        tx.execute(
            "INSERT INTO events (play_id, seq, id, at_ms, kind_json) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                play.as_str(),
                event.seq as i64,
                event.id.as_str(),
                ms(event.at_ms),
                serde_json::to_string(&event.kind)?,
            ],
        )?;
    }
    Ok(())
}

pub(super) fn events_read(
    conn: &Connection,
    play: &PlayId,
) -> CatalogResult<Vec<crate::event::Event>> {
    let mut stmt = conn
        .prepare("SELECT seq, id, at_ms, kind_json FROM events WHERE play_id = ?1 ORDER BY seq")?;
    let rows = stmt
        .query_map(params![play.as_str()], |row| {
            Ok((
                row.get::<_, i64>(0)? as u64,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)? as u64,
                row.get::<_, String>(3)?,
            ))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;

    rows.into_iter()
        .map(|(seq, id, at_ms, kind_json)| {
            Ok(crate::event::Event {
                seq,
                id: crate::ids::EventId::new(id),
                at_ms,
                kind: serde_json::from_str(&kind_json)?,
            })
        })
        .collect()
}

/// Every Play the log knows about, oldest first. The projection is rebuilt from
/// this list at boot, so it is the list of things to replay.
pub(super) fn event_play_ids(conn: &Connection) -> CatalogResult<Vec<PlayId>> {
    let mut stmt = conn.prepare(
        "SELECT play_id, MIN(at_ms) AS first_at FROM events GROUP BY play_id ORDER BY first_at",
    )?;
    Ok(stmt
        .query_map([], |row| Ok(PlayId::new(row.get::<_, String>(0)?)))?
        .collect::<rusqlite::Result<Vec<_>>>()?)
}

pub(super) fn play_projection_put(
    conn: &Connection,
    record: &super::model::PlayRecord,
) -> CatalogResult<()> {
    conn.execute(
        "INSERT INTO plays (id, recipe_id, status, started_at_ms, ended_at_ms,
                            event_count, questions_consumed, scores_json)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
         ON CONFLICT(id) DO UPDATE SET
             recipe_id = excluded.recipe_id, status = excluded.status,
             started_at_ms = excluded.started_at_ms, ended_at_ms = excluded.ended_at_ms,
             event_count = excluded.event_count,
             questions_consumed = excluded.questions_consumed,
             scores_json = excluded.scores_json",
        params![
            record.id.as_str(),
            record.recipe_id.as_str(),
            record.status,
            opt_ms(record.started_at_ms),
            opt_ms(record.ended_at_ms),
            record.event_count as i64,
            i64::from(record.questions_consumed),
            serde_json::to_string(&record.scores)?,
        ],
    )?;
    Ok(())
}

fn play_record_row(row: &Row<'_>) -> CatalogResult<super::model::PlayRecord> {
    let scores: BTreeMap<String, u32> =
        serde_json::from_str(&row.get::<_, String>("scores_json")?)?;
    Ok(super::model::PlayRecord {
        id: PlayId::new(row.get::<_, String>("id")?),
        recipe_id: RecipeId::new(row.get::<_, String>("recipe_id")?),
        status: row.get("status")?,
        started_at_ms: read_opt_u64(row, "started_at_ms")?,
        ended_at_ms: read_opt_u64(row, "ended_at_ms")?,
        event_count: read_u64(row, "event_count")?,
        questions_consumed: row.get::<_, i64>("questions_consumed")? as u32,
        scores: scores
            .into_iter()
            .map(|(id, score)| (TeamId::new(id), score))
            .collect(),
    })
}

pub(super) fn play_list(
    conn: &Connection,
    recipe: Option<&RecipeId>,
) -> CatalogResult<Vec<super::model::PlayRecord>> {
    let (sql, params): (&str, Vec<String>) = match recipe {
        Some(id) => (
            "SELECT * FROM plays WHERE recipe_id = ?1 ORDER BY started_at_ms, id",
            vec![id.as_str().to_owned()],
        ),
        None => ("SELECT * FROM plays ORDER BY started_at_ms, id", Vec::new()),
    };
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map(rusqlite::params_from_iter(params), |row| {
            Ok(play_record_row(row))
        })?
        .collect::<rusqlite::Result<Vec<_>>>()?;
    rows.into_iter().collect()
}

/// The Play that was still open when the process stopped, if any. At most one
/// can be `playing | paused` (§4.3), which is why this returns a single row.
pub(super) fn open_play_id(conn: &Connection) -> CatalogResult<Option<PlayId>> {
    Ok(conn
        .query_row(
            "SELECT id FROM plays WHERE status IN ('playing', 'paused') ORDER BY started_at_ms LIMIT 1",
            [],
            |row| Ok(PlayId::new(row.get::<_, String>(0)?)),
        )
        .optional()?)
}

/// Any *other* open Play of the same recipe. §4.3: two Plays of one recipe
/// cannot be `playing` at once, and that has to hold across a restart of the
/// process, not only inside one `MatchService`.
pub(super) fn other_open_play_of(
    conn: &Connection,
    recipe: &RecipeId,
    except: &PlayId,
) -> CatalogResult<Option<PlayId>> {
    Ok(conn
        .query_row(
            "SELECT id FROM plays
             WHERE recipe_id = ?1 AND id <> ?2 AND status IN ('playing', 'paused') LIMIT 1",
            params![recipe.as_str(), except.as_str()],
            |row| Ok(PlayId::new(row.get::<_, String>(0)?)),
        )
        .optional()?)
}
