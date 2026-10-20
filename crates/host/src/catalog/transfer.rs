//! Copy, move and share between workspaces (Beta 2.0).
//!
//! The rows the operator picks never arrive alone: a domain brings its local
//! questions, a game its local roster, domains and questions, a team or a
//! question its asset — the **closure** — so nothing that arrives points at a
//! row the target cannot see. Shared rows are already everywhere and are
//! referenced, never copied or moved.
//!
//! - **Copy** — the picked rows are always new rows in the target; a needed
//!   row that already has an active copy there (same family) is reused.
//! - **Move** — the same rows, `workspace_id` changed; refused, naming each
//!   user, if anything that stays behind still uses one of them.
//! - **Make shared / make local** — the current workspace's rows into the
//!   shared library and back; make local is refused while another workspace
//!   uses the row.
//!
//! Each operation is one transaction; a refusal writes nothing. The preview
//! runs the same plan and rolls it back, so it cannot disagree with the write.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};

use crate::ids::{AssetId, DomainId, QuestionId, RecipeId, TeamId, WorkspaceId};

use super::db;
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{Asset, Domain, Question, Recipe, Team};
use super::service::CatalogService;
use super::store;
use super::workspace::fresh_id;

/// What the operator picked, by kind.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Selection {
    pub teams: Vec<TeamId>,
    pub domains: Vec<DomainId>,
    pub questions: Vec<QuestionId>,
    pub recipes: Vec<RecipeId>,
}

impl Selection {
    fn picked(&self) -> BTreeSet<(CatalogKind, String)> {
        let mut out = BTreeSet::new();
        out.extend(self.teams.iter().map(|id| (CatalogKind::Team, id.to_string())));
        out.extend(self.domains.iter().map(|id| (CatalogKind::Domain, id.to_string())));
        out.extend(self.questions.iter().map(|id| (CatalogKind::Question, id.to_string())));
        out.extend(self.recipes.iter().map(|id| (CatalogKind::Recipe, id.to_string())));
        out
    }

    pub fn is_empty(&self) -> bool {
        self.teams.is_empty() && self.domains.is_empty() && self.questions.is_empty() && self.recipes.is_empty()
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferOp {
    Copy,
    Move,
    MakeShared,
    MakeLocal,
}

/// One row a transfer touched: its kind, its id where it ends up, and the id
/// it came from (the same id for a move or a share).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Touched {
    pub kind: CatalogKind,
    pub id: String,
    pub from: String,
    /// The operator picked it, rather than it coming along.
    pub picked: bool,
}

/// Why a row cannot go: who still uses it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Refusal {
    pub kind: CatalogKind,
    pub id: String,
    /// `game Demo`, `domain Science`, `workspace Club 2026`.
    pub used_by: String,
}

/// What a transfer did, or — from [`CatalogService::transfer_preview`] —
/// would do. `refused` non-empty means the write refuses and changes nothing.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferReport {
    pub created: Vec<Touched>,
    pub reused: Vec<Touched>,
    pub moved: Vec<Touched>,
    pub refused: Vec<Refusal>,
}

