//! `FlagService` — the settings document and the only flag reader (§4.2, §13).
//!
//! Two things this layer must not do, and does not:
//!
//! - **Keep a second copy.** `settings_get` returns the whole document plus
//!   `disabled`; Studio renders that and never assembles its own.
//! - **Decide what is writable.** A game-affecting key during a Play is refused
//!   by the host with `SettingFrozen` (§2.5). The disabled input in Control is
//!   the courtesy; this is the enforcement.
//!
//! Every write persists the globals, so a setting survives the process. That is
//! a disk write, hence `(async)`.

use questiongame_host::MatchError;
use questiongame_host::catalog::CatalogKind;
use questiongame_host::catalog::{CatalogError, CatalogItem, Operator};
use questiongame_host::flags::{Chord, GameSetting, GlobalSetting, SettingsView};
use questiongame_host::operator::{hash_pin, validate_pin_format, verify_pin};
use questiongame_host::{HealthReport, MonitorKey, OperatorId};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::error::AppError;
use crate::error::AppResult;
use crate::state::{AppState, Host, now_ms};
use crate::{emit, guard, windows};

/// The whole document as one read. Synchronous — it is a borrow and a small
/// computation over keys already in memory.
///
/// `SettingsView` borrows from the lock, so this hands back an owned JSON value
/// rather than fighting the lifetime: the alternative is cloning three structs
/// into a mirror type that would then have to be kept in step with §4.2.
#[tauri::command]
pub fn settings_get(
    window: WebviewWindow,
    state: State<'_, AppState>,
) -> AppResult<serde_json::Value> {
    guard::allow(window.label(), "settings_get")?;
    let host = state.lock();
    let view: SettingsView<'_> = host.flags.settings_get(host.runtime());
    Ok(serde_json::to_value(view).unwrap_or(serde_json::Value::Null))
}

/// The all-games document (§11.L L1/L2).
#[tauri::command(async)]
pub fn settings_set_global(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    setting: GlobalSetting,
) -> AppResult<()> {
    guard::allow(window.label(), "settings_set_global")?;
    let now = now_ms();
    let mut host = state.lock();

    // `operator.active` must name a live operator. That is a catalog fact, so
    // the check lives here where both services are in reach; `FlagService`
    // stores what it is given.
    if let GlobalSetting::ActiveOperatorId(Some(id)) = &setting {
        let item = host
            .catalog
            .catalog_get(CatalogKind::Operator, id.as_str())?;
        if item.as_operator().is_some_and(|o| o.stamps.is_archived()) {
            return Err(MatchError::IllegalSettings {
                key: "operator.active",
                reason: "an archived operator cannot be active",
            }
            .into());
        }
    }

    // §13.6: Statistics never shares a display with Stage. The refusal is
    // here rather than in `FlagService`, because "which display Stage is on"
    // is this crate's knowledge, not the settings document's.
    if let GlobalSetting::StatsMonitorId(Some(id)) = &setting
        && host.flags.control().stage_monitor_id.as_deref() == Some(id.as_str())
    {
        return Err(MatchError::IllegalSettings {
            key: "stats.monitor_id",
            reason: "that display is showing Stage",
        }
        .into());
    }

    let ctx = host.runtime();
    // Picking a display says *where* Statistics would go, not that it should
    // appear: `stats_window` is the only thing that opens it (§11.K, revised
    // 2026-09-07). An open window does follow the new pick, though — the
    // operator moved it on purpose.
    let places_stats = matches!(
        setting,
        GlobalSetting::StatsMonitorId(_) | GlobalSetting::StatsFullscreen(_)
    );
    host.flags.settings_set_global(setting, ctx)?;
    let stats_target = places_stats.then(|| {
        let control = host.flags.control();
        (
            control.stats_monitor_id.clone().map(MonitorKey::new),
            control.stats_fullscreen,
        )
    });

    // Control-behaviour keys are live for the whole Play (§2.5), so the copy
    // `MatchService` holds moves with them. No frozen key can reach here.
    let live = host.flags.live();
    host.play.set_live_settings(live);

    let globals = host.flags.globals().clone();
    host.catalog.settings_store(&globals)?;

    // `reveal.*` and `overlay_animations.enabled` are in the Stage emission.
    emit::play_state(&app, &mut host, now, true);

    // Outside the lock: touching a window can pump the message loop, and a
    // webview that invokes while this command still holds the lock waits on
    // itself.
    drop(host);
    if let Some((key, fullscreen)) = stats_target
        && windows::stats_is_open(&app)
    {
        windows::open_stats(&app, key.as_ref(), fullscreen)?;
    }
    Ok(())
}

