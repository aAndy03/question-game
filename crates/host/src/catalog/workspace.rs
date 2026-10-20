//! Workspaces (Beta 2.0): several libraries in one file, and a shared library
//! every workspace sees.
//!
//! A workspace is a name the operator typed and nothing else — no kind, no
//! template, no suggested name. What a workspace sees is its own rows and the
//! shared ones, and that scope is decided in the host, on the writer
//! connection ([`super::db::bind_workspace`]), for every read and write.
//! Operators, shortcuts and the app's own settings stay global.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::flags::WorkspaceDefaults;
use crate::ids::{AssetId, DomainId, QuestionId, RecipeId, TeamId, WorkspaceGroupId, WorkspaceId};

use super::backup::{self, OpenOptions};
use super::db;
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{ArchiveScope, Asset, Domain, Question, Recipe, Team};
use super::service::CatalogService;
use super::store;

/// The longest workspace or group name, in characters.
pub const WORKSPACE_NAME_MAX: usize = 60;

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: WorkspaceId,
    /// `None` until the operator names it: the workspace a migrated or a fresh
    /// library starts in. Studio asks for the name before anything else.
    pub name: Option<String>,
    pub group_id: Option<WorkspaceGroupId>,
    pub sort_key: i64,
    /// Per-workspace defaults, a patch over the globals document.
    pub settings: Option<serde_json::Value>,
    pub created_at: u64,
    pub updated_at: u64,
    pub archived_at: Option<u64>,
}

impl Workspace {
    pub fn is_archived(&self) -> bool {
        self.archived_at.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceGroup {
    pub id: WorkspaceGroupId,
    pub name: String,
    pub sort_key: i64,
    pub created_at: u64,
    pub updated_at: u64,
}

/// A name as stored: trimmed, not empty, at most [`WORKSPACE_NAME_MAX`]
/// characters. `path` is the notice's `target_path`.
pub(crate) fn clean_name(name: &str, path: &str) -> CatalogResult<String> {
    let name = name.trim();
    if name.is_empty() {
        return Err(CatalogError::invalid(path, "a name is required"));
    }
    if name.chars().count() > WORKSPACE_NAME_MAX {
        return Err(CatalogError::invalid(
            path,
            "a name is at most 60 characters",
        ));
    }
    Ok(name.to_owned())
}

/// Names compare case-insensitively, by Unicode lower case — `COLLATE NOCASE`
/// folds ASCII only, and "Ediție" and "EDIȚIE" are one name.
pub(crate) fn same_name(a: &str, b: &str) -> bool {
    a.trim().to_lowercase() == b.trim().to_lowercase()
}

/// A fresh id: `ws-` or `wsg-` and eight hex digits.
pub(crate) fn fresh_id(prefix: &str) -> String {
    let uuid = uuid::Uuid::new_v4().simple().to_string();
    format!("{prefix}-{}", &uuid[..8])
}

/// What *Delete permanently* removed, and where the copy taken first is.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteReport {
    pub rows: usize,
    pub games: usize,
    pub plays: usize,
    pub backup: std::path::PathBuf,
}

/// The key under which a workspace keeps its own defaults in `settings`.
const DEFAULTS: &str = "defaults";

impl CatalogService {
    /// Every workspace, archived ones included (flagged), and every group.
    pub fn workspace_list(&self) -> CatalogResult<(Vec<Workspace>, Vec<WorkspaceGroup>)> {
        let conn = self.conn();
        Ok((store::workspace_list(&conn)?, store::group_list(&conn)?))
    }

    /// The workspace every read and write is scoped to. Every library has one
    /// from migration 4 on, and the current one cannot be archived.
    pub fn current_workspace(&self) -> WorkspaceId {
        store::current_workspace(&self.conn())
            .expect("the writer connection is bound to a workspace at open")
    }

    /// A workspace the operator named. Names are typed, trimmed, at most 60
    /// characters and unique among active workspaces, ignoring case.
    pub fn workspace_create(
        &self,
        name: &str,
        group: Option<&WorkspaceGroupId>,
        now_ms: u64,
    ) -> CatalogResult<Workspace> {
        let conn = self.conn();
        let name = free_name(&conn, name, None)?;
        if let Some(group) = group {
            group_row(&conn, group)?;
        }
        let workspace = Workspace {
            id: WorkspaceId::new(fresh_id("ws")),
            name: Some(name),
            group_id: group.cloned(),
            sort_key: store::workspace_next_sort_key(&conn)?,
            settings: None,
            created_at: now_ms,
            updated_at: now_ms,
            archived_at: None,
        };
        store::workspace_insert(&conn, &workspace)?;
        Ok(workspace)
    }

