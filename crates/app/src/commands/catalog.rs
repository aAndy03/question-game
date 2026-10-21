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
    ArchiveScope, Asset, BoardDomain, CatalogChange, CatalogItem, CatalogKind, ChangeOp, Demo,
    DomainOverlay, EditScope, ImportReport, OverlayTarget, QuestionOverlay, Recipe, RecipeChange,
    SearchHit, SearchQuery, SeedMode, SeedResult, SeedStatus, TeamOverlay,
};
use questiongame_host::flags::{GameSetting, GameSettings};
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

/// `catalog_import_questions` (§2.32). `commit: false` is the import dialog's
/// preview and writes nothing; `commit: true` writes the same plan in one
/// transaction. A batch can be two thousand rows, so it announces one
/// `catalog-changed` per kind rather than one per row — the same as the seed.
#[tauri::command(async)]
pub fn catalog_import_questions(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    text: String,
    commit: bool,
    default_domain_id: Option<DomainId>,
) -> AppResult<ImportReport> {
    let (report, changes) =
        catalog_write(&window, &state, "catalog_import_questions", |h, now| {
            Ok(h.catalog
                .import_questions(&text, commit, default_domain_id.as_ref(), now)?)
        })?;
    if !changes.is_empty() {
        for kind in [CatalogKind::Question, CatalogKind::Domain] {
            emit::catalog_changed(
                &app,
                &CatalogChange {
                    kind,
                    id: String::new(),
                    op: ChangeOp::Upserted,
                },
            );
        }
    }
    Ok(report)
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
    id: Option<String>,
    ids: Option<Vec<String>>,
) -> AppResult<Option<String>> {
    guard::allow(window.label(), "referenced_by")?;
    // One row (`id`) or a selection (`ids`, beta.3), one sentence either way.
    let ids: Vec<String> = ids.unwrap_or_default().into_iter().chain(id).collect();
    let host = state.lock();
    Ok(host.catalog.referenced_by_many(kind, &ids)?)
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

/// The Game tab's B5 document. A catalog write — an open Play's snapshot does
/// not move (§4.3) — with one live exception: `stage.language` is presentation
/// and is read per emission, so when the recipe written is the one in Control
/// the key is pushed through `FlagService` (which refuses nothing for it) and
/// Stage redraws in the new language. A language the operator picked and
/// cannot see on Stage would read as a control that did nothing.
#[tauri::command(async)]
pub fn recipe_set_settings(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: RecipeId,
    settings: GameSettings,
) -> AppResult<RecipeChange> {
    guard::allow(window.label(), "recipe_set_settings")?;
    let now = crate::state::now_ms();
    let mut host = state.lock();
    let language = settings.language;
    let change = host.catalog.recipe_set_settings(&id, settings, now)?;
    emit::recipe_changed(&app, &change);

    let loaded = host
        .play
        .get_state()
        .map(|p| p.snapshot().recipe_id.clone() == id)
        .unwrap_or(false);
    if loaded && host.flags.language() != language {
        let ctx = host.runtime();
        host.flags
            .settings_set_current_game(GameSetting::Language(language), ctx)?;
        emit::play_state(&app, &mut host, now, true);
    }
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
        host.presentation
            .set_layout(questiongame_host::stage::StageLayoutNodes::of(&layout));
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

/// A sample catalog (§2.27, §12.1, P11.17), written through the ordinary
/// verbs. `demo` is `en` (the default, and all an older caller ever meant) or
/// `ro`. `missing` inserts what is absent and restores archived seed rows;
/// `overwrite` rewrites every seed row to the shipped body. Three call sites
/// — first run, the Games empty state, Settings ▸ Library — one command.
#[tauri::command(async)]
pub fn catalog_seed_demo(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    demo: Option<Demo>,
    mode: SeedMode,
) -> AppResult<SeedResult> {
    guard::allow(window.label(), "catalog_seed_demo")?;
    let now = crate::state::now_ms();
    let host = state.lock();
    let result = host.catalog.seed_demo(
        demo.unwrap_or_default(),
        mode,
        host.flags.new_recipe_settings(),
        now,
    )?;
    // The seed touches up to a dozen rows and one recipe; one invalidation per
    // kind is enough for Studio and cheaper than one per row.
    for kind in [
        CatalogKind::Team,
        CatalogKind::Domain,
        CatalogKind::Question,
    ] {
        emit::catalog_changed(
            &app,
            &CatalogChange {
                kind,
                id: String::new(),
                op: ChangeOp::Upserted,
            },
        );
    }
    let recipe = host.catalog.recipe_get(&result.recipe_id)?;
    emit::recipe_changed(
        &app,
        &RecipeChange {
            id: recipe.id.clone(),
            rev: recipe.rev,
        },
    );
    Ok(result)
}

/// How many of one Demo's seed rows are present, missing and edited — what its
/// Restore confirm names before an `overwrite` throws an edit away (§12.4).
#[tauri::command(async)]
pub fn catalog_seed_status(
    window: WebviewWindow,
    state: State<'_, AppState>,
    demo: Option<Demo>,
) -> AppResult<SeedStatus> {
    guard::allow(window.label(), "catalog_seed_status")?;
    let host = state.lock();
    Ok(host
        .catalog
        .seed_status(demo.unwrap_or_default(), host.flags.new_recipe_settings())?)
}

/// Rebuild the in-memory search index from the catalog — the action behind
/// `health.search_degraded`.
#[tauri::command(async)]
pub fn catalog_rebuild_search(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    guard::allow(window.label(), "catalog_rebuild_search")?;
    let indexed = {
        let mut host = state.lock();
        let indexed = host.catalog.rebuild_search_index()?;
        host.health.inputs.search_ok = true;
        indexed
    };
    crate::tick::health_once(&app);
    Ok(serde_json::json!({ "indexed": indexed }))
}

/// *Repair* (beta.5): remove the library's references that point at nothing
/// or at another workspace — the action behind `health.library_refs`.
#[tauri::command(async)]
pub fn library_repair(window: WebviewWindow, app: AppHandle, state: State<'_, AppState>) -> AppResult<u32> {
    guard::allow(window.label(), "library_repair")?;
    let removed = {
        let host = state.lock();
        let (removed, recipes) = host.catalog.library_repair(crate::state::now_ms())?;
        for change in &recipes {
            emit::recipe_changed(&app, change);
        }
        removed
    };
    for kind in [CatalogKind::Team, CatalogKind::Domain, CatalogKind::Question] {
        emit::catalog_changed(&app, &CatalogChange { kind, id: String::new(), op: ChangeOp::Upserted });
    }
    crate::tick::health_once(&app);
    Ok(removed)
}

/// Delete every closed Play and its events (§2.15, §12.3). Refused while a
/// Play is loaded or open — before any pin is looked at, because the pin is
/// not what protects the show — and pin-gated when the active operator has one.
/// Library rows are never touched: Archive is the only thing that happens to
/// those.
#[tauri::command(async)]
pub fn wipe_plays(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    pin: Option<String>,
) -> AppResult<serde_json::Value> {
    guard::allow(window.label(), "wipe_plays")?;
    let host = state.lock();
    super::flags::refuse_while_play_loaded(&host)?;
    super::flags::require_active_operator_pin(&host, pin.as_deref())?;
    let wiped = host.catalog.wipe_plays()?;
    for id in &wiped.recipe_ids {
        emit::catalog_changed(
            &app,
            &CatalogChange {
                kind: CatalogKind::Recipe,
                id: id.to_string(),
                op: ChangeOp::Upserted,
            },
        );
    }
    Ok(serde_json::json!({ "removed": wiped.removed }))
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
    also_copies: Option<bool>,
) -> AppResult<RecipeChange> {
    // `alsoCopies` (beta.4): *Apply to original* updates the row's copies too.
    let (change, copies) = catalog_write(&window, &state, "recipe_set_overlay", |h, now| {
        Ok(h.catalog.recipe_set_overlay_with(&id, target.into(), scope, also_copies.unwrap_or(false), now)?)
    })?;
    emit::recipe_changed(&app, &change);
    for copy in &copies {
        emit::catalog_changed(&app, copy);
    }
    Ok(change)
}
