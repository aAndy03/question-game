//! Copy and move between workspaces (Beta 2.0; the shared library went in
//! beta.2, so these are the only ways a row reaches another workspace).
//!
//! The rows the operator picks never arrive alone: a domain brings its
//! questions, a game its roster, domains and questions, a team or a question
//! its asset — the **closure** — so nothing that arrives points at a row the
//! target cannot see.
//!
//! - **Copy** — the picked rows are always new rows in the target; a needed
//!   row that already has an active copy there (same family) is reused.
//! - **Move** — the same rows, `workspace_id` changed; refused, naming each
//!   user, if anything that stays behind still uses one of them.
//!
//! Each operation is one transaction; a refusal writes nothing. The preview
//! runs the same plan and rolls it back, so it cannot disagree with the write.

use std::collections::{BTreeMap, BTreeSet};

use rusqlite::{Connection, Transaction};
use serde::{Deserialize, Serialize};

use crate::ids::{AssetId, DomainId, QuestionId, RecipeId, TeamId, WorkspaceId};

use super::db;
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{Asset, Domain, DomainMember, Question, Recipe, Team};
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

/// How a copy treats the picked questions' domains (beta.2).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct CopyOptions {
    /// A picked question arrives in its domains: it joins the target's copy
    /// of each (same family), or a copy of the domain holding only the picked
    /// questions is made. Off, it arrives in no domain.
    pub with_domains: bool,
}

impl Default for CopyOptions {
    fn default() -> Self {
        CopyOptions { with_domains: true }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransferOp {
    Copy,
    Move,
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
    /// Domains in the target the copied questions were added to (the
    /// target's copy of their domain, same family).
    pub joined: Vec<Touched>,
    pub refused: Vec<Refusal>,
}

impl CatalogService {
    pub fn catalog_copy_to(
        &self,
        selection: &Selection,
        target: &WorkspaceId,
        options: CopyOptions,
        now_ms: u64,
    ) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::Copy, selection, Some(target), options, now_ms, true)
    }

    pub fn catalog_move_to(&self, selection: &Selection, target: &WorkspaceId, now_ms: u64) -> CatalogResult<TransferReport> {
        self.transfer(TransferOp::Move, selection, Some(target), CopyOptions::default(), now_ms, true)
    }

    /// What the operation would do — what comes along, what is reused, what
    /// refuses — computed by running it and rolling it back.
    pub fn transfer_preview(
        &self,
        op: TransferOp,
        selection: &Selection,
        target: Option<&WorkspaceId>,
        options: CopyOptions,
    ) -> CatalogResult<TransferReport> {
        self.transfer(op, selection, target, options, 0, false)
    }