    /// Rename a workspace — and name the one a library starts in.
    pub fn workspace_rename(&self, id: &WorkspaceId, name: &str, now_ms: u64) -> CatalogResult<()> {
        let conn = self.conn();
        let mut workspace = workspace_row(&conn, id)?;
        workspace.name = Some(free_name(&conn, name, Some(id))?);
        workspace.updated_at = now_ms;
        store::workspace_update(&conn, &workspace)
    }

    /// Put a workspace in a group (or none) at a place in it.
    pub fn workspace_set_group(
        &self,
        id: &WorkspaceId,
        group: Option<&WorkspaceGroupId>,
        sort_key: i64,
        now_ms: u64,
    ) -> CatalogResult<()> {
        let conn = self.conn();
        let mut workspace = workspace_row(&conn, id)?;
        if let Some(group) = group {
            group_row(&conn, group)?;
        }
        workspace.group_id = group.cloned();
        workspace.sort_key = sort_key;
        workspace.updated_at = now_ms;
        store::workspace_update(&conn, &workspace)
    }

    /// Work in another workspace. Only an active one; the app refuses this
    /// while a game is loaded in Control, since the Play is scoped to the
    /// workspace its game lives in. The search index is rebuilt for the new
    /// scope (a few dozen milliseconds for thousands of rows).
    pub fn workspace_switch(&self, id: &WorkspaceId) -> CatalogResult<()> {
        {
            let conn = self.conn();
            let workspace = workspace_row(&conn, id)?;
            if workspace.is_archived() {
                return Err(CatalogError::invalid(
                    format!("workspace/{id}"),
                    "an archived workspace cannot be opened",
                ));
            }
            db::bind_workspace(&conn, id.as_str())?;
            store::global_set(
                &conn,
                db::META_CURRENT_WORKSPACE,
                &serde_json::to_string(id.as_str())?,
            )?;
        }
        self.rebuild_search_index()?;
        Ok(())
    }

    /// Archive a workspace: it leaves the switcher, its rows stay. Not the
    /// current one (open another first), so there is always one to work in.
    pub fn workspace_archive(&self, id: &WorkspaceId, now_ms: u64) -> CatalogResult<()> {
        let conn = self.conn();
        let mut workspace = workspace_row(&conn, id)?;
        if workspace.is_archived() {
            return Ok(());
        }
        if &store::current_workspace(&conn)? == id {
            return Err(CatalogError::invalid(
                format!("workspace/{id}"),
                "open another workspace before archiving this one",
            ));
        }
        workspace.archived_at = Some(now_ms);
        workspace.updated_at = now_ms;
        store::workspace_update(&conn, &workspace)
    }

    /// Bring an archived workspace back. Its name must still be free.
    pub fn workspace_restore(&self, id: &WorkspaceId, now_ms: u64) -> CatalogResult<()> {
        let conn = self.conn();
        let mut workspace = workspace_row(&conn, id)?;
        if !workspace.is_archived() {
            return Ok(());
        }
        if let Some(name) = &workspace.name {
            free_name(&conn, name, Some(id))?;
        }
        workspace.archived_at = None;
        workspace.updated_at = now_ms;
        store::workspace_update(&conn, &workspace)
    }

    /// What *Delete permanently* would remove — rows, games, Plays — for the
    /// confirm that names them.
    pub fn workspace_delete_preview(&self, id: &WorkspaceId) -> CatalogResult<(usize, usize, usize)> {
        let conn = self.conn();
        workspace_row(&conn, id)?;
        store::workspace_counts(&conn, id)
    }

    /// *Delete permanently*: an **archived** workspace, its rows, games, Plays
    /// and logs — never a shared row, never an asset file. The library is
    /// copied first (the normal rotation), and the delete is one transaction.
    pub fn workspace_delete(&self, id: &WorkspaceId, backup: &OpenOptions) -> CatalogResult<DeleteReport> {
        let mut conn = self.conn();
        let workspace = workspace_row(&conn, id)?;
        if !workspace.is_archived() {
            return Err(CatalogError::invalid(
                format!("workspace/{id}"),
                "only an archived workspace can be deleted",
            ));
        }
        let (rows, games, plays) = store::workspace_counts(&conn, id)?;
        let taken = backup::write(&conn, &backup.backup_dir, "pre-delete", &backup.stamp)?;
        backup::prune(&backup.backup_dir, backup.keep, &taken);
        let tx = conn.transaction()?;
        store::workspace_purge(&tx, id)?;
        tx.commit()?;
        Ok(DeleteReport {
            rows,
            games,
            plays,
            backup: taken,
        })
    }