impl CatalogService {
    pub fn catalog_copy_to(&self, selection: &Selection, target: &WorkspaceId, now_ms: u64) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::Copy, selection, Some(target), now_ms, true)
    }

    pub fn catalog_move_to(&self, selection: &Selection, target: &WorkspaceId, now_ms: u64) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::Move, selection, Some(target), now_ms, true)
    }

    pub fn catalog_make_shared(&self, selection: &Selection, now_ms: u64) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::MakeShared, selection, None, now_ms, true)
    }

    pub fn catalog_make_local(&self, selection: &Selection, now_ms: u64) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::MakeLocal, selection, None, now_ms, true)
    }

    /// What the operation would do — what comes along, what is reused, what
    /// refuses — computed by running it and rolling it back.
    pub fn transfer_preview(
        &self,
        op: TransferOp,
        selection: &Selection,
        target: Option<&WorkspaceId>,
    ) -> CatalogResult<TransferReport> {
        self.transfer(op, selection, target, 0, false)
    }

    fn transfer(
        &self,
        op: TransferOp,
        selection: &Selection,
        target: Option<&WorkspaceId>,
        now_ms: u64,
        write: bool,
    ) -> CatalogResult<TransferReport> {
        let report = {
            let mut conn = self.conn();
            let current = store::current_workspace(&conn)?;
            let tx = conn.transaction()?;
            let result = match op {
                TransferOp::Copy | TransferOp::Move => {
                    let target = target.ok_or_else(|| {
                        CatalogError::invalid("transfer.target", "copy and move need a workspace to go to")
                    })?;
                    check_target(&tx, &current, target)?;
                    if op == TransferOp::Copy {
                        copy(&tx, selection, &current, target, now_ms)
                    } else {
                        relocate(&tx, selection, &current, Some(target))
                    }
                }
                TransferOp::MakeShared => relocate(&tx, selection, &current, None),
                TransferOp::MakeLocal => make_local(&tx, selection, &current),
            };
            // Whatever happened, the operator is still where they were.
            db::bind_workspace(&tx, current.as_str())?;
            let report = result?;
            if write {
                if let Some(first) = report.refused.first() {
                    return Err(CatalogError::StillUsed {
                        kind: first.kind,
                        id: first.id.clone(),
                        used_by: report.refused.iter().map(|r| r.used_by.clone()).collect::<BTreeSet<_>>().into_iter().collect::<Vec<_>>().join(", "),
                    });
                }
                tx.commit()?;
            }
            // Not committed: dropping the transaction rolls the preview back.
            report
        };
        if write {
            self.rebuild_search_index()?;
        }
        Ok(report)
    }
}

fn check_target(conn: &Connection, current: &WorkspaceId, target: &WorkspaceId) -> CatalogResult<()> {
    if current == target {
        return Err(CatalogError::invalid(
            format!("workspace/{target}"),
            "that is this workspace; use Duplicate for a second copy here",
        ));
    }
    match store::workspace_get(conn, target)? {
        Some(w) if !w.is_archived() => Ok(()),
        Some(_) => Err(CatalogError::invalid(format!("workspace/{target}"), "an archived workspace takes nothing")),
        None => Err(CatalogError::invalid(format!("workspace/{target}"), "no such workspace")),
    }
}

/// The picked rows and every local row they need, read while the connection
/// is bound to the current workspace.
#[derive(Default)]
struct Closure {
    assets: BTreeMap<String, Asset>,
    questions: BTreeMap<String, Question>,
    teams: BTreeMap<String, Team>,
    domains: BTreeMap<String, Domain>,
    recipes: BTreeMap<String, Recipe>,
    picked: BTreeSet<(CatalogKind, String)>,
}

impl Closure {
    fn ids(&self) -> Vec<(CatalogKind, String)> {
        let mut out = Vec::new();
        out.extend(self.assets.keys().map(|id| (CatalogKind::Asset, id.clone())));
        out.extend(self.questions.keys().map(|id| (CatalogKind::Question, id.clone())));
        out.extend(self.teams.keys().map(|id| (CatalogKind::Team, id.clone())));
        out.extend(self.domains.keys().map(|id| (CatalogKind::Domain, id.clone())));
        out.extend(self.recipes.keys().map(|id| (CatalogKind::Recipe, id.clone())));
        out
    }

    fn contains(&self, kind: CatalogKind, id: &str) -> bool {
        match kind {
            CatalogKind::Asset => self.assets.contains_key(id),
            CatalogKind::Question => self.questions.contains_key(id),
            CatalogKind::Team => self.teams.contains_key(id),
            CatalogKind::Domain => self.domains.contains_key(id),
            CatalogKind::Recipe => self.recipes.contains_key(id),
            CatalogKind::Operator => false,
        }
    }
}

