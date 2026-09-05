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
use questiongame_host::flags::{Chord, GameSetting, GlobalSetting, SettingsView};
use tauri::{AppHandle, State, WebviewWindow};

use crate::error::AppResult;
use crate::state::{AppState, now_ms};
use crate::{emit, guard};

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
        let item = host.catalog.catalog_get(CatalogKind::Operator, id.as_str())?;
        if item.as_operator().is_some_and(|o| o.stamps.is_archived()) {
            return Err(MatchError::IllegalSettings {
                key: "operator.active",
                reason: "an archived operator cannot be active",
            }
            .into());
        }
    }

    let ctx = host.runtime();
    host.flags.settings_set_global(setting, ctx)?;

    // Control-behaviour keys are live for the whole Play (§2.5), so the copy
    // `MatchService` holds moves with them. No frozen key can reach here.
    let live = host.flags.live();
    host.play.set_live_settings(live);

    let globals = host.flags.globals().clone();
    host.catalog.settings_store(&globals)?;

    // `reveal.*` and `overlay_animations.enabled` are in the Stage emission.
    emit::play_state(&app, &mut host, now, true);
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