    /// A new workspace holding a copy of every local row and game of `id` —
    /// new ids, the same shared references, archived rows as archived — and
    /// none of its Plays. Each copy joins its original's family, so an edit
    /// can follow it later. One transaction.
    pub fn workspace_duplicate(&self, id: &WorkspaceId, name: &str, now_ms: u64) -> CatalogResult<Workspace> {
        let mut conn = self.conn();
        let source = workspace_row(&conn, id)?;
        let current = store::current_workspace(&conn)?;
        let target = Workspace {
            id: WorkspaceId::new(fresh_id("ws")),
            name: Some(free_name(&conn, name, None)?),
            group_id: source.group_id.clone(),
            sort_key: store::workspace_next_sort_key(&conn)?,
            settings: source.settings.clone(),
            created_at: now_ms,
            updated_at: now_ms,
            archived_at: None,
        };
        let tx = conn.transaction()?;
        let result = duplicate_into(&tx, id, &target, now_ms);
        // Put the binding back whatever happened: a duplicate leaves the
        // operator in the workspace they were in.
        db::bind_workspace(&tx, current.as_str())?;
        result?;
        tx.commit()?;
        Ok(target)
    }

    /// This workspace's own defaults (game defaults and the timer), if it
    /// has any yet. `None` means "whatever the app had when it got here":
    /// the migrated workspace takes the settings document's, a new one the
    /// workspace it was opened from.
    pub fn workspace_defaults(&self, id: &WorkspaceId) -> CatalogResult<Option<WorkspaceDefaults>> {
        let conn = self.conn();
        let workspace = workspace_row(&conn, id)?;
        match workspace.settings.as_ref().and_then(|s| s.get(DEFAULTS)) {
            Some(value) => Ok(Some(serde_json::from_value(value.clone())?)),
            None => Ok(None),
        }
    }

    pub fn workspace_set_defaults(
        &self,
        id: &WorkspaceId,
        defaults: &WorkspaceDefaults,
        now_ms: u64,
    ) -> CatalogResult<()> {
        crate::flags::validate(&defaults.game_defaults)?;
        let conn = self.conn();
        let mut workspace = workspace_row(&conn, id)?;
        let mut settings = match workspace.settings.take() {
            Some(serde_json::Value::Object(map)) => map,
            _ => serde_json::Map::new(),
        };
        settings.insert(DEFAULTS.to_owned(), serde_json::to_value(defaults)?);
        workspace.settings = Some(serde_json::Value::Object(settings));
        workspace.updated_at = now_ms;
        store::workspace_update(&conn, &workspace)
    }

    // ------------------------------------------------------------------ groups

    pub fn group_create(&self, name: &str, now_ms: u64) -> CatalogResult<WorkspaceGroup> {
        let conn = self.conn();
        let groups = store::group_list(&conn)?;
        let group = WorkspaceGroup {
            id: WorkspaceGroupId::new(fresh_id("wsg")),
            name: free_group_name(&groups, name, None)?,
            sort_key: groups.iter().map(|g| g.sort_key + 1).max().unwrap_or(0),
            created_at: now_ms,
            updated_at: now_ms,
        };
        store::group_insert(&conn, &group)?;
        Ok(group)
    }

    pub fn group_rename(&self, id: &WorkspaceGroupId, name: &str, now_ms: u64) -> CatalogResult<()> {
        let conn = self.conn();
        let groups = store::group_list(&conn)?;
        let mut group = group_row(&conn, id)?;
        group.name = free_group_name(&groups, name, Some(id))?;
        group.updated_at = now_ms;
        store::group_insert(&conn, &group)
    }

