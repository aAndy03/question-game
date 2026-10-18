//! `CatalogService` — the library, the recipe store, the Play log and the
//! globals document, behind one small verb list (§11.A, §11.B, §13).
//!
//! ```text
//! catalog_list | get | upsert | archive | restore | search    the library
//! asset_put                                                   files it points at
//! recipe_list | get | upsert | archive | restore | duplicate  the show
//! recipe_set_membership | set_settings | set_layout | set_overlay
//! build_snapshot                                              §4.3
//! play_persist | play_events | play_replay | play_list        the log
//! stats_query                                                 §11.K, read-only
//! wipe_plays                                                  §12.3, pin-gated
//! seed_demo | seed_status                                     §12.1 (`seed.rs`)
//! import_questions                                            §2.32 (`import.rs`)
//! settings_load | settings_store                              §11.L L1/L2
//! ```
//!
//! **One writer connection behind a `Mutex`, and the interface never hands a
//! `Connection` out.** That is the whole reason `rusqlite` was chosen over
//! `tauri-plugin-sql`, whose JS API is a second writer of the catalog by
//! design (`04_ROADMAP.md` P5). Every method takes `&self`; the lock is the
//! writer, and WAL gives readers their own lane.
//!
//! **No clock inside**, as everywhere else in this crate: writes take the
//! millisecond they happened at.
//!
//! Two atomicity rules the tests hold down:
//!
//! - `recipe_upsert` is **one transaction** — roster, board, settings, layout
//!   and overlays land together, and `rev` advances once (§11.B).
//! - **Events append first and projections are derived.** `plays` is rebuilt
//!   from `events` at [`CatalogService::open`], so a process killed mid-write
//!   loses a projection row, never a fact (§2.10, §5.10).

use std::collections::BTreeMap;
use std::path::Path;
use std::sync::{Mutex, MutexGuard, PoisonError};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::event::Event;
use crate::preview::{PreviewBoard, PreviewDomain, PreviewQuestion};
use crate::stats::{self, StatsDimension, StatsQuery, StatsResult, TurnAward};
use crate::flags::{GameSettings, GlobalSettings};
use crate::ids::{AssetId, DomainId, OperatorId, PlayId, QuestionId, RecipeId, TeamId};
use crate::play::Play;
use crate::settings::FrozenSettings;
use crate::snapshot::PlaySnapshot;

use super::backup::{OpenOptions, OpenReport};
use super::complete;
use super::db::{self, CatalogLocation};
use super::error::{CatalogError, CatalogKind, CatalogResult};
use super::model::{
    ArchiveScope, Asset, BoardDomain, CatalogItem, DomainOverlay, EditScope, PlayRecord, Question,
    QuestionOverlay, Recipe, TeamOverlay,
};
use super::search::{SearchHit, SearchIndex, SearchQuery};
use super::snapshot::{self, Bodies};
use super::store;

/// The `op` of `catalog-changed { kind, id, op }` (§11.A).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ChangeOp {
    Upserted,
    Archived,
    Restored,
}

impl ChangeOp {
    pub fn as_str(self) -> &'static str {
        match self {
            ChangeOp::Upserted => "upserted",
            ChangeOp::Archived => "archived",
            ChangeOp::Restored => "restored",
        }
    }
}

/// What a write did, ready to be emitted as `catalog-changed`. Returned rather
/// than emitted here, because this crate has no event bus — P6 does.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogChange {
    pub kind: CatalogKind,
    pub id: String,
    pub op: ChangeOp,
}

/// What `wipe_plays` removed. The recipe ids are what the app emits
/// `catalog-changed` for, so every Plays section that listed one refreshes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WipedPlays {
    pub removed: usize,
    pub recipe_ids: Vec<RecipeId>,
}

/// `recipe-changed { id, rev }` (§11.B).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RecipeChange {
    pub id: RecipeId,
    pub rev: u32,
}

/// Which overlay a `recipe_set_overlay` writes, and to what. `None` is Reset —
/// the patch goes, the catalog row shows through again (§2.17).
///
/// Deliberately **not** `Deserialize`: a two-field tuple variant has no good
/// JSON shape, and reshaping a P5 argument type to please serde would be the
/// wire dictating the Rust. The command payload is spelled at the boundary
/// instead (`crates/app`), which is where a wire format belongs.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum OverlayTarget {
    Team(TeamId, Option<TeamOverlay>),
    Domain(DomainId, Option<DomainOverlay>),
    Question(QuestionId, Option<QuestionOverlay>),
}

impl OverlayTarget {
    /// The library row the patch is about — the notice `target_path` (§14) and
    /// what the ScopeConfirm dialog names.
    pub fn id(&self) -> String {
        match self {
            OverlayTarget::Team(id, _) => id.to_string(),
            OverlayTarget::Domain(id, _) => id.to_string(),
            OverlayTarget::Question(id, _) => id.to_string(),
        }
    }
}

/// The key the globals document lives under.
const GLOBALS_KEY: &str = "settings";

pub struct CatalogService {
    conn: Mutex<Connection>,
    /// The Tantivy index, rebuilt at open and kept current by every write.
    /// Inside the service on purpose: there is no `SearchService` (§2.13).
    search: SearchIndex,
    location: CatalogLocation,
}

impl std::fmt::Debug for CatalogService {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("CatalogService")
            .field("location", &self.location)
            .finish_non_exhaustive()
    }
}

impl CatalogService {
    /// Open the library, migrate it, and rebuild the Play projections from the
    /// log. Boot is a replay, not a repair (§2.10).
    pub fn open(location: CatalogLocation) -> CatalogResult<Self> {
        let conn = db::open(&location)?;
        Self::finish_open(conn, location)
    }

