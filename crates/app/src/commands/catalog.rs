//! `CatalogService` — the library and the recipes (§11.A, §11.B).
//!
//! All `(async)`: every one of these reaches SQLite, and the write path is
//! WAL + `synchronous = FULL`. None of them touches a Play — a catalog edit
//! during a show leaves the open snapshot byte-identical (§4.3), which is a
//! property `CatalogService` holds and this layer must not undo by "helpfully"
//! reloading anything.
//!
//! §11.A and §11.B are two verb lists, so `catalog_*` refuses
//! `CatalogKind::Recipe` and recipes have their own commands. That refusal
//! comes from the host; nothing here re-implements it.

use questiongame_host::catalog::{
    ArchiveScope, Asset, BoardDomain, CatalogChange, CatalogItem, CatalogKind, DomainOverlay,
    EditScope, OverlayTarget, QuestionOverlay, Recipe, RecipeChange, SearchHit, SearchQuery,
    TeamOverlay,
};
use questiongame_host::flags::GameSettings;
use questiongame_host::{DomainId, QuestionId, RecipeId, TeamId};
use serde::Deserialize;
use tauri::{AppHandle, State, WebviewWindow};

use super::catalog_write;
use crate::error::AppResult;
use crate::state::AppState;
use crate::{emit, guard};

// ------------------------------------------------------------------ the library

#[tauri::command(async)]
pub fn catalog_list(
    window: WebviewWindow,
    state: State<'_, AppState>,
    kind: CatalogKind,
    scope: ArchiveScope,
) -> AppResult<Vec<CatalogItem>> {
    guard::allow(window.label(), "catalog_list")?;
    let host = state.lock();
    Ok(host.catalog.catalog_list(kind, scope)?)
}

#[tauri::command(async)]
pub fn catalog_get(
    window: WebviewWindow,
    state: State<'_, AppState>,
    kind: CatalogKind,
    id: String,
) -> AppResult<CatalogItem> {
    guard::allow(window.label(), "catalog_get")?;
    let host = state.lock();
    Ok(host.catalog.catalog_get(kind, &id)?)
}