/// `include_shared_picks`: a copy may start from a shared row (the copy is
/// local); a move or a share has nothing to do with one.
fn closure(conn: &Connection, selection: &Selection, include_shared_picks: bool) -> CatalogResult<Closure> {
    let mut out = Closure { picked: selection.picked(), ..Closure::default() };
    let wanted = |shared: bool, picked: bool| !shared || (picked && include_shared_picks);

    for id in &selection.recipes {
        let recipe = store::recipe_get(conn, id)?;
        out.recipes.insert(id.to_string(), recipe);
    }
    let mut team_ids: BTreeSet<(String, bool)> = selection.teams.iter().map(|t| (t.to_string(), true)).collect();
    let mut domain_ids: BTreeSet<(String, bool)> = selection.domains.iter().map(|d| (d.to_string(), true)).collect();
    let mut question_ids: BTreeSet<(String, bool)> = selection.questions.iter().map(|q| (q.to_string(), true)).collect();
    for recipe in out.recipes.values() {
        team_ids.extend(recipe.teams.iter().map(|t| (t.to_string(), false)));
        for board in &recipe.board {
            domain_ids.insert((board.domain_id.to_string(), false));
            question_ids.extend(board.question_ids.iter().map(|q| (q.to_string(), false)));
        }
    }
    for (id, picked) in domain_ids {
        let domain = store::domain_get(conn, &DomainId::new(id.clone()))?;
        if !wanted(domain.stamps.shared, picked) || out.domains.contains_key(&id) {
            continue;
        }
        question_ids.extend(domain.questions.iter().map(|m| (m.question_id.to_string(), false)));
        out.domains.insert(id, domain);
    }
    for (id, picked) in team_ids {
        let team = store::team_get(conn, &TeamId::new(id.clone()))?;
        if wanted(team.stamps.shared, picked) && !out.teams.contains_key(&id) {
            out.teams.insert(id, team);
        }
    }
    for (id, picked) in question_ids {
        if out.questions.contains_key(&id) {
            continue;
        }
        let question = match store::question_get(conn, &QuestionId::new(id.clone())) {
            Ok(question) => question,
            // A board may name a row the library no longer has; that is the
            // snapshot's refusal to make, not this one's.
            Err(CatalogError::NotFound { .. }) if !picked => continue,
            Err(error) => return Err(error),
        };
        if wanted(question.stamps.shared, picked) {
            out.questions.insert(id, question);
        }
    }
    let mut asset_ids: BTreeSet<String> = BTreeSet::new();
    asset_ids.extend(out.teams.values().filter_map(|t| t.logo_asset_id.as_ref().map(|a| a.to_string())));
    asset_ids.extend(out.questions.values().filter_map(|q| q.media_asset_id.as_ref().map(|a| a.to_string())));
    for id in asset_ids {
        if let Ok(asset) = store::asset_get(conn, &AssetId::new(id.clone()))
            && !asset.stamps.shared
        {
            out.assets.insert(id, asset);
        }
    }
    Ok(out)
}

// ------------------------------------------------------------------- copy