    /// Open the installed library: back it up first when a migration is due
    /// or another build opened it last, then migrate and stamp this build
    /// (P12.6). A backup that cannot be written refuses the open and leaves
    /// the file untouched. `open` stays for memory and for tests.
    pub fn open_file(path: &Path, options: &OpenOptions) -> CatalogResult<(Self, OpenReport)> {
        let (conn, report) = db::open_guarded(path, options)?;
        let service = Self::finish_open(conn, CatalogLocation::file(path))?;
        if report.backup.is_some() {
            super::backup::prune(&options.backup_dir, options.keep);
        }
        Ok((service, report))
    }

    fn finish_open(conn: Connection, location: CatalogLocation) -> CatalogResult<Self> {
        let service = CatalogService {
            conn: Mutex::new(conn),
            search: SearchIndex::open()?,
            location,
        };
        let rebuilt = service.rebuild_projections()?;
        let indexed = service.rebuild_search_index()?;
        tracing::info!(plays = rebuilt, rows = indexed, "library open");
        Ok(service)
    }

    /// A string the app keeps beside the settings document —
    /// [`super::META_LAST_OPENED`], [`super::META_LAST_SEEN`]. A row in
    /// `globals`, so no schema change and an older build reads past it.
    pub fn meta_get(&self, key: &str) -> CatalogResult<Option<String>> {
        let Some(json) = store::global_get(&self.conn(), key)? else {
            return Ok(None);
        };
        Ok(Some(serde_json::from_str(&json)?))
    }

    pub fn meta_set(&self, key: &str, value: &str) -> CatalogResult<()> {
        store::global_set(&self.conn(), key, &serde_json::to_string(value)?)
    }

    /// The test adapter: the same code path, the same SQL, no file.
    pub fn in_memory() -> CatalogResult<Self> {
        CatalogService::open(CatalogLocation::Memory)
    }

    pub fn location(&self) -> &CatalogLocation {
        &self.location
    }

