//! Families of copies, and edits that follow them (Beta 2.0).
//!
//! Every row copied from another — and every row copied from those — shares
//! one `family_id`: siblings, parents and copies of copies. Saving a row whose
//! family has other members can also update them: **the body only** (names,
//! text, options, difficulty, colour, notes, the asset), never membership,
//! archive state or a game's overlays. A copy the change would break — a
//! question that would clash on a board or leave an incomplete one there — is
//! skipped and named, not forced.

use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};

use crate::ids::{AssetId, DomainId, QuestionId, TeamId, WorkspaceId};

use super::db;
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::CatalogItem;
use super::service::{CatalogChange, CatalogService, ChangeOp, board_problem};
use super::store;

/// One other member of a row's family.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FamilyCopy {
    pub id: String,
    /// `None` — the shared library.
    pub workspace: Option<WorkspaceId>,
    pub workspace_name: Option<String>,
    pub archived: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkippedCopy {
    pub copy: FamilyCopy,
    /// Why the change would break it there, in the operator's words.
    pub reason: String,
}

/// What *Also update {n} copies* would do.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropagationPreview {
    pub update: Vec<FamilyCopy>,
    pub skipped: Vec<SkippedCopy>,
}

impl CatalogService {
    /// The other rows of `item`'s family, split into the ones the change can
    /// reach and the ones it would break. Empty for a row that was never
    /// copied, and always empty for operators and assets.
    pub fn propagation_preview(&self, item: &CatalogItem) -> CatalogResult<PropagationPreview> {
        item.validate()?;
        let conn = self.conn();
        let current = store::current_workspace(&conn)?;
        let result = preview(&conn, item, &current);
        db::bind_workspace(&conn, current.as_str())?;
        result
    }

    /// Save `item` and carry its body to every copy the preview did not skip,
    /// in one transaction. Returns what it did, as the preview would have said.
    pub fn catalog_upsert_propagating(
        &self,
        item: &CatalogItem,
        now_ms: u64,
    ) -> CatalogResult<(CatalogChange, PropagationPreview)> {
        item.validate()?;
        let plan = {
            let mut conn = self.conn();
            let current = store::current_workspace(&conn)?;
            let tx = conn.transaction()?;
            let result = propagate(&tx, item, &current, now_ms);
            db::bind_workspace(&tx, current.as_str())?;
            let plan = result?;
            tx.commit()?;
            plan
        };
        self.rebuild_search_index()?;
        Ok((
            CatalogChange {
                kind: item.kind(),
                id: item.id(),
                op: ChangeOp::Upserted,
            },
            plan,
        ))
    }

    /// *Stop following its copies*: the row leaves its family; the copies
    /// stay one family without it.
    pub fn catalog_unfollow(&self, kind: CatalogKind, id: &str) -> CatalogResult<()> {
        let conn = self.conn();
        // In view, or it is not this workspace's to change.
        get(&conn, kind, id)?;
        store::set_family(&conn, kind, id, None)
    }
}

fn propagate(
    tx: &Transaction<'_>,
    item: &CatalogItem,
    current: &WorkspaceId,
    now_ms: u64,
) -> CatalogResult<PropagationPreview> {
    let plan = preview(tx, item, current)?;
    db::bind_workspace(tx, current.as_str())?;
    upsert(tx, item, now_ms)?;
    for copy in &plan.update {
        let home = copy.workspace.as_ref().unwrap_or(current);
        db::bind_workspace(tx, home.as_str())?;
        let stored = get(tx, item.kind(), &copy.id)?;
        upsert(tx, &with_body(tx, &stored, item, home)?, now_ms)?;
    }
    Ok(plan)
}

fn get(conn: &Connection, kind: CatalogKind, id: &str) -> CatalogResult<CatalogItem> {
    Ok(match kind {
        CatalogKind::Team => store::team_get(conn, &TeamId::from(id))?.into(),
        CatalogKind::Domain => store::domain_get(conn, &DomainId::from(id))?.into(),
        CatalogKind::Question => store::question_get(conn, &QuestionId::from(id))?.into(),
        CatalogKind::Asset => store::asset_get(conn, &AssetId::from(id))?.into(),
        _ => return Err(CatalogError::not_found(kind, id)),
    })
}