fn copy(
    tx: &Transaction<'_>,
    selection: &Selection,
    current: &WorkspaceId,
    target: &WorkspaceId,
    now_ms: u64,
) -> CatalogResult<TransferReport> {
    let rows = closure(tx, selection, true)?;
    let mut report = TransferReport::default();
    let mut next_family = store::next_family(tx)?;
    // source id → id in the target, per kind
    let mut ids: BTreeMap<(CatalogKind, String), String> = BTreeMap::new();

    // Decide, before writing anything: reuse an active family member in the
    // target for a row that only came along; copy everything else.
    let mut family_of: BTreeMap<(CatalogKind, String), i64> = BTreeMap::new();
    for (kind, id) in rows.ids() {
        if kind == CatalogKind::Recipe {
            continue;
        }
        let family = match store::family_of(tx, kind, &id)? {
            Some(family) => family,
            None => {
                let fresh = next_family;
                next_family += 1;
                store::set_family(tx, kind, &id, Some(fresh))?;
                fresh
            }
        };
        family_of.insert((kind, id.clone()), family);
        let picked = rows.picked.contains(&(kind, id.clone()));
        if !picked && let Some(existing) = store::family_member_in(tx, kind, family, target)? {
            ids.insert((kind, id.clone()), existing.clone());
            report.reused.push(Touched { kind, id: existing, from: id, picked: false });
        }
    }
    // A reused domain must hold what the copied boards ask of it; if a board
    // would point at a question it lacks, copy the domain instead.
    for recipe in rows.recipes.values() {
        for board in &recipe.board {
            let key = (CatalogKind::Domain, board.domain_id.to_string());
            let Some(existing) = ids.get(&key).cloned() else { continue };
            db::bind_workspace(tx, target.as_str())?;
            let members = store::domain_get(tx, &DomainId::new(existing.clone()))?;
            db::bind_workspace(tx, current.as_str())?;
            let holds = board.question_ids.iter().all(|q| {
                let mapped = ids.get(&(CatalogKind::Question, q.to_string())).cloned().unwrap_or_else(|| q.to_string());
                members.questions.iter().any(|m| m.question_id.as_str() == mapped)
            });
            if !holds {
                ids.remove(&key);
                report.reused.retain(|t| !(t.kind == CatalogKind::Domain && t.id == existing));
            }
        }
    }
    let new_id = |kind: CatalogKind| match kind {
        CatalogKind::Asset => fresh_id("asset"),
        CatalogKind::Question => fresh_id("q"),
        CatalogKind::Team => fresh_id("team"),
        CatalogKind::Domain => fresh_id("dom"),
        CatalogKind::Recipe => fresh_id("game"),
        CatalogKind::Operator => fresh_id("op"),
    };
    for (kind, id) in rows.ids() {
        ids.entry((kind, id.clone())).or_insert_with(|| new_id(kind));
    }
    let map = |kind: CatalogKind, id: &str| ids.get(&(kind, id.to_owned())).cloned().unwrap_or_else(|| id.to_owned());
    let reused: BTreeSet<(CatalogKind, String)> = report.reused.iter().map(|t| (t.kind, t.from.clone())).collect();
    let created = |kind: CatalogKind, id: &str, report: &mut TransferReport| {
        report.created.push(Touched {
            kind,
            id: map(kind, id),
            from: id.to_owned(),
            picked: rows.picked.contains(&(kind, id.to_owned())),
        });
    };

    db::bind_workspace(tx, target.as_str())?;
    for (id, asset) in &rows.assets {
        if reused.contains(&(CatalogKind::Asset, id.clone())) {
            continue;
        }
        let mut row = asset.clone();
        row.id = AssetId::new(map(CatalogKind::Asset, id));
        row.stamps.shared = false;
        store::asset_upsert(tx, &row, now_ms)?;
        store::set_family(tx, CatalogKind::Asset, row.id.as_str(), family_of.get(&(CatalogKind::Asset, id.clone())).copied())?;
        created(CatalogKind::Asset, id, &mut report);
    }
    for (id, question) in &rows.questions {
        if reused.contains(&(CatalogKind::Question, id.clone())) {
            continue;
        }
        let mut row = question.clone();
        row.id = QuestionId::new(map(CatalogKind::Question, id));
        row.media_asset_id = question.media_asset_id.as_ref().map(|a| AssetId::new(map(CatalogKind::Asset, a.as_str())));
        row.stamps.shared = false;
        store::question_upsert(tx, &row, now_ms)?;
        store::set_family(tx, CatalogKind::Question, row.id.as_str(), family_of.get(&(CatalogKind::Question, id.clone())).copied())?;
        created(CatalogKind::Question, id, &mut report);
    }
    for (id, team) in &rows.teams {
        if reused.contains(&(CatalogKind::Team, id.clone())) {
            continue;
        }
        let mut row = team.clone();
        row.id = TeamId::new(map(CatalogKind::Team, id));
        row.logo_asset_id = team.logo_asset_id.as_ref().map(|a| AssetId::new(map(CatalogKind::Asset, a.as_str())));
        row.stamps.shared = false;
        store::team_upsert(tx, &row, now_ms)?;
        store::set_family(tx, CatalogKind::Team, row.id.as_str(), family_of.get(&(CatalogKind::Team, id.clone())).copied())?;
        created(CatalogKind::Team, id, &mut report);
    }
    for (id, domain) in &rows.domains {
        if ids.get(&(CatalogKind::Domain, id.clone())).is_some_and(|to| report.reused.iter().any(|t| t.kind == CatalogKind::Domain && &t.id == to)) {
            continue;
        }
        let mut row = domain.clone();
        row.id = DomainId::new(map(CatalogKind::Domain, id));
        for member in &mut row.questions {
            member.question_id = QuestionId::new(map(CatalogKind::Question, member.question_id.as_str()));
        }
        row.stamps.shared = false;
        store::domain_upsert(tx, &row, now_ms)?;
        store::set_family(tx, CatalogKind::Domain, row.id.as_str(), family_of.get(&(CatalogKind::Domain, id.clone())).copied())?;
        created(CatalogKind::Domain, id, &mut report);
    }
    for (id, recipe) in &rows.recipes {
        let mut row = recipe.clone();
        row.id = RecipeId::new(map(CatalogKind::Recipe, id));
        row.rev = 0;
        row.stamps.archived_at = None;
        row.teams = recipe.teams.iter().map(|t| TeamId::new(map(CatalogKind::Team, t.as_str()))).collect();
        for board in &mut row.board {
            board.domain_id = DomainId::new(map(CatalogKind::Domain, board.domain_id.as_str()));
            for q in &mut board.question_ids {
                *q = QuestionId::new(map(CatalogKind::Question, q.as_str()));
            }
        }
        row.overlays.teams = std::mem::take(&mut row.overlays.teams)
            .into_iter()
            .map(|(k, v)| (TeamId::new(map(CatalogKind::Team, k.as_str())), v))
            .collect();
        row.overlays.domains = std::mem::take(&mut row.overlays.domains)
            .into_iter()
            .map(|(k, v)| (DomainId::new(map(CatalogKind::Domain, k.as_str())), v))
            .collect();
        row.overlays.questions = std::mem::take(&mut row.overlays.questions)
            .into_iter()
            .map(|(k, v)| (QuestionId::new(map(CatalogKind::Question, k.as_str())), v))
            .collect();
        store::recipe_upsert(tx, &row, now_ms)?;
        created(CatalogKind::Recipe, id, &mut report);
    }
    Ok(report)
}