    fn transfer(
        &self,
        op: TransferOp,
        selection: &Selection,
        target: Option<&WorkspaceId>,
        options: CopyOptions,
        now_ms: u64,
        write: bool,
    ) -> CatalogResult<TransferReport> {
        let report = {
            let mut conn = self.conn();
            let current = store::current_workspace(&conn)?;
            let tx = conn.transaction()?;
            let target = target.ok_or_else(|| {
                CatalogError::invalid("transfer.target", "copy and move need a workspace to go to")
            })?;
            check_target(&tx, &current, target)?;
            let result = match op {
                TransferOp::Copy => copy(&tx, selection, &current, target, options, now_ms),
                TransferOp::Move => relocate(&tx, selection, &current, target),
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

/// The picked rows and every row they need, read while the connection is
/// bound to the current workspace.
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

fn closure(conn: &Connection, selection: &Selection) -> CatalogResult<Closure> {
    let mut out = Closure { picked: selection.picked(), ..Closure::default() };

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
    for (id, _) in domain_ids {
        let domain = store::domain_get(conn, &DomainId::new(id.clone()))?;
        if out.domains.contains_key(&id) {
            continue;
        }
        question_ids.extend(domain.questions.iter().map(|m| (m.question_id.to_string(), false)));
        out.domains.insert(id, domain);
    }
    for (id, _) in team_ids {
        let team = store::team_get(conn, &TeamId::new(id.clone()))?;
        out.teams.entry(id).or_insert(team);
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
        out.questions.insert(id, question);
    }
    let mut asset_ids: BTreeSet<String> = BTreeSet::new();
    asset_ids.extend(out.teams.values().filter_map(|t| t.logo_asset_id.as_ref().map(|a| a.to_string())));
    asset_ids.extend(out.questions.values().filter_map(|q| q.media_asset_id.as_ref().map(|a| a.to_string())));
    // A game's team overlay may show its own logo: that asset comes too (R13).
    for recipe in out.recipes.values() {
        asset_ids.extend(recipe.overlays.teams.values().filter_map(|o| o.logo_asset_id.as_ref().map(|a| a.to_string())));
    }
    for id in asset_ids {
        if let Ok(asset) = store::asset_get(conn, &AssetId::new(id.clone())) {
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
    options: CopyOptions,
    now_ms: u64,
) -> CatalogResult<TransferReport> {
    let mut rows = closure(tx, selection)?;
    // The picked questions' domains, read here while bound to the source:
    // each, with the picked questions it holds (not a domain the copy brings
    // anyway). Only active domains.
    let mut homes: BTreeMap<String, (Domain, Vec<String>)> = BTreeMap::new();
    if options.with_domains {
        for question in &selection.questions {
            for domain in store::domains_holding(tx, question.as_str())? {
                if rows.domains.contains_key(domain.id.as_str()) || domain.stamps.archived_at.is_some() {
                    continue;
                }
                homes
                    .entry(domain.id.to_string())
                    .or_insert_with(|| (domain.clone(), Vec::new()))
                    .1
                    .push(question.to_string());
            }
        }
    }
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
    // A question that came along only as a member of a domain that is now
    // reused has nowhere to live in the target: the reused domain does not
    // hold it. Leave it (and an asset only it needed) behind (review).
    let reused_domains: BTreeSet<String> =
        report.reused.iter().filter(|t| t.kind == CatalogKind::Domain).map(|t| t.from.clone()).collect();
    if !reused_domains.is_empty() {
        let mut needed: BTreeSet<String> = rows
            .picked
            .iter()
            .filter(|(k, _)| *k == CatalogKind::Question)
            .map(|(_, id)| id.clone())
            .collect();
        for recipe in rows.recipes.values() {
            for board in &recipe.board {
                needed.extend(board.question_ids.iter().map(|q| q.to_string()));
            }
        }
        for (id, domain) in &rows.domains {
            if !reused_domains.contains(id) {
                needed.extend(domain.questions.iter().map(|m| m.question_id.to_string()));
            }
        }
        rows.questions.retain(|id, _| needed.contains(id));
        let mut assets: BTreeSet<String> = BTreeSet::new();
        assets.extend(rows.teams.values().filter_map(|t| t.logo_asset_id.as_ref().map(|a| a.to_string())));
        assets.extend(rows.questions.values().filter_map(|q| q.media_asset_id.as_ref().map(|a| a.to_string())));
        rows.assets.retain(|id, _| assets.contains(id));
        report.reused.retain(|t| match t.kind {
            CatalogKind::Question => rows.questions.contains_key(&t.from),
            CatalogKind::Asset => rows.assets.contains_key(&t.from),
            _ => true,
        });
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
        super::groups::write_copy_with_groups(tx, domain, &mut row, now_ms)?;
        store::set_family(tx, CatalogKind::Domain, row.id.as_str(), family_of.get(&(CatalogKind::Domain, id.clone())).copied())?;
        created(CatalogKind::Domain, id, &mut report);
    }
    // The picked questions' domains: the target's copy, joined at the end in
    // no group; else a copy holding only the picked questions, with the
    // groups they use.
    for (source_id, (source, picked)) in &homes {
        let family = match store::family_of(tx, CatalogKind::Domain, source_id)? {
            Some(f) => f,
            None => {
                let fresh = store::next_family(tx)?;
                store::set_family(tx, CatalogKind::Domain, source_id, Some(fresh))?;
                fresh
            }
        };
        let members: Vec<DomainMember> = source
            .questions
            .iter()
            .filter(|m| picked.contains(&m.question_id.to_string()))
            .cloned()
            .collect();
        if let Some(existing) = store::family_member_in(tx, CatalogKind::Domain, family, target)? {
            let mut there = store::domain_get(tx, &DomainId::new(existing.clone()))?;
            let mut next = there.questions.iter().map(|m| m.sort_key + 1).max().unwrap_or(0);
            for member in &members {
                let question = QuestionId::new(map(CatalogKind::Question, member.question_id.as_str()));
                if !there.questions.iter().any(|m| m.question_id == question) {
                    there.questions.push(DomainMember { question_id: question, sort_key: next, group_id: None });
                    next += 1;
                }
            }
            store::domain_upsert(tx, &there, now_ms)?;
            report.joined.push(Touched { kind: CatalogKind::Domain, id: existing, from: source_id.clone(), picked: false });
        } else {
            let used: BTreeSet<_> = members.iter().filter_map(|m| m.group_id.clone()).collect();
            let mut original = source.clone();
            original.questions = members.clone();
            original.groups.retain(|g| used.contains(&g.id));
            let mut row = original.clone();
            row.id = DomainId::new(fresh_id("dom"));
            for member in &mut row.questions {
                member.question_id = QuestionId::new(map(CatalogKind::Question, member.question_id.as_str()));
            }
            super::groups::write_copy_with_groups(tx, &original, &mut row, now_ms)?;
            store::set_family(tx, CatalogKind::Domain, row.id.as_str(), Some(family))?;
            report.created.push(Touched { kind: CatalogKind::Domain, id: row.id.to_string(), from: source_id.clone(), picked: false });
        }
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
            .map(|(k, mut v)| {
                v.logo_asset_id = v.logo_asset_id.map(|a| AssetId::new(map(CatalogKind::Asset, a.as_str())));
                (TeamId::new(map(CatalogKind::Team, k.as_str())), v)
            })
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

// ------------------------------------------------------------------- move

/// Move the closure to `target`.
fn relocate(
    tx: &Transaction<'_>,
    selection: &Selection,
    current: &WorkspaceId,
    target: &WorkspaceId,
) -> CatalogResult<TransferReport> {
    let rows = closure(tx, selection)?;
    let mut report = TransferReport::default();
    // What stays behind and still uses something that would go.
    for user in store::local_users(tx, current)? {
        if rows.contains(user.kind, &user.id) && !rows.contains(user.user_kind, &user.user_id) {
            report.refused.push(Refusal { kind: user.kind, id: user.id.clone(), used_by: user.used_by.clone() });
        }
    }
    if !report.refused.is_empty() {
        return Ok(report);
    }
    for (kind, id) in rows.ids() {
        store::set_workspace(tx, kind, &id, target.as_str())?;
        report.moved.push(Touched { kind, id: id.clone(), from: id.clone(), picked: rows.picked.contains(&(kind, id)) });
    }
    // A moved question takes the target's spelling of a tag both use (review).
    super::db::bind_workspace(tx, target.as_str())?;
    for (kind, id) in rows.ids() {
        if kind == CatalogKind::Question {
            store::tags_respell(tx, &id)?;
        }
    }
    super::db::bind_workspace(tx, current.as_str())?;
    Ok(report)
}