    /// A poisoned lock means some other call panicked mid-statement. The
    /// database is still consistent — every write is a transaction — so the
    /// app recovers rather than bricking on the next click.
    fn conn(&self) -> MutexGuard<'_, Connection> {
        self.conn.lock().unwrap_or_else(PoisonError::into_inner)
    }

    // ------------------------------------------------------------- the library

    /// `catalog_list`. The scope is a parameter because each library tab owns
    /// its own archive view (§2.24).
    pub fn catalog_list(
        &self,
        kind: CatalogKind,
        scope: ArchiveScope,
    ) -> CatalogResult<Vec<CatalogItem>> {
        let conn = self.conn();
        Ok(match kind {
            CatalogKind::Team => store::team_list(&conn, scope)?
                .into_iter()
                .map(CatalogItem::from)
                .collect(),
            CatalogKind::Domain => store::domain_list(&conn, scope)?
                .into_iter()
                .map(CatalogItem::from)
                .collect(),
            CatalogKind::Question => store::question_list(&conn, scope)?
                .into_iter()
                .map(CatalogItem::from)
                .collect(),
            CatalogKind::Operator => store::operator_list(&conn, scope)?
                .into_iter()
                .map(CatalogItem::from)
                .collect(),
            CatalogKind::Asset => store::asset_list(&conn, scope)?
                .into_iter()
                .map(CatalogItem::from)
                .collect(),
            CatalogKind::Recipe => return Err(recipes_have_their_own_verbs()),
        })
    }

    /// `catalog_get`.
    pub fn catalog_get(&self, kind: CatalogKind, id: &str) -> CatalogResult<CatalogItem> {
        let conn = self.conn();
        Ok(match kind {
            CatalogKind::Team => store::team_get(&conn, &TeamId::from(id))?.into(),
            CatalogKind::Domain => store::domain_get(&conn, &DomainId::from(id))?.into(),
            CatalogKind::Question => store::question_get(&conn, &QuestionId::from(id))?.into(),
            CatalogKind::Operator => store::operator_get(&conn, &OperatorId::from(id))?.into(),
            CatalogKind::Asset => store::asset_get(&conn, &AssetId::from(id))?.into(),
            CatalogKind::Recipe => return Err(recipes_have_their_own_verbs()),
        })
    }

    /// `catalog_upsert`. Validated first (§4.1: options ≥ 2, at least one
    /// correct mark, difficulty 1–100), then written in one transaction with
    /// its child rows.
    ///
    /// Metadata is host-owned: `created_at` is carried from the stored row and
    /// `updated_at` moves to `now_ms`, whatever the caller passed.
    pub fn catalog_upsert(&self, item: &CatalogItem, now_ms: u64) -> CatalogResult<CatalogChange> {
        item.validate()?;
        let mut guard = self.conn();
        let tx = guard.transaction()?;
        match item {
            CatalogItem::Team(team) => store::team_upsert(&tx, team, now_ms)?,
            CatalogItem::Domain(domain) => store::domain_upsert(&tx, domain, now_ms)?,
            CatalogItem::Question(question) => store::question_upsert(&tx, question, now_ms)?,
            CatalogItem::Operator(operator) => store::operator_upsert(&tx, operator, now_ms)?,
            CatalogItem::Asset(asset) => store::asset_upsert(&tx, asset, now_ms)?,
        }
        tx.commit()?;
        drop(guard);
        self.search.put(
            item.kind(),
            &item.id(),
            item.is_archived(),
            &item.search_text(),
        )?;
        Ok(CatalogChange {
            kind: item.kind(),
            id: item.id(),
            op: ChangeOp::Upserted,
        })
    }

    /// `asset_put` — the same write, named the way §11.A names it.
    pub fn asset_put(&self, asset: &Asset, now_ms: u64) -> CatalogResult<CatalogChange> {
        self.catalog_upsert(&asset.clone().into(), now_ms)
    }

    /// `catalog_upsert_many` — §2.19's bulk edit as **one** transaction.
    ///
    /// The batch gets one confirm, so it gets one transaction and one fsync:
    /// row-at-a-time would be `WAL + synchronous = FULL` paid two hundred times
    /// over, which is most of a second the operator spends watching a spinner.
    /// Everything is validated **before** anything is written, so a bad row at
    /// index 199 leaves the library exactly as it was rather than half-edited.
    pub fn catalog_upsert_many(
        &self,
        items: &[CatalogItem],
        now_ms: u64,
    ) -> CatalogResult<Vec<CatalogChange>> {
        for item in items {
            item.validate()?;
        }
        let mut guard = self.conn();
        let tx = guard.transaction()?;
        for item in items {
            match item {
                CatalogItem::Team(team) => store::team_upsert(&tx, team, now_ms)?,
                CatalogItem::Domain(domain) => store::domain_upsert(&tx, domain, now_ms)?,
                CatalogItem::Question(question) => store::question_upsert(&tx, question, now_ms)?,
                CatalogItem::Operator(operator) => store::operator_upsert(&tx, operator, now_ms)?,
                CatalogItem::Asset(asset) => store::asset_upsert(&tx, asset, now_ms)?,
            }
        }
        tx.commit()?;
        drop(guard);

        // The index is lazy: this marks every document dirty and the next
        // search commits once, whatever the batch size.
        for item in items {
            self.search.put(
                item.kind(),
                &item.id(),
                item.is_archived(),
                &item.search_text(),
            )?;
        }
        Ok(items
            .iter()
            .map(|item| CatalogChange {
                kind: item.kind(),
                id: item.id(),
                op: ChangeOp::Upserted,
            })
            .collect())
    }

    /// `catalog_archive_many` — the bulk sibling of [`Self::catalog_archive`].
    pub fn catalog_archive_many(
        &self,
        kind: CatalogKind,
        ids: &[String],
        now_ms: u64,
    ) -> CatalogResult<Vec<CatalogChange>> {
        self.set_archived_many(kind, ids, Some(now_ms), ChangeOp::Archived)
    }

    /// `catalog_restore_many` — the bulk sibling of [`Self::catalog_restore`].
    pub fn catalog_restore_many(
        &self,
        kind: CatalogKind,
        ids: &[String],
    ) -> CatalogResult<Vec<CatalogChange>> {
        self.set_archived_many(kind, ids, None, ChangeOp::Restored)
    }

    /// One transaction for the whole batch; an id that does not exist aborts it
    /// and nothing is written. A bulk action the operator confirmed once should
    /// not half-happen.
    fn set_archived_many(
        &self,
        kind: CatalogKind,
        ids: &[String],
        at_ms: Option<u64>,
        op: ChangeOp,
    ) -> CatalogResult<Vec<CatalogChange>> {
        let mut guard = self.conn();
        let tx = guard.transaction()?;
        for id in ids {
            store::set_archived(&tx, kind, id, at_ms)?;
        }
        tx.commit()?;
        drop(guard);

        for id in ids {
            self.reindex(kind, id)?;
        }
        Ok(ids
            .iter()
            .map(|id| CatalogChange {
                kind,
                id: id.clone(),
                op,
            })
            .collect())
    }

    /// `catalog_archive` — soft, restorable, and the only kind of delete v1 has
    /// (§4.1). An archived row a recipe still points at stays legal; the board
    /// is what refuses to start a Play (see [`Self::build_snapshot`]).
    pub fn catalog_archive(
        &self,
        kind: CatalogKind,
        id: &str,
        now_ms: u64,
    ) -> CatalogResult<CatalogChange> {
        store::set_archived(&self.conn(), kind, id, Some(now_ms))?;
        self.reindex(kind, id)?;
        Ok(CatalogChange {
            kind,
            id: id.to_owned(),
            op: ChangeOp::Archived,
        })
    }

    /// `catalog_restore`. Restore is a first-class action (§2.24).
    pub fn catalog_restore(&self, kind: CatalogKind, id: &str) -> CatalogResult<CatalogChange> {
        store::set_archived(&self.conn(), kind, id, None)?;
        self.reindex(kind, id)?;
        Ok(CatalogChange {
            kind,
            id: id.to_owned(),
            op: ChangeOp::Restored,
        })
    }

    /// `catalog_search` (§2.13, §11.A). One verb on this service — there is no
    /// `SearchService`, because one adapter exists and no second is planned.
    ///
    /// A hit is a `(kind, id)` pointer, never a row: the index is a projection
    /// of the catalog, and reading a row is still `catalog_get`'s job.
    pub fn catalog_search(&self, query: &SearchQuery) -> CatalogResult<Vec<SearchHit>> {
        self.search.search(query)
    }

    /// Re-read one row and replace its search document. Called by every write
    /// path, including archive and restore — `archived` is a filter field.
    fn reindex(&self, kind: CatalogKind, id: &str) -> CatalogResult<()> {
        match kind {
            CatalogKind::Recipe => {
                let recipe = self.recipe_get(&RecipeId::from(id))?;
                self.search
                    .put(kind, id, recipe.stamps.is_archived(), &recipe.search_text())
            }
            _ => {
                let item = self.catalog_get(kind, id)?;
                self.search
                    .put(kind, id, item.is_archived(), &item.search_text())
            }
        }
    }

    /// Throw the index away and index every row again. Run at [`Self::open`];
    /// the index is derived, so this is always safe.
    pub fn rebuild_search_index(&self) -> CatalogResult<usize> {
        self.search.clear()?;
        let mut indexed = 0;
        for kind in [
            CatalogKind::Team,
            CatalogKind::Domain,
            CatalogKind::Question,
            CatalogKind::Operator,
            CatalogKind::Asset,
        ] {
            for item in self.catalog_list(kind, ArchiveScope::All)? {
                self.search
                    .put(kind, &item.id(), item.is_archived(), &item.search_text())?;
                indexed += 1;
            }
        }
        for recipe in self.recipe_list(ArchiveScope::All)? {
            self.search.put(
                CatalogKind::Recipe,
                recipe.id.as_str(),
                recipe.stamps.is_archived(),
                &recipe.search_text(),
            )?;
            indexed += 1;
        }
        Ok(indexed)
    }

    /// What still points at a row — a recipe roster, a board, a domain, an open
    /// Play. `None` means nothing does.
    ///
    /// The guard behind "cannot purge a row recipes or open Plays still point
    /// at" (§4.1). v1 has no purge, so today this is what the Archive
    /// confirmation shows the operator before they archive something a show
    /// depends on.
    pub fn referenced_by(
        &self,
        kind: CatalogKind,
        id: &str,
    ) -> CatalogResult<Option<&'static str>> {
        store::referenced_by(&self.conn(), kind, id)
    }

    // ------------------------------------------------------------- the recipes

    pub fn recipe_list(&self, scope: ArchiveScope) -> CatalogResult<Vec<Recipe>> {
        store::recipe_list(&self.conn(), scope)
    }

    pub fn recipe_get(&self, id: &RecipeId) -> CatalogResult<Recipe> {
        store::recipe_get(&self.conn(), id)
    }

    /// `recipe_upsert` — **one transaction** (§11.B). `rev` advances by one,
    /// and the returned change is what `recipe-changed { id, rev }` carries.
    ///
    /// The B5 settings document is run through the §4.2 interlocks on the way
    /// in, so a recipe row can never be where an illegal document hides.
    pub fn recipe_upsert(&self, recipe: &Recipe, now_ms: u64) -> CatalogResult<RecipeChange> {
        recipe.validate()?;
        self.check_board(recipe, None)?;
        let mut guard = self.conn();
        let tx = guard.transaction()?;
        let rev = store::recipe_upsert(&tx, recipe, now_ms)?;
        tx.commit()?;
        drop(guard);
        self.search.put(
            CatalogKind::Recipe,
            recipe.id.as_str(),
            recipe.stamps.is_archived(),
            &recipe.search_text(),
        )?;
        Ok(RecipeChange {
            id: recipe.id.clone(),
            rev,
        })
    }

    pub fn recipe_archive(&self, id: &RecipeId, now_ms: u64) -> CatalogResult<CatalogChange> {
        self.catalog_archive(CatalogKind::Recipe, id.as_str(), now_ms)
    }

    pub fn recipe_restore(&self, id: &RecipeId) -> CatalogResult<CatalogChange> {
        self.catalog_restore(CatalogKind::Recipe, id.as_str())
    }

    /// `recipe_duplicate`. The copy carries the board, the roster, the settings
    /// **and the overlays** — an overlay is part of what makes this show this
    /// show (§2.17) — and starts its own `rev` and its own play history.
    pub fn recipe_duplicate(
        &self,
        id: &RecipeId,
        new_id: impl Into<RecipeId>,
        new_name: impl Into<String>,
        now_ms: u64,
    ) -> CatalogResult<Recipe> {
        let mut copy = self.recipe_get(id)?;
        copy.id = new_id.into();
        copy.name = new_name.into();
        copy.rev = 0;
        copy.stamps.archived_at = None;
        self.recipe_upsert(&copy, now_ms)?;
        self.recipe_get(&copy.id)
    }

    /// `recipe_set_membership` — the roster order and the board in one write.
    /// They travel together because the roster *is* the opening ring and the
    /// board is what the snapshot copies (§4.3).
    pub fn recipe_set_membership(
        &self,
        id: &RecipeId,
        teams: Vec<TeamId>,
        board: Vec<BoardDomain>,
        now_ms: u64,
    ) -> CatalogResult<RecipeChange> {
        let mut recipe = self.recipe_get(id)?;
        recipe.teams = teams;
        recipe.board = board;
        self.recipe_upsert(&recipe, now_ms)
    }

    /// `recipe_set_settings` — the B5 document (§11.L L3).
    pub fn recipe_set_settings(
        &self,
        id: &RecipeId,
        settings: GameSettings,
        now_ms: u64,
    ) -> CatalogResult<RecipeChange> {
        let mut recipe = self.recipe_get(id)?;
        recipe.settings = settings;
        self.recipe_upsert(&recipe, now_ms)
    }

    /// `recipe_set_layout` — the Screens canvas auto-save. One `rev` per save;
    /// the 400ms debounce that decides *when* to save is the canvas's, not this
    /// interface's.
    pub fn recipe_set_layout(
        &self,
        id: &RecipeId,
        layout: serde_json::Value,
        now_ms: u64,
    ) -> CatalogResult<RecipeChange> {
        let mut recipe = self.recipe_get(id)?;
        recipe.layout = layout;
        self.recipe_upsert(&recipe, now_ms)
    }

    /// `recipe_set_overlay` — ScopeConfirm at the data layer (§2.17).
    ///
    /// - [`EditScope::ThisGame`] writes the overlay. The original does not move.
    /// - [`EditScope::Original`] writes the **catalog row** and drops *this*
    ///   recipe's overlay for that target, so the operator sees the change they
    ///   just made. Other recipes that already have their own overlay keep it:
    ///   an overlay is a decision, not a cache of the original.
    ///
    /// A `None` patch is Reset — it drops the overlay and is meaningless
    /// against the original, so it is refused there rather than silently
    /// reinterpreted.
    pub fn recipe_set_overlay(
        &self,
        id: &RecipeId,
        target: OverlayTarget,
        scope: EditScope,
        now_ms: u64,
    ) -> CatalogResult<RecipeChange> {
        // Read outside the transaction: `recipe_get` needs its own statements,
        // and the write below is what has to be atomic.
        let mut recipe = self.recipe_get(id)?;

        match (scope, target) {
            (EditScope::ThisGame, OverlayTarget::Team(team, patch)) => self
                .write_overlay(id, |tx| {
                    store::overlay_set_team(tx, id, &team, patch.as_ref())
                })?,
            (EditScope::ThisGame, OverlayTarget::Domain(domain, patch)) => self
                .write_overlay(id, |tx| {
                    store::overlay_set_domain(tx, id, &domain, patch.as_ref())
                })?,
            (EditScope::ThisGame, OverlayTarget::Question(question, patch)) => {
                // P11.13, §2.32. An override is the second door into a board:
                // it can move a difficulty or empty the correct marks, and a
                // *reset* hands the question back its catalog body. All of it
                // is checked on the recipe this write would produce.
                let mut prospective = recipe.clone();
                match patch.as_ref() {
                    Some(patch) => prospective
                        .overlays
                        .questions
                        .insert(question.clone(), patch.clone()),
                    None => prospective.overlays.questions.remove(&question),
                };
                self.check_board(&prospective, None)?;
                self.write_overlay(id, |tx| {
                    store::overlay_set_question(tx, id, &question, patch.as_ref())
                })?
            }

            (EditScope::Original, OverlayTarget::Team(team_id, patch)) => {
                let patch = patch.ok_or_else(reset_has_no_original)?;
                let mut team = store::team_get(&self.conn(), &team_id)?;
                if let Some(name) = patch.name {
                    team.name = name;
                }
                if let Some(code) = patch.short_code {
                    team.short_code = code;
                }
                if let Some(color) = patch.color {
                    team.color = color;
                }
                if patch.logo_asset_id.is_some() {
                    team.logo_asset_id = patch.logo_asset_id;
                }
                self.catalog_upsert(&team.into(), now_ms)?;
                recipe.overlays.teams.remove(&team_id);
                self.write_overlay(id, |tx| store::overlay_set_team(tx, id, &team_id, None))?;
            }
            (EditScope::Original, OverlayTarget::Domain(domain_id, patch)) => {
                let patch = patch.ok_or_else(reset_has_no_original)?;
                let mut domain = store::domain_get(&self.conn(), &domain_id)?;
                if let Some(name) = patch.name {
                    domain.name = name;
                }
                if let Some(code) = patch.code {
                    domain.code = code;
                }
                self.catalog_upsert(&domain.into(), now_ms)?;
                self.write_overlay(id, |tx| store::overlay_set_domain(tx, id, &domain_id, None))?;
            }
            (EditScope::Original, OverlayTarget::Question(question_id, patch)) => {
                let patch = patch.ok_or_else(reset_has_no_original)?;
                if patch.duration_ms.is_some() {
                    // §2.18: the per-question duration is a property of *this
                    // show's* use of the question. There is nowhere in the
                    // catalog for it to go.
                    return Err(CatalogError::invalid(
                        format!("recipe.{id}.overlay.question.{question_id}.durationMs"),
                        "a per-question duration is a game overlay; it has no original",
                    ));
                }
                let mut question = store::question_get(&self.conn(), &question_id)?;
                if let Some(stem) = patch.stem {
                    question.stem = stem;
                }
                if let Some(options) = patch.options {
                    question.options = options;
                }
                if let Some(difficulty) = patch.difficulty {
                    question.difficulty = Some(difficulty);
                }
                // P11.13, §2.32. Applying to the original changes the catalog
                // row *and* drops this recipe's patch, so both halves are in the
                // recipe this write would produce — checked before either lands.
                let mut prospective = recipe.clone();
                prospective.overlays.questions.remove(&question_id);
                self.check_board(&prospective, Some(&question))?;
                self.catalog_upsert(&question.into(), now_ms)?;
                self.write_overlay(id, |tx| {
                    store::overlay_set_question(tx, id, &question_id, None)
                })?;
            }
        }

        // An overlay is part of the recipe, so it moves `rev`: Stage and the
        // Game tab both read a body that just changed.
        let rev = self.bump_rev(id, now_ms)?;
        Ok(RecipeChange {
            id: id.clone(),
            rev,
        })
    }

    /// The board rules a write must keep, on the recipe this write would
    /// produce (P11.13, §2.32): every **selected** question is complete on its
    /// effective body (`overlay ?? catalog`, field by field), and no domain
    /// selects two at one difficulty. The rules are [`complete`] and
    /// [`crate::board::clashes`]; this only reads the rows. A domain in the
    /// library may hold incomplete questions and twins as the author wrote
    /// them — the board picks the ones a show can play.
    ///
    /// `pending` stands in for the catalog row an `Original` edit is about to
    /// write, which is how [`Self::recipe_set_overlay`] is checked *before* it
    /// writes rather than after.
    ///
    /// Two call sites, because there are two doors into a board:
    /// [`Self::recipe_upsert`] (the checkbox, and every other recipe write
    /// funnels through it) and [`Self::recipe_set_overlay`] (the inline
    /// override, which does not). A row edited in the *library* is
    /// deliberately not refused — a library row does not know which recipes use
    /// it, and `referenced_by` exists because the catalog does not veto on
    /// their behalf. That board becomes illegal from outside, which is what
    /// `build_snapshot`'s second line and the preview warnings are for.
    fn check_board(&self, recipe: &Recipe, pending: Option<&Question>) -> CatalogResult<()> {
        let conn = self.conn();
        for board in &recipe.board {
            let mut selected: Vec<(QuestionId, u8)> = Vec::with_capacity(board.question_ids.len());
            for id in &board.question_ids {
                let question = match pending {
                    Some(question) if &question.id == id => question.clone(),
                    // A row the library no longer has is `build_snapshot`'s
                    // refusal to make, with a message about the missing row.
                    // These rules have nothing to say about it.
                    _ => match store::question_get(&conn, id) {
                        Ok(question) => question,
                        Err(_) => continue,
                    },
                };
                let overlay = recipe.overlays.questions.get(id);
                if !complete::effective_gaps(&question, overlay).is_empty() {
                    return Err(CatalogError::invalid(
                        format!(
                            "recipe.{}.board.{}.question.{}",
                            recipe.id,
                            board.domain_id.as_str(),
                            id
                        ),
                        complete::INCOMPLETE,
                    ));
                }
                if let Some(difficulty) = overlay
                    .and_then(|patch| patch.difficulty)
                    .or(question.difficulty)
                {
                    selected.push((id.clone(), difficulty));
                }
            }
            if let Some(clash) =
                crate::board::check(recipe.settings.board.allow_repeated_difficulty, &selected)
            {
                return Err(CatalogError::invalid(
                    format!(
                        "recipe.{}.board.{}.difficulty.{}",
                        recipe.id,
                        board.domain_id.as_str(),
                        clash.difficulty
                    ),
                    "two questions in this domain share a difficulty; turn on Allow repeated difficulties in Board, or keep one",
                ));
            }
        }
        Ok(())
    }

    fn write_overlay<F>(&self, id: &RecipeId, write: F) -> CatalogResult<()>
    where
        F: FnOnce(&rusqlite::Transaction<'_>) -> CatalogResult<()>,
    {
        // Fail early on an unknown recipe rather than writing an orphan patch.
        let mut guard = self.conn();
        let exists: Option<i64> = rusqlite::OptionalExtension::optional(guard.query_row(
            "SELECT 1 FROM recipes WHERE id = ?1",
            rusqlite::params![id.as_str()],
            |row| row.get(0),
        ))?;
        if exists.is_none() {
            return Err(CatalogError::not_found(CatalogKind::Recipe, id.as_str()));
        }
        let tx = guard.transaction()?;
        write(&tx)?;
        tx.commit()?;
        Ok(())
    }

    fn bump_rev(&self, id: &RecipeId, now_ms: u64) -> CatalogResult<u32> {
        let conn = self.conn();
        conn.execute(
            "UPDATE recipes SET rev = rev + 1, updated_at = ?2 WHERE id = ?1",
            rusqlite::params![id.as_str(), now_ms as i64],
        )?;
        Ok(conn.query_row(
            "SELECT rev FROM recipes WHERE id = ?1",
            rusqlite::params![id.as_str()],
            |row| Ok(row.get::<_, i64>(0)? as u32),
        )?)
    }

    // ------------------------------------------------------------ the snapshot

    /// §4.3 — the copy a Play starts from, with the recipe's overlays already
    /// applied to every body (§2.17).
    ///
    /// `settings` comes from `FlagService::freeze`, which is the only place the
    /// §2.18 cascade is resolved. This service copies bodies; it does not
    /// second-guess the settings document.
    pub fn build_snapshot(
        &self,
        recipe_id: &RecipeId,
        play_id: PlayId,
        settings: FrozenSettings,
    ) -> CatalogResult<PlaySnapshot> {
        let recipe = self.recipe_get(recipe_id)?;
        let conn = self.conn();

        let mut bodies = Bodies {
            teams: BTreeMap::new(),
            domains: BTreeMap::new(),
            questions: BTreeMap::new(),
        };
        for id in &recipe.teams {
            bodies.teams.insert(id.clone(), store::team_get(&conn, id)?);
        }
        for board in &recipe.board {
            bodies.domains.insert(
                board.domain_id.clone(),
                store::domain_get(&conn, &board.domain_id)?,
            );
            for id in &board.question_ids {
                bodies
                    .questions
                    .insert(id.clone(), store::question_get(&conn, id)?);
            }
        }
        drop(conn);

        snapshot::build(&recipe, &bodies, play_id, settings)
    }

    /// The board flattened for the Rules preview (P11.12).
    ///
    /// `build_snapshot`'s lenient cousin. It applies the same recipe overlays,
    /// because the preview has to describe the questions **this show** will
    /// ask — a per-game difficulty override is exactly the kind of thing that
    /// makes an award surprising. But it *skips* a row it cannot read instead
    /// of refusing the whole board: a Play must not start on a board with a
    /// hole in it, while a preview of an unfinished board is the normal case
    /// and returning nothing would be the unhelpful answer.
    pub fn preview_board(&self, recipe_id: &RecipeId) -> CatalogResult<PreviewBoard> {
        let recipe = self.recipe_get(recipe_id)?;
        let conn = self.conn();
        let mut domains: Vec<PreviewDomain> = Vec::new();
        for board in &recipe.board {
            let Ok(domain) = store::domain_get(&conn, &board.domain_id) else {
                continue;
            };
            let overlay = recipe.overlays.domains.get(&board.domain_id);
            let mut incomplete = 0u32;
            let questions = board
                .question_ids
                .iter()
                .filter_map(|id| {
                    let question = store::question_get(&conn, id).ok()?;
                    let patch = recipe.overlays.questions.get(id);
                    // §2.32: an incomplete question has nothing to pay, so it
                    // is counted rather than priced — the warning says Load
                    // will refuse it.
                    let difficulty = patch.and_then(|p| p.difficulty).or(question.difficulty);
                    let Some(difficulty) = difficulty
                        .filter(|_| complete::effective_gaps(&question, patch).is_empty())
                    else {
                        incomplete += 1;
                        return None;
                    };
                    Some(PreviewQuestion {
                        difficulty,
                        duration_ms: patch.and_then(|p| p.duration_ms),
                        correct_count: patch
                            .and_then(|p| p.options.as_ref())
                            .unwrap_or(&question.options)
                            .iter()
                            .filter(|option| option.correct)
                            .count() as u32,
                        stem: patch
                            .and_then(|p| p.stem.clone())
                            .unwrap_or(question.stem),
                        id: question.id,
                    })
                })
                .collect();
            domains.push(PreviewDomain {
                name: overlay
                    .and_then(|o| o.name.clone())
                    .unwrap_or(domain.name),
                id: domain.id,
                questions,
                incomplete,
            });
        }
        Ok(PreviewBoard { domains })
    }

    // ------------------------------------------------------------- the Play log

    /// Persist everything in this Play that is not stored yet, then refresh its
    /// projection row — one transaction.
    ///
    /// Idempotent, and safe to call after every command: only events past the
    /// stored high-water mark are written, and the log never rewrites what is
    /// already there (§2.7 — undo appends, it does not edit).
    pub fn play_persist(&self, play: &Play) -> CatalogResult<()> {
        let id = play.id().clone();
        let record = record_of(play);

        let mut guard = self.conn();
        if let Some(other) = store::other_open_play_of(&guard, &record.recipe_id, &id)?
            .filter(|_| play.status().is_open())
        {
            return Err(CatalogError::PlayAlreadyOpen {
                recipe: record.recipe_id.to_string(),
                play: other.to_string(),
            });
        }

        let stored = store::events_high_water(&guard, &id)?;
        let fresh: Vec<Event> = play
            .events()
            .iter()
            .filter(|event| event.seq > stored)
            .cloned()
            .collect();

        let tx = guard.transaction()?;
        store::events_append(&tx, &id, &fresh)?;
        store::play_projection_put(&tx, &record)?;
        tx.commit()?;
        Ok(())
    }

    pub fn play_events(&self, id: &PlayId) -> CatalogResult<Vec<Event>> {
        store::events_read(&self.conn(), id)
    }

    /// Rebuild a Play from its stored log. The log is self-contained — its
    /// first event carries the snapshot — so this needs nothing else.
    pub fn play_replay(&self, id: &PlayId) -> CatalogResult<Play> {
        let events = self.play_events(id)?;
        if events.is_empty() {
            return Err(CatalogError::not_found(CatalogKind::Recipe, id.as_str()));
        }
        Ok(Play::replay(&events)?)
    }

    pub fn play_list(&self, recipe: Option<&RecipeId>) -> CatalogResult<Vec<PlayRecord>> {
        store::play_list(&self.conn(), recipe)
    }

    /// `stats_query` (§11.K) — the one Statistics command.
    ///
    /// Statistics is a projector: this reads logs and writes nothing, not even
    /// a cache. The arithmetic lives in [`crate::stats`], which is a pure
    /// function of the events it is handed; all this does is decide which logs
    /// to hand it. A filter that names Plays reads only those, so the Live
    /// view costs one log rather than the whole history.
    ///
    /// The rows come back labelled as the Play knew them (a Play is
    /// self-contained by §4.3). §12 wants a renamed team renamed everywhere,
    /// so the caller may relabel a row from the catalog — that is a lookup on
    /// `row.key`, not a second aggregation.
    pub fn stats_query(&self, query: &StatsQuery) -> CatalogResult<StatsResult> {
        let guard = self.conn();
        let ids: Vec<PlayId> = match query.filter.play_scope() {
            Some(named) => named.to_vec(),
            None => store::play_list(&guard, None)?
                .into_iter()
                .filter(|record| {
                    query.filter.recipe_ids.is_empty()
                        || query.filter.recipe_ids.contains(&record.recipe_id)
                })
                .map(|record| record.id)
                .collect(),
        };
        let mut awards: Vec<TurnAward> = Vec::new();
        for id in &ids {
            awards.extend(stats::awards(&store::events_read(&guard, id)?));
        }
        let mut result = stats::aggregate_awards(&awards, query);
        relabel(&guard, &mut result);
        Ok(result)
    }

    /// `wipe_plays` (§12.3) — every **closed** Play and its log, in one
    /// transaction. A Play that is loaded, playing or paused is left standing:
    /// the command layer refuses the call while one exists, and this keeps the
    /// same rule even if it were reached another way.
    ///
    /// The one delete in the Play log. It is the operator's explicit, pin-gated
    /// choice, never a side effect of anything else.
    pub fn wipe_plays(&self) -> CatalogResult<WipedPlays> {
        let mut guard = self.conn();
        let closed = store::closed_plays(&guard)?;
        let tx = guard.transaction()?;
        for (play, _) in &closed {
            store::play_delete(&tx, play)?;
        }
        tx.commit()?;

        let mut recipe_ids: Vec<RecipeId> = Vec::new();
        for (_, recipe) in closed.iter() {
            if !recipe_ids.contains(recipe) {
                recipe_ids.push(recipe.clone());
            }
        }
        Ok(WipedPlays {
            removed: closed.len(),
            recipe_ids,
        })
    }

    /// Delete **one** Play — its log and its projection row (§12.3's delete,
    /// narrowed to a single record).
    ///
    /// The other half of `play_unload`: an operator who loaded the wrong game,
    /// or rehearsed one, must be able to put it down without leaving a record
    /// in the Plays list and in Statistics. It is a hard delete and the only
    /// one besides *Wipe Plays*, so it is never a default — Studio asks, and
    /// keeping is the answer that needs no thought.
    ///
    /// Deleting a Play that is still open in `MatchService` would leave the
    /// service holding a Play with no log; the caller unloads first.
    pub fn play_delete(&self, play: &PlayId) -> CatalogResult<()> {
        let mut guard = self.conn();
        let tx = guard.transaction()?;
        store::play_delete(&tx, play)?;
        tx.commit()?;
        Ok(())
    }

    /// The Play that was still open when the process stopped, replayed from
    /// its log. This is what "kill the process mid-write; boot loses nothing"
    /// hands back to `MatchService`.
    pub fn resume_open_play(&self) -> CatalogResult<Option<Play>> {
        let Some(id) = store::open_play_id(&self.conn())? else {
            return Ok(None);
        };
        Ok(Some(self.play_replay(&id)?))
    }

    /// Rebuild every `plays` row from `events`. Run at [`Self::open`], and safe
    /// to run at any time: the projection holds nothing the log does not.
    pub fn rebuild_projections(&self) -> CatalogResult<usize> {
        let ids = store::event_play_ids(&self.conn())?;
        for id in &ids {
            let play = self.play_replay(id)?;
            store::play_projection_put(&self.conn(), &record_of(&play))?;
        }
        Ok(ids.len())
    }

    // ------------------------------------------------------------- the globals

    /// The all-games document (§11.L L1/L2). `None` on a fresh install — that
    /// is what first run is for.
    pub fn settings_load(&self) -> CatalogResult<Option<GlobalSettings>> {
        let Some(json) = store::global_get(&self.conn(), GLOBALS_KEY)? else {
            return Ok(None);
        };
        Ok(Some(serde_json::from_str(&json)?))
    }

    /// Store the globals. Validated first, for the same reason a recipe is: a
    /// row is not a place an illegal document may hide.
    pub fn settings_store(&self, settings: &GlobalSettings) -> CatalogResult<()> {
        crate::flags::validate(&settings.game_defaults)?;
        settings.timer.validate("globals.timer.duration_ms")?;
        settings.control.audio.validate()?;
        store::global_set(&self.conn(), GLOBALS_KEY, &serde_json::to_string(settings)?)
    }
}