// -------------------------------------------------- move and make shared

/// Move the closure to `target`, or into the shared library with `None`.
fn relocate(
    tx: &Transaction<'_>,
    selection: &Selection,
    current: &WorkspaceId,
    target: Option<&WorkspaceId>,
) -> CatalogResult<TransferReport> {
    let rows = closure(tx, selection, false)?;
    let mut report = TransferReport::default();
    // A shared row reaches nothing local: a game in this workspace may go on
    // using it, and the closure already brought a shared domain's questions.
    if target.is_none()
        && let Some(recipe) = rows.recipes.keys().next()
    {
        return Err(CatalogError::ScopeRule {
            rule: "a game always lives in one workspace",
            detail: format!("game {recipe}"),
        });
    }
    // What stays behind and still uses something that would go.
    let staying_users = store::local_users(tx, current)?;
    for user in staying_users {
        if rows.contains(user.kind, &user.id) && !rows.contains(user.user_kind, &user.user_id) {
            // Making a question shared leaves the games and domains of this
            // workspace able to use it; only a move takes it out of reach.
            if target.is_none() {
                continue;
            }
            report.refused.push(Refusal { kind: user.kind, id: user.id.clone(), used_by: user.used_by.clone() });
        }
    }
    if !report.refused.is_empty() {
        return Ok(report);
    }
    let destination = target.map(|t| t.as_str());
    for (kind, id) in rows.ids() {
        store::set_workspace(tx, kind, &id, destination)?;
        report.moved.push(Touched { kind, id: id.clone(), from: id.clone(), picked: rows.picked.contains(&(kind, id)) });
    }
    // A row that goes shared has to pass the reference rules in its new place.
    for id in rows.domains.keys() {
        store::domain_rule(tx, id)?;
    }
    Ok(report)
}

// ------------------------------------------------------------- make local

fn make_local(tx: &Transaction<'_>, selection: &Selection, current: &WorkspaceId) -> CatalogResult<TransferReport> {
    let mut report = TransferReport::default();
    if let Some(recipe) = selection.recipes.first() {
        return Err(CatalogError::ScopeRule { rule: "a game is already local", detail: format!("game {recipe}") });
    }
    let mut picked: Vec<(CatalogKind, String)> = Vec::new();
    for (kind, id) in selection.picked() {
        let shared = match kind {
            CatalogKind::Team => store::team_get(tx, &TeamId::new(id.clone()))?.stamps.shared,
            CatalogKind::Domain => store::domain_get(tx, &DomainId::new(id.clone()))?.stamps.shared,
            CatalogKind::Question => store::question_get(tx, &QuestionId::new(id.clone()))?.stamps.shared,
            _ => false,
        };
        if shared {
            picked.push((kind, id));
        }
    }
    for (kind, id) in &picked {
        for user in store::users_elsewhere(tx, *kind, id, current)? {
            // A row picked with it goes local too, so it is no longer a user.
            if picked.iter().any(|(k, i)| *k == user.user_kind && i == &user.user_id) {
                continue;
            }
            report.refused.push(Refusal { kind: *kind, id: id.clone(), used_by: user.used_by });
        }
    }
    if !report.refused.is_empty() {
        return Ok(report);
    }
    for (kind, id) in picked {
        store::set_workspace(tx, kind, &id, Some(current.as_str()))?;
        report.moved.push(Touched { kind, id: id.clone(), from: id, picked: true });
    }
    Ok(report)
}