/// The recipe's B5 document (§11.L L3). Refused for a game-affecting key while
/// a Play is open — that refusal is §2.5, not a UI courtesy.
///
/// The write lands on the recipe in Control **and** on its stored row, so a
/// Control edit before the Play is the recipe's new default rather than a
/// setting that evaporates on reload.
#[tauri::command(async)]
pub fn settings_set_current_game(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    setting: GameSetting,
) -> AppResult<()> {
    guard::allow(window.label(), "settings_set_current_game")?;
    let now = now_ms();
    let mut host = state.lock();

    let ctx = host.runtime();
    host.flags.settings_set_current_game(setting, ctx)?;

    if let Some(game) = host.flags.current_game().cloned()
        && let Some(recipe_id) = host
            .play
            .get_state()
            .map(|p| p.snapshot().recipe_id.clone())
    {
        let change = host.catalog.recipe_set_settings(&recipe_id, game, now)?;
        emit::recipe_changed(&app, &change);
    }

    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

/// The command ↔ chord table (§2.20). `chord: null` clears the binding; a
/// chord already bound to another command is refused, because the host cannot
/// know whether the operator meant *keep* or *reassign* (§4.2).
#[tauri::command(async)]
pub fn settings_set_shortcut(
    window: WebviewWindow,
    state: State<'_, AppState>,
    command: String,
    chord: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "settings_set_shortcut")?;
    let parsed = match chord.as_deref() {
        None => None,
        Some(raw) => Some(Chord::parse(raw).ok_or(MatchError::IllegalSettings {
            key: "shortcuts",
            reason: "not a chord this build understands",
        })?),
    };
    let mut host = state.lock();
    host.flags.settings_set_shortcut(&command, parsed)?;
    let globals = host.flags.globals().clone();
    host.catalog.settings_store(&globals)?;
    Ok(())
}

// ------------------------------------------------------------- operators, pins

fn pin_path(id: &OperatorId) -> String {
    format!("operator.{id}.pin")
}

fn pin_refusal(id: &OperatorId, reason: &'static str) -> AppError {
    CatalogError::Invalid {
        target_path: pin_path(id),
        reason,
    }
    .into()
}

fn operator_row(host: &Host, id: &OperatorId) -> AppResult<Operator> {
    let item = host
        .catalog
        .catalog_get(CatalogKind::Operator, id.as_str())?;
    item.as_operator()
        .cloned()
        .ok_or_else(|| AppError::Window(format!("{id} is not an operator")))
}

/// §12.3: nothing that reaches stored Plays runs while one is loaded or open.
/// Checked before any pin, because the pin is not what protects the show.
pub(super) fn refuse_while_play_loaded(host: &Host) -> AppResult<()> {
    if host.play.get_state().is_some() {
        return Err(MatchError::PlayOpen.into());
    }
    Ok(())
}

/// The active operator's pin, when one is set. No active operator or no pin
/// means nothing to ask for.
pub(super) fn require_active_operator_pin(host: &Host, pin: Option<&str>) -> AppResult<()> {
    let Some(id) = host.flags.globals().active_operator_id.clone() else {
        return Ok(());
    };
    let operator = operator_row(host, &id)?;
    check_pin(&operator, pin)
}

fn check_pin(operator: &Operator, pin: Option<&str>) -> AppResult<()> {
    let Some(hash) = operator.pin_hash.as_deref() else {
        return Ok(());
    };
    let Some(pin) = pin.filter(|p| !p.is_empty()) else {
        return Err(pin_refusal(&operator.id, "a pin is required"));
    };
    if !verify_pin(pin, hash) {
        return Err(pin_refusal(&operator.id, "wrong pin"));
    }
    Ok(())
}

/// Set, change or clear an operator's pin (§2.15). The digits arrive here once
/// and are hashed here; Studio never sees or makes a hash. Changing or clearing
/// an existing pin needs the current one.
#[tauri::command(async)]
pub fn operator_set_pin(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: OperatorId,
    pin: Option<String>,
    current_pin: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "operator_set_pin")?;
    let now = now_ms();
    let host = state.lock();
    let mut operator = operator_row(&host, &id)?;
    if operator.pin_hash.is_some() {
        check_pin(&operator, current_pin.as_deref())?;
    }
    operator.pin_hash = match pin.as_deref().filter(|p| !p.is_empty()) {
        None => None,
        Some(digits) => {
            validate_pin_format(digits).map_err(|_| pin_refusal(&id, "a pin is 4-8 digits"))?;
            Some(hash_pin(digits).map_err(|_| pin_refusal(&id, "the pin could not be hashed"))?)
        }
    };
    let change = host
        .catalog
        .catalog_upsert(&CatalogItem::from(operator), now)?;
    emit::catalog_changed(&app, &change);
    Ok(())
}