/// The `plays` row for a Play. Every field is derived from the log, which is
/// why the projection can be thrown away and rebuilt.
fn record_of(play: &Play) -> PlayRecord {
    use crate::event::EventKind;

    let started_at_ms = play
        .events()
        .iter()
        .find(|e| matches!(e.kind, EventKind::PlayStarted))
        .map(|e| e.at_ms);
    let ended_at_ms = play
        .events()
        .iter()
        .rev()
        .find(|e| {
            matches!(
                e.kind,
                EventKind::PlayCompleted
                    | EventKind::PlayAbandoned
                    | EventKind::PlayRestarted { .. }
            )
        })
        .map(|e| e.at_ms);

    PlayRecord {
        id: play.id().clone(),
        recipe_id: play.snapshot().recipe_id.clone(),
        operator_id: play.operator_id().cloned(),
        status: play.status().as_str().to_owned(),
        started_at_ms,
        ended_at_ms,
        event_count: play.events().len() as u64,
        questions_consumed: play.consumed_count() as u32,
        scores: play
            .snapshot()
            .teams
            .iter()
            .map(|team| (team.id.clone(), play.score(&team.id)))
            .collect(),
    }
}

/// §12: a renamed team is renamed *everywhere*, Statistics included. The fold
/// labels a row as the Play knew it (a Play is self-contained), so this is the
/// one place the current catalog name wins. A row whose subject was archived
/// or is gone keeps the Play's label — the number still happened.
fn relabel(conn: &Connection, result: &mut StatsResult) {
    for row in result.rows.iter_mut() {
        let current = match result.group_by {
            StatsDimension::Team => store::team_get(conn, &TeamId::from(row.key.as_str()))
                .ok()
                .map(|item| item.name),
            StatsDimension::Domain => store::domain_get(conn, &DomainId::from(row.key.as_str()))
                .ok()
                .map(|item| item.name),
            StatsDimension::Question => {
                store::question_get(conn, &QuestionId::from(row.key.as_str()))
                    .ok()
                    .map(|item| item.stem)
            }
            StatsDimension::Operator => {
                store::operator_get(conn, &OperatorId::from(row.key.as_str()))
                    .ok()
                    .map(|item| item.display_name)
            }
            StatsDimension::Recipe => store::recipe_get(conn, &RecipeId::from(row.key.as_str()))
                .ok()
                .map(|item| item.name),
            // A difficulty band, a day and a Play id label themselves.
            _ => None,
        };
        if let Some(name) = current {
            row.label = name;
        }
    }
    // The ledger carries three labels of its own, and §12's "rename team →
    // Statistics" applies to them for the same reason it applies to the rows:
    // a Play is self-contained, but the operator is reading today's names.
    for turn in result.turns.iter_mut() {
        if let Ok(team) = store::team_get(conn, &turn.fact.team_id) {
            turn.fact.team_name = team.name;
        }
        if let Ok(domain) = store::domain_get(conn, &turn.fact.domain_id) {
            turn.fact.domain_name = domain.name;
        }
        if let Ok(question) = store::question_get(conn, &turn.fact.question_id) {
            turn.fact.question_stem = question.stem;
        }
    }
}

fn recipes_have_their_own_verbs() -> CatalogError {
    CatalogError::invalid(
        "recipe",
        "recipes are read and written by the recipe_* verbs",
    )
}

fn reset_has_no_original() -> CatalogError {
    CatalogError::invalid(
        "overlay",
        "clearing an overlay is a game-scoped action; it has no 'apply to original'",
    )
}