    /// The groups in this order; a group not named keeps its place after them.
    pub fn group_reorder(&self, order: &[WorkspaceGroupId], now_ms: u64) -> CatalogResult<()> {
        let mut conn = self.conn();
        let groups = store::group_list(&conn)?;
        let tx = conn.transaction()?;
        let mut key = 0;
        for id in order {
            let Some(group) = groups.iter().find(|g| &g.id == id) else {
                return Err(CatalogError::invalid(format!("workspace-group/{id}"), "no such group"));
            };
            store::group_insert(&tx, &WorkspaceGroup { sort_key: key, updated_at: now_ms, ..group.clone() })?;
            key += 1;
        }
        for group in groups.iter().filter(|g| !order.contains(&g.id)) {
            store::group_insert(&tx, &WorkspaceGroup { sort_key: key, ..group.clone() })?;
            key += 1;
        }
        tx.commit()?;
        Ok(())
    }

    /// The group goes; its workspaces stay, ungrouped.
    pub fn group_delete(&self, id: &WorkspaceGroupId) -> CatalogResult<()> {
        let conn = self.conn();
        group_row(&conn, id)?;
        store::group_delete(&conn, id)?;
        Ok(())
    }
}

fn workspace_row(conn: &Connection, id: &WorkspaceId) -> CatalogResult<Workspace> {
    store::workspace_get(conn, id)?
        .ok_or_else(|| CatalogError::invalid(format!("workspace/{id}"), "no such workspace"))
}

fn group_row(conn: &Connection, id: &WorkspaceGroupId) -> CatalogResult<WorkspaceGroup> {
    store::group_list(conn)?
        .into_iter()
        .find(|g| &g.id == id)
        .ok_or_else(|| CatalogError::invalid(format!("workspace-group/{id}"), "no such group"))
}

/// A cleaned name no other active workspace has.
fn free_name(conn: &Connection, name: &str, except: Option<&WorkspaceId>) -> CatalogResult<String> {
    let path = match except {
        Some(id) => format!("workspace/{id}/name"),
        None => "workspace/new/name".to_owned(),
    };
    let name = clean_name(name, &path)?;
    let taken = store::workspace_list(conn)?.into_iter().any(|w| {
        !w.is_archived()
            && Some(&w.id) != except
            && w.name.as_deref().is_some_and(|n| same_name(n, &name))
    });
    if taken {
        return Err(CatalogError::invalid(path, "another workspace has this name"));
    }
    Ok(name)
}

fn free_group_name(
    groups: &[WorkspaceGroup],
    name: &str,
    except: Option<&WorkspaceGroupId>,
) -> CatalogResult<String> {
    let path = match except {
        Some(id) => format!("workspace-group/{id}/name"),
        None => "workspace-group/new/name".to_owned(),
    };
    let name = clean_name(name, &path)?;
    if groups.iter().any(|g| Some(&g.id) != except && same_name(&g.name, &name)) {
        return Err(CatalogError::invalid(path, "another group has this name"));
    }
    Ok(name)
}

/// The body of [`CatalogService::workspace_duplicate`], inside its
/// transaction: read the source's local rows with the connection bound to the
/// source, then write the copies with it bound to the target.
fn duplicate_into(
    tx: &rusqlite::Transaction<'_>,
    source: &WorkspaceId,
    target: &Workspace,
    now_ms: u64,
) -> CatalogResult<()> {
    use std::collections::HashMap;

    store::workspace_insert(tx, target)?;
    db::bind_workspace(tx, source.as_str())?;
    let local = |shared: bool| !shared;
    let assets: Vec<Asset> =
        store::asset_list(tx, ArchiveScope::All)?.into_iter().filter(|r| local(r.stamps.shared)).collect();
    let questions: Vec<Question> =
        store::question_list(tx, ArchiveScope::All)?.into_iter().filter(|r| local(r.stamps.shared)).collect();
    let teams: Vec<Team> =
        store::team_list(tx, ArchiveScope::All)?.into_iter().filter(|r| local(r.stamps.shared)).collect();
    let domains: Vec<Domain> =
        store::domain_list(tx, ArchiveScope::All)?.into_iter().filter(|r| local(r.stamps.shared)).collect();
    let recipes: Vec<Recipe> = store::recipe_list(tx, ArchiveScope::All)?;
    db::bind_workspace(tx, target.id.as_str())?;

    let mut next = store::next_family(tx)?;
    let mut join = |kind: CatalogKind, from: &str, to: &str| -> CatalogResult<()> {
        let family = match store::family_of(tx, kind, from)? {
            Some(existing) => existing,
            None => {
                let fresh = next;
                next += 1;
                store::set_family(tx, kind, from, Some(fresh))?;
                fresh
            }
        };
        store::set_family(tx, kind, to, Some(family))
    };
    let mut archived: Vec<(CatalogKind, String, u64)> = Vec::new();

    let fresh = |rows: Vec<String>, prefix: &str| -> HashMap<String, String> {
        rows.into_iter().map(|id| (id, fresh_id(prefix))).collect()
    };
    let asset_ids = fresh(assets.iter().map(|r| r.id.to_string()).collect(), "asset");
    let question_ids = fresh(questions.iter().map(|r| r.id.to_string()).collect(), "q");
    let team_ids = fresh(teams.iter().map(|r| r.id.to_string()).collect(), "team");
    let domain_ids = fresh(domains.iter().map(|r| r.id.to_string()).collect(), "dom");
    // A shared reference is kept as it is: only local rows get new ids.
    let map = |ids: &HashMap<String, String>, id: &str| ids.get(id).cloned().unwrap_or_else(|| id.to_owned());

    for asset in &assets {
        let mut copy = asset.clone();
        copy.id = AssetId::new(map(&asset_ids, asset.id.as_str()));
        store::asset_upsert(tx, &copy, now_ms)?;
        join(CatalogKind::Asset, asset.id.as_str(), copy.id.as_str())?;
        if let Some(at) = asset.stamps.archived_at {
            archived.push((CatalogKind::Asset, copy.id.to_string(), at));
        }
    }
    for question in &questions {
        let mut copy = question.clone();
        copy.id = QuestionId::new(map(&question_ids, question.id.as_str()));
        copy.media_asset_id = question.media_asset_id.as_ref().map(|a| AssetId::new(map(&asset_ids, a.as_str())));
        store::question_upsert(tx, &copy, now_ms)?;
        join(CatalogKind::Question, question.id.as_str(), copy.id.as_str())?;
        if let Some(at) = question.stamps.archived_at {
            archived.push((CatalogKind::Question, copy.id.to_string(), at));
        }
    }
    for team in &teams {
        let mut copy = team.clone();
        copy.id = TeamId::new(map(&team_ids, team.id.as_str()));
        copy.logo_asset_id = team.logo_asset_id.as_ref().map(|a| AssetId::new(map(&asset_ids, a.as_str())));
        store::team_upsert(tx, &copy, now_ms)?;
        join(CatalogKind::Team, team.id.as_str(), copy.id.as_str())?;
        if let Some(at) = team.stamps.archived_at {
            archived.push((CatalogKind::Team, copy.id.to_string(), at));
        }
    }
    for domain in &domains {
        let mut copy = domain.clone();
        copy.id = DomainId::new(map(&domain_ids, domain.id.as_str()));
        for member in &mut copy.questions {
            member.question_id = QuestionId::new(map(&question_ids, member.question_id.as_str()));
        }
        super::groups::write_copy_with_groups(tx, domain, &mut copy, now_ms)?;
        join(CatalogKind::Domain, domain.id.as_str(), copy.id.as_str())?;
        if let Some(at) = domain.stamps.archived_at {
            archived.push((CatalogKind::Domain, copy.id.to_string(), at));
        }
    }
    for recipe in &recipes {
        let mut copy = recipe.clone();
        copy.id = RecipeId::new(fresh_id("game"));
        copy.rev = 0;
        copy.teams = recipe.teams.iter().map(|t| TeamId::new(map(&team_ids, t.as_str()))).collect();
        for board in &mut copy.board {
            board.domain_id = DomainId::new(map(&domain_ids, board.domain_id.as_str()));
            for q in &mut board.question_ids {
                *q = QuestionId::new(map(&question_ids, q.as_str()));
            }
        }
        copy.overlays.teams = std::mem::take(&mut copy.overlays.teams)
            .into_iter()
            .map(|(k, v)| (TeamId::new(map(&team_ids, k.as_str())), v))
            .collect();
        copy.overlays.domains = std::mem::take(&mut copy.overlays.domains)
            .into_iter()
            .map(|(k, v)| (DomainId::new(map(&domain_ids, k.as_str())), v))
            .collect();
        copy.overlays.questions = std::mem::take(&mut copy.overlays.questions)
            .into_iter()
            .map(|(k, v)| (QuestionId::new(map(&question_ids, k.as_str())), v))
            .collect();
        store::recipe_upsert(tx, &copy, now_ms)?;
        if let Some(at) = recipe.stamps.archived_at {
            archived.push((CatalogKind::Recipe, copy.id.to_string(), at));
        }
    }
    for (kind, id, at) in archived {
        store::set_archived(tx, kind, &id, Some(at))?;
    }
    Ok(())
}