/// Switch the active operator (§2.15). A pinned target asks for its pin; the
/// switch is a settings write plus `OperatorSwitched` on an open Play (§2.26)
/// — the timer keeps running, and nothing on Stage changes.
#[tauri::command(async)]
pub fn operator_activate(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: OperatorId,
    pin: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "operator_activate")?;
    let now = now_ms();
    let mut host = state.lock();
    let mut operator = operator_row(&host, &id)?;
    if operator.stamps.is_archived() {
        return Err(MatchError::IllegalSettings {
            key: "operator.active",
            reason: "an archived operator cannot be active",
        }
        .into());
    }
    check_pin(&operator, pin.as_deref())?;

    let ctx = host.runtime();
    host.flags
        .settings_set_global(GlobalSetting::ActiveOperatorId(Some(id.clone())), ctx)?;
    let globals = host.flags.globals().clone();
    host.catalog.settings_store(&globals)?;

    operator.last_active_at = Some(now);
    let change = host
        .catalog
        .catalog_upsert(&CatalogItem::from(operator), now)?;
    emit::catalog_changed(&app, &change);

    host.write(now, |h| Ok(h.play.operator_switched(id.clone(), now)?))?;
    emit::play_state(&app, &mut host, now, true);
    Ok(())
}

// ------------------------------------------------------------------ paths, data

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppPaths {
    pub user_data: String,
    pub catalog: String,
    pub cue_pack: String,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PathKind {
    UserData,
    CuePack,
}

fn cue_pack_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    if tauri::is_dev() {
        // The repo's pack, next to the source it is generated from.
        let manifest = std::path::Path::new(env!("CARGO_MANIFEST_DIR"));
        return Ok(manifest.join("../../packages/design-stage/audio"));
    }
    Ok(app
        .path()
        .resource_dir()
        .map_err(|e| AppError::Window(format!("no resource directory: {e}")))?
        .join("stage")
        .join("audio"))
}

/// Where the generated files live (§12.1 first run, §12.3). Read-only.
#[tauri::command]
pub fn paths_get(window: WebviewWindow, app: AppHandle) -> AppResult<AppPaths> {
    guard::allow(window.label(), "paths_get")?;
    let user_data = crate::state::user_data_dir(&app)?;
    Ok(AppPaths {
        catalog: user_data.join("questiongame.sqlite3").display().to_string(),
        user_data: user_data.display().to_string(),
        cue_pack: cue_pack_dir(&app)?.display().to_string(),
    })
}

/// Open one of those directories in the OS file manager. No plugin: one
/// process spawn, its exit status ignored.
#[tauri::command(async)]
pub fn paths_reveal(window: WebviewWindow, app: AppHandle, which: PathKind) -> AppResult<()> {
    guard::allow(window.label(), "paths_reveal")?;
    let dir = match which {
        PathKind::UserData => crate::state::user_data_dir(&app)?,
        PathKind::CuePack => cue_pack_dir(&app)?,
    };
    let program = if cfg!(target_os = "windows") {
        "explorer"
    } else if cfg!(target_os = "macos") {
        "open"
    } else {
        "xdg-open"
    };
    std::process::Command::new(program)
        .arg(&dir)
        .spawn()
        .map_err(|e| AppError::Window(format!("cannot open {}: {e}", dir.display())))?;
    Ok(())
}

/// Remove every generated user file and quit (§17 platform, §12.3). Refused
/// while a Play is loaded; pin-gated. The catalog is swapped for an in-memory
/// one first so the SQLite handles drop before the directory goes — Windows
/// will not delete an open file. App files are the installer's job (P12).
#[tauri::command(async)]
pub fn uninstall_data(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    pin: Option<String>,
) -> AppResult<()> {
    guard::allow(window.label(), "uninstall_data")?;
    let dir = crate::state::user_data_dir(&app)?;
    {
        let mut host = state.lock();
        refuse_while_play_loaded(&host)?;
        require_active_operator_pin(&host, pin.as_deref())?;
        host.catalog = questiongame_host::CatalogService::in_memory()?;
    }
    std::fs::remove_dir_all(&dir)
        .map_err(|e| AppError::Window(format!("cannot remove {}: {e}", dir.display())))?;
    tracing::info!(dir = %dir.display(), "generated data removed; quitting");
    app.exit(0);
    Ok(())
}

/// The current health report — what `health` last emitted (§12.6).
#[tauri::command]
pub fn health_get(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<HealthReport> {
    guard::allow(window.label(), "health_get")?;
    let host = state.lock();
    Ok(host.health.last().cloned().unwrap_or_else(HealthReport::ok))
}