#[tauri::command(async)]
pub fn catalog_upsert(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    item: CatalogItem,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "catalog_upsert", |h, now| {
        Ok(h.catalog.catalog_upsert(&item, now)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

/// §2.19: bulk gets one confirm, so it gets one transaction and one fsync.
/// Two hundred rows one at a time is ~0.8 s of the operator watching a spinner;
/// batched it is one commit. Validation runs over the whole batch first, so a
/// bad row leaves the library untouched rather than half-edited.
#[tauri::command(async)]
pub fn catalog_upsert_many(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    items: Vec<CatalogItem>,
) -> AppResult<Vec<CatalogChange>> {
    let changes = catalog_write(&window, &state, "catalog_upsert_many", |h, now| {
        Ok(h.catalog.catalog_upsert_many(&items, now)?)
    })?;
    emit::catalog_changed_many(&app, &changes);
    Ok(changes)
}

#[tauri::command(async)]
pub fn catalog_archive(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    kind: CatalogKind,
    id: String,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "catalog_archive", |h, now| {
        Ok(h.catalog.catalog_archive(kind, &id, now)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn catalog_archive_many(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    kind: CatalogKind,
    ids: Vec<String>,
) -> AppResult<Vec<CatalogChange>> {
    let changes = catalog_write(&window, &state, "catalog_archive_many", |h, now| {
        Ok(h.catalog.catalog_archive_many(kind, &ids, now)?)
    })?;
    emit::catalog_changed_many(&app, &changes);
    Ok(changes)
}

#[tauri::command(async)]
pub fn catalog_restore(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    kind: CatalogKind,
    id: String,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "catalog_restore", |h, _| {
        Ok(h.catalog.catalog_restore(kind, &id)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn catalog_restore_many(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    kind: CatalogKind,
    ids: Vec<String>,
) -> AppResult<Vec<CatalogChange>> {
    let changes = catalog_write(&window, &state, "catalog_restore_many", |h, _| {
        Ok(h.catalog.catalog_restore_many(kind, &ids)?)
    })?;
    emit::catalog_changed_many(&app, &changes);
    Ok(changes)
}

/// `catalog_search`. The frontend debounces; it does not compose queries.
#[tauri::command(async)]
pub fn catalog_search(
    window: WebviewWindow,
    state: State<'_, AppState>,
    query: SearchQuery,
) -> AppResult<Vec<SearchHit>> {
    guard::allow(window.label(), "catalog_search")?;
    let host = state.lock();
    Ok(host.catalog.catalog_search(&query)?)
}

/// What still points at a row — what the Archive confirmation shows before the
/// operator archives something a show depends on (§4.1).
#[tauri::command(async)]
pub fn referenced_by(
    window: WebviewWindow,
    state: State<'_, AppState>,
    kind: CatalogKind,
    id: String,
) -> AppResult<Option<&'static str>> {
    guard::allow(window.label(), "referenced_by")?;
    let host = state.lock();
    Ok(host.catalog.referenced_by(kind, &id)?)
}

#[tauri::command(async)]
pub fn asset_put(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    asset: Asset,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "asset_put", |h, now| {
        Ok(h.catalog.asset_put(&asset, now)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

// ------------------------------------------------------------------ the recipes

#[tauri::command(async)]
pub fn recipe_list(
    window: WebviewWindow,
    state: State<'_, AppState>,
    scope: ArchiveScope,
) -> AppResult<Vec<Recipe>> {
    guard::allow(window.label(), "recipe_list")?;
    let host = state.lock();
    Ok(host.catalog.recipe_list(scope)?)
}

#[tauri::command(async)]
pub fn recipe_get(
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: RecipeId,
) -> AppResult<Recipe> {
    guard::allow(window.label(), "recipe_get")?;
    let host = state.lock();
    Ok(host.catalog.recipe_get(&id)?)
}

#[tauri::command(async)]
pub fn recipe_upsert(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    recipe: Recipe,
) -> AppResult<RecipeChange> {
    let change = catalog_write(&window, &state, "recipe_upsert", |h, now| {
        Ok(h.catalog.recipe_upsert(&recipe, now)?)
    })?;
    emit::recipe_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn recipe_archive(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "recipe_archive", |h, now| {
        Ok(h.catalog.recipe_archive(&id, now)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn recipe_restore(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
) -> AppResult<CatalogChange> {
    let change = catalog_write(&window, &state, "recipe_restore", |h, _| {
        Ok(h.catalog.recipe_restore(&id)?)
    })?;
    emit::catalog_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn recipe_duplicate(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    new_id: RecipeId,
    new_name: String,
) -> AppResult<Recipe> {
    let recipe = catalog_write(&window, &state, "recipe_duplicate", |h, now| {
        Ok(h.catalog.recipe_duplicate(&id, new_id, new_name, now)?)
    })?;
    emit::recipe_changed(
        &app,
        &RecipeChange {
            id: recipe.id.clone(),
            rev: recipe.rev,
        },
    );
    Ok(recipe)
}

#[tauri::command(async)]
pub fn recipe_set_membership(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    teams: Vec<TeamId>,
    board: Vec<BoardDomain>,
) -> AppResult<RecipeChange> {
    let change = catalog_write(&window, &state, "recipe_set_membership", |h, now| {
        Ok(h.catalog.recipe_set_membership(&id, teams, board, now)?)
    })?;
    emit::recipe_changed(&app, &change);
    Ok(change)
}

#[tauri::command(async)]
pub fn recipe_set_settings(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    settings: GameSettings,
) -> AppResult<RecipeChange> {
    let change = catalog_write(&window, &state, "recipe_set_settings", |h, now| {
        Ok(h.catalog.recipe_set_settings(&id, settings, now)?)
    })?;
    emit::recipe_changed(&app, &change);
    Ok(change)
}

/// The Screens canvas auto-save. The 400ms debounce that decides *when* to save
/// belongs to the canvas; this is one `rev` per save.
///
/// The decor settings live in this document, so a save while the recipe is in
/// Control updates the live `PresentationService` too: decor affects nothing
/// scored, and a Screens edit the operator cannot see on Stage is useless.
#[tauri::command(async)]
pub fn recipe_set_layout(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    layout: serde_json::Value,
) -> AppResult<RecipeChange> {
    guard::allow(window.label(), "recipe_set_layout")?;
    let now = crate::state::now_ms();
    let mut host = state.lock();
    let change = host.catalog.recipe_set_layout(&id, layout.clone(), now)?;

    let loaded = host
        .play
        .get_state()
        .map(|p| p.snapshot().recipe_id.clone() == id)
        .unwrap_or(false);
    if loaded {
        host.presentation.set_decor(crate::decor::of(&layout));
        crate::emit::play_state(&app, &mut host, now, true);
    }
    emit::recipe_changed(&app, &change);
    Ok(change)
}

/// A new, empty recipe, seeded from the globals' `game_defaults` (§12: the
/// global default seeds a *new* recipe and never rewrites one that exists).
/// Studio's "New game" — and the one place the seeding rule is applied.
#[tauri::command(async)]
pub fn recipe_new(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    name: String,
) -> AppResult<Recipe> {
    guard::allow(window.label(), "recipe_new")?;
    let now = crate::state::now_ms();
    let host = state.lock();
    let recipe = Recipe::new(id, name, host.flags.new_recipe_settings());
    let change = host.catalog.recipe_upsert(&recipe, now)?;
    emit::recipe_changed(&app, &change);
    Ok(host.catalog.recipe_get(&recipe.id)?)
}

/// Write the demo library (`crates/app/src/demo.rs`) through the ordinary
/// verbs. **Dev builds only** — §10's optional sample catalog at first run is
/// P10's job, and this goes with the P6 harness that calls it.
#[tauri::command(async)]
pub fn seed_demo_library(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<Recipe> {
    guard::allow(window.label(), "seed_demo_library")?;
    if !tauri::is_dev() {
        return Err(crate::error::AppError::Window(
            "the demo library is a dev-build harness".to_owned(),
        ));
    }
    let now = crate::state::now_ms();
    let host = state.lock();

    let (items, recipe) = crate::demo::library(host.flags.new_recipe_settings());
    let changes = host.catalog.catalog_upsert_many(&items, now)?;
    let change = host.catalog.recipe_upsert(&recipe, now)?;

    emit::catalog_changed_many(&app, &changes);
    emit::recipe_changed(&app, &change);
    Ok(host.catalog.recipe_get(&recipe.id)?)
}

/// ScopeConfirm at the wire (§2.17). Spelled here rather than reusing
/// `OverlayTarget` because a two-field tuple variant has no good JSON shape —
/// the host keeps its Rust ergonomics, the boundary keeps a readable payload.
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "snake_case", tag = "target")]
pub enum OverlaySpec {
    /// `patch: null` is Reset — the overlay goes and the catalog row shows
    /// through again.
    Team {
        id: TeamId,
        patch: Option<TeamOverlay>,
    },
    Domain {
        id: DomainId,
        patch: Option<DomainOverlay>,
    },
    Question {
        id: QuestionId,
        patch: Option<QuestionOverlay>,
    },
}

impl From<OverlaySpec> for OverlayTarget {
    fn from(spec: OverlaySpec) -> Self {
        match spec {
            OverlaySpec::Team { id, patch } => OverlayTarget::Team(id, patch),
            OverlaySpec::Domain { id, patch } => OverlayTarget::Domain(id, patch),
            OverlaySpec::Question { id, patch } => OverlayTarget::Question(id, patch),
        }
    }
}

/// `recipe_set_overlay` — `this_game` writes the patch, `original` writes the
/// catalog row and drops *this* recipe's patch while leaving every other
/// recipe's standing (§2.17).
#[tauri::command(async)]
pub fn recipe_set_overlay(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    target: OverlaySpec,
    scope: EditScope,
) -> AppResult<RecipeChange> {
    let change = catalog_write(&window, &state, "recipe_set_overlay", |h, now| {
        Ok(h.catalog
            .recipe_set_overlay(&id, target.into(), scope, now)?)
    })?;
    emit::recipe_changed(&app, &change);
    Ok(change)
}
