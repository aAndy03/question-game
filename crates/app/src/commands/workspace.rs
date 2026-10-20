//! Workspaces (Beta 2.0): several libraries in one file, a shared one, and the
//! switcher that picks which one Studio works in.
//!
//! The scope itself is the host's — `CatalogService` binds its writer
//! connection to the current workspace. This layer adds what only the app
//! knows: whether a game is loaded in Control (a switch, an archive or a
//! delete would pull rows out from under it), the active operator's pin, the
//! clock, the backup folder, and the per-workspace half of the settings
//! document, which `FlagService` holds in memory.

use questiongame_host::catalog::{
    CatalogChange, ChangeOp, DeleteReport, OpenOptions, Selection, TransferOp, TransferReport, Workspace,
    WorkspaceGroup,
};
use questiongame_host::{WorkspaceGroupId, WorkspaceId};
use serde::Serialize;
use tauri::{AppHandle, State, WebviewWindow};

use crate::error::AppResult;
use crate::state::{AppState, Host, now_ms};
use crate::{emit, guard};

/// What `workspace_list` answers and `workspace-changed` carries.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspaces {
    pub current: WorkspaceId,
    pub workspaces: Vec<Workspace>,
    pub groups: Vec<WorkspaceGroup>,
}

pub fn workspaces(host: &Host) -> AppResult<Workspaces> {
    let (workspaces, groups) = host.catalog.workspace_list()?;
    Ok(Workspaces {
        current: host.catalog.current_workspace(),
        workspaces,
        groups,
    })
}

/// What *Delete permanently* asks before it runs.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeletePreview {
    pub rows: usize,
    pub games: usize,
    pub plays: usize,
}

/// The current workspace's defaults, written back to it. Called after any
/// change to the game defaults or the timer, and before a switch leaves.
pub fn save_workspace_defaults(host: &Host, now: u64) -> AppResult<()> {
    let current = host.catalog.current_workspace();
    host.catalog
        .workspace_set_defaults(&current, &host.flags.workspace_defaults(), now)?;
    Ok(())
}

/// Take the current workspace's defaults into `FlagService`. A workspace that
/// has none yet keeps what the app had — the settings document's on the first
/// boot, the previous workspace's after a switch — and is given them.
pub fn adopt_workspace_defaults(host: &mut Host, now: u64) -> AppResult<()> {
    let current = host.catalog.current_workspace();
    match host.catalog.workspace_defaults(&current)? {
        Some(defaults) => host.flags.adopt_workspace_defaults(defaults)?,
        None => save_workspace_defaults(host, now)?,
    }
    Ok(())
}

fn changed(app: &AppHandle, host: &Host) -> AppResult<Workspaces> {
    let list = workspaces(host)?;
    emit::workspace_changed(app, &list);
    Ok(list)
}