fn upsert(tx: &Transaction<'_>, item: &CatalogItem, now_ms: u64) -> CatalogResult<()> {
    match item {
        CatalogItem::Team(team) => store::team_upsert(tx, team, now_ms),
        CatalogItem::Domain(domain) => store::domain_upsert(tx, domain, now_ms),
        CatalogItem::Question(question) => store::question_upsert(tx, question, now_ms),
        CatalogItem::Asset(asset) => store::asset_upsert(tx, asset, now_ms),
        CatalogItem::Operator(operator) => store::operator_upsert(tx, operator, now_ms),
    }
}

fn preview(
    conn: &Connection,
    item: &CatalogItem,
    current: &WorkspaceId,
) -> CatalogResult<PropagationPreview> {
    let mut out = PropagationPreview::default();
    if !matches!(
        item.kind(),
        CatalogKind::Team | CatalogKind::Domain | CatalogKind::Question
    ) {
        return Ok(out);
    }
    let Some(family) = store::family_of(conn, item.kind(), &item.id())? else {
        return Ok(out);
    };
    for (id, workspace, workspace_name, archived) in
        store::family_members(conn, item.kind(), family)?
    {
        if id == item.id() {
            continue;
        }
        let copy = FamilyCopy {
            id,
            workspace: workspace.map(WorkspaceId::new),
            workspace_name,
            archived,
        };
        let home = copy.workspace.clone().unwrap_or_else(|| current.clone());
        db::bind_workspace(conn, home.as_str())?;
        let stored = get(conn, item.kind(), &copy.id)?;
        let updated = with_body(conn, &stored, item, &home)?;
        match breaks(conn, &updated)? {
            Some(reason) => out.skipped.push(SkippedCopy { copy, reason }),
            None => out.update.push(copy),
        }
    }
    Ok(out)
}

/// `stored` with `source`'s body. An asset is carried as its copy in `home`
/// (same family), or as itself when shared; a local asset with no copy there
/// leaves the copy's own asset alone.
fn with_body(
    conn: &Connection,
    stored: &CatalogItem,
    source: &CatalogItem,
    home: &WorkspaceId,
) -> CatalogResult<CatalogItem> {
    let asset = |from: &Option<AssetId>, kept: &Option<AssetId>| -> CatalogResult<Option<AssetId>> {
        let Some(from) = from else { return Ok(None) };
        let Ok(found) = store::asset_get(conn, from) else {
            return Ok(kept.clone());
        };
        if found.stamps.shared {
            return Ok(Some(from.clone()));
        }
        Ok(match store::family_of(conn, CatalogKind::Asset, from.as_str())? {
            Some(family) => store::family_member_in(conn, CatalogKind::Asset, family, home)?
                .map(AssetId::new)
                .or_else(|| kept.clone()),
            None => kept.clone(),
        })
    };
    Ok(match (stored, source) {
        (CatalogItem::Team(stored), CatalogItem::Team(source)) => {
            let mut out = stored.clone();
            out.name = source.name.clone();
            out.short_code = source.short_code.clone();
            out.color = source.color.clone();
            out.notes = source.notes.clone();
            out.logo_asset_id = asset(&source.logo_asset_id, &stored.logo_asset_id)?;
            CatalogItem::Team(out)
        }
        (CatalogItem::Domain(stored), CatalogItem::Domain(source)) => {
            let mut out = stored.clone();
            out.name = source.name.clone();
            out.code = source.code.clone();
            out.description = source.description.clone();
            CatalogItem::Domain(out)
        }
        (CatalogItem::Question(stored), CatalogItem::Question(source)) => {
            let mut out = stored.clone();
            out.stem = source.stem.clone();
            // Option ids are unique per question, so a copy can carry them.
            out.options = source.options.clone();
            out.difficulty = source.difficulty;
            out.explanation = source.explanation.clone();
            out.media_asset_id = asset(&source.media_asset_id, &stored.media_asset_id)?;
            CatalogItem::Question(out)
        }
        _ => stored.clone(),
    })
}

/// Would this version of a copy break a board where it lives?
fn breaks(conn: &Connection, updated: &CatalogItem) -> CatalogResult<Option<String>> {
    let CatalogItem::Question(question) = updated else {
        return Ok(None);
    };
    for recipe_id in store::recipes_with_question(conn, question.id.as_str())? {
        let Ok(recipe) = store::recipe_get(conn, &recipe_id) else {
            continue;
        };
        if let Err(error) = board_problem(conn, &recipe, Some(question)) {
            let why = match &error {
                CatalogError::Invalid { reason, .. } => (*reason).to_owned(),
                other => other.to_string(),
            };
            return Ok(Some(format!("on the board of {}: {why}", recipe.name)));
        }
    }
    Ok(None)
}