#[tauri::command(async)]
pub fn workspace_list(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<Workspaces> {
    guard::allow(window.label(), "workspace_list")?;
    workspaces(&state.lock())
}

#[tauri::command(async)]
pub fn workspace_create(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    group_id: Option<WorkspaceGroupId>,
) -> AppResult<Workspace> {
    guard::allow(window.label(), "workspace_create")?;
    let host = state.lock();
    let created = host
        .catalog
        .workspace_create(&name, group_id.as_ref(), now_ms())?;
    changed(&app, &host)?;
    Ok(created)
}

#[tauri::command(async)]
pub fn workspace_rename(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
    name: String,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_rename")?;
    let host = state.lock();
    host.catalog.workspace_rename(&id, &name, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_set_group(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
    group_id: Option<WorkspaceGroupId>,
    sort_key: i64,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_set_group")?;
    let host = state.lock();
    host.catalog
        .workspace_set_group(&id, group_id.as_ref(), sort_key, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_duplicate(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
    name: String,
) -> AppResult<Workspace> {
    guard::allow(window.label(), "workspace_duplicate")?;
    let host = state.lock();
    if host.catalog.current_workspace() == id {
        // The copy should carry the defaults as they are now, not as they
        // were at the last save.
        save_workspace_defaults(&host, now_ms())?;
    }
    let copy = host.catalog.workspace_duplicate(&id, &name, now_ms())?;
    changed(&app, &host)?;
    Ok(copy)
}

#[tauri::command(async)]
pub fn workspace_archive(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_archive")?;
    let host = state.lock();
    host.catalog.workspace_archive(&id, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_restore(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_restore")?;
    let host = state.lock();
    host.catalog.workspace_restore(&id, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_delete_preview(
    window: WebviewWindow,
    state: State<'_, AppState>,
    id: WorkspaceId,
) -> AppResult<DeletePreview> {
    guard::allow(window.label(), "workspace_delete_preview")?;
    let (rows, games, plays) = state.lock().catalog.workspace_delete_preview(&id)?;
    Ok(DeletePreview { rows, games, plays })
}

/// *Delete permanently* — an archived workspace only, never while a game is
/// loaded, pin-gated like *Wipe Plays*, and the library is copied first.
#[tauri::command(async)]
pub fn workspace_delete(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
    pin: Option<String>,
) -> AppResult<DeleteReport> {
    guard::allow(window.label(), "workspace_delete")?;
    let options: OpenOptions = crate::state::open_options(&crate::state::user_data_dir(&app)?);
    let host = state.lock();
    super::flags::refuse_while_play_loaded(&host)?;
    super::flags::require_active_operator_pin(&host, pin.as_deref())?;
    let report = host.catalog.workspace_delete(&id, &options)?;
    tracing::info!(workspace = %id, rows = report.rows, games = report.games, plays = report.plays, "workspace deleted");
    changed(&app, &host)?;
    Ok(report)
}

/// Work in another workspace. Refused while a game is loaded in Control: its
/// Play is scoped to the workspace its game lives in.
#[tauri::command(async)]
pub fn workspace_switch(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceId,
) -> AppResult<Workspaces> {
    guard::allow(window.label(), "workspace_switch")?;
    let now = now_ms();
    let mut host = state.lock();
    super::flags::refuse_while_play_loaded(&host)?;
    save_workspace_defaults(&host, now)?;
    host.catalog.workspace_switch(&id)?;
    adopt_workspace_defaults(&mut host, now)?;
    let globals = host.flags.globals().clone();
    host.catalog.settings_store(&globals)?;
    tracing::info!(workspace = %id, "workspace switched");
    changed(&app, &host)
}

#[tauri::command(async)]
pub fn workspace_group_create(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
) -> AppResult<WorkspaceGroup> {
    guard::allow(window.label(), "workspace_group_create")?;
    let host = state.lock();
    let group = host.catalog.group_create(&name, now_ms())?;
    changed(&app, &host)?;
    Ok(group)
}

#[tauri::command(async)]
pub fn workspace_group_rename(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceGroupId,
    name: String,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_group_rename")?;
    let host = state.lock();
    host.catalog.group_rename(&id, &name, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_group_reorder(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    order: Vec<WorkspaceGroupId>,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_group_reorder")?;
    let host = state.lock();
    host.catalog.group_reorder(&order, now_ms())?;
    changed(&app, &host)?;
    Ok(())
}

#[tauri::command(async)]
pub fn workspace_group_delete(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: WorkspaceGroupId,
) -> AppResult<()> {
    guard::allow(window.label(), "workspace_group_delete")?;
    let host = state.lock();
    host.catalog.group_delete(&id)?;
    changed(&app, &host)?;
    Ok(())
}

// ------------------------------------------------------------------ transfers

/// A game in Control cannot leave: its Play is scoped to where it lives.
fn refuse_moving_the_loaded_game(host: &Host, selection: &Selection) -> AppResult<()> {
    if let Some(play) = host.play.get_state()
        && selection.recipes.contains(&play.snapshot().recipe_id)
    {
        return Err(questiongame_host::MatchError::PlayOpen.into());
    }
    Ok(())
}

/// Every row a transfer touched, as `catalog-changed`: the rows that left
/// this workspace and the ones that arrived in the shared library both change
/// what its lists show.
fn transferred(app: &AppHandle, report: &TransferReport) {
    for touched in report.created.iter().chain(&report.moved) {
        emit::catalog_changed(
            app,
            &CatalogChange { kind: touched.kind, id: touched.id.clone(), op: ChangeOp::Upserted },
        );
    }
}

/// What a copy, move or share would do — what comes along, what is reused,
/// what refuses — before the operator confirms it.
#[tauri::command(async)]
pub fn transfer_preview(
    window: WebviewWindow,
    state: State<'_, AppState>,
    op: TransferOp,
    selection: Selection,
    target: Option<WorkspaceId>,
) -> AppResult<TransferReport> {
    guard::allow(window.label(), "transfer_preview")?;
    Ok(state.lock().catalog.transfer_preview(op, &selection, target.as_ref())?)
}

#[tauri::command(async)]
pub fn catalog_copy_to(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    selection: Selection,
    target: WorkspaceId,
) -> AppResult<TransferReport> {
    guard::allow(window.label(), "catalog_copy_to")?;
    let host = state.lock();
    let report = host.catalog.catalog_copy_to(&selection, &target, now_ms())?;
    transferred(&app, &report);
    Ok(report)
}

#[tauri::command(async)]
pub fn catalog_move_to(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    selection: Selection,
    target: WorkspaceId,
) -> AppResult<TransferReport> {
    guard::allow(window.label(), "catalog_move_to")?;
    let host = state.lock();
    refuse_moving_the_loaded_game(&host, &selection)?;
    let report = host.catalog.catalog_move_to(&selection, &target, now_ms())?;
    transferred(&app, &report);
    Ok(report)
}

#[tauri::command(async)]
pub fn catalog_make_shared(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    selection: Selection,
) -> AppResult<TransferReport> {
    guard::allow(window.label(), "catalog_make_shared")?;
    let host = state.lock();
    let report = host.catalog.catalog_make_shared(&selection, now_ms())?;
    transferred(&app, &report);
    Ok(report)
}

#[tauri::command(async)]
pub fn catalog_make_local(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    selection: Selection,
) -> AppResult<TransferReport> {
    guard::allow(window.label(), "catalog_make_local")?;
    let host = state.lock();
    let report = host.catalog.catalog_make_local(&selection, now_ms())?;
    transferred(&app, &report);
    Ok(report)
}

#[cfg(test)]
mod tests {
    use super::*;
    use questiongame_host::catalog::CatalogLocation;
    use questiongame_host::flags::GlobalSetting;

    fn host() -> Host {
        Host::open(CatalogLocation::Memory).unwrap()
    }

    #[test]
    fn each_workspace_keeps_its_own_defaults_across_a_switch() {
        let mut host = host();
        let first = host.catalog.current_workspace();
        let second = host.catalog.workspace_create("Second", None, 1).unwrap().id;
        let ctx = host.runtime();
        host.flags
            .settings_set_global(GlobalSetting::TimerDurationMs(45_000), ctx)
            .unwrap();
        save_workspace_defaults(&host, 2).unwrap();

        // Into a workspace with none yet: it starts from where we came from.
        save_workspace_defaults(&host, 3).unwrap();
        host.catalog.workspace_switch(&second).unwrap();
        adopt_workspace_defaults(&mut host, 3).unwrap();
        assert_eq!(host.flags.workspace_defaults().timer.duration_ms, Some(45_000));
        let ctx = host.runtime();
        host.flags
            .settings_set_global(GlobalSetting::TimerDurationMs(20_000), ctx)
            .unwrap();
        save_workspace_defaults(&host, 4).unwrap();

        host.catalog.workspace_switch(&first).unwrap();
        adopt_workspace_defaults(&mut host, 5).unwrap();
        assert_eq!(host.flags.workspace_defaults().timer.duration_ms, Some(45_000), "the first kept its own");
        host.catalog.workspace_switch(&second).unwrap();
        adopt_workspace_defaults(&mut host, 6).unwrap();
        assert_eq!(host.flags.workspace_defaults().timer.duration_ms, Some(20_000));
    }

    #[test]
    fn only_studio_may_touch_workspaces() {
        for command in [
            "workspace_list", "workspace_create", "workspace_rename", "workspace_set_group",
            "workspace_duplicate", "workspace_archive", "workspace_restore", "workspace_delete_preview",
            "workspace_delete", "workspace_switch", "workspace_group_create", "workspace_group_rename",
            "workspace_group_reorder", "workspace_group_delete", "transfer_preview",
            "catalog_copy_to", "catalog_move_to", "catalog_make_shared", "catalog_make_local",
        ] {
            assert!(!guard::stage_may_call(command), "{command}");
            assert!(!guard::stats_may_call(command), "{command}");
            assert!(guard::allow("stage", command).is_err());
            assert!(guard::allow("stats", command).is_err());
        }
    }

    #[test]
    fn the_list_names_the_current_workspace() {
        let host = host();
        let list = workspaces(&host).unwrap();
        assert_eq!(list.workspaces.len(), 1);
        assert_eq!(list.current, list.workspaces[0].id);
        assert_eq!(list.workspaces[0].name, None);
    }
}
