//! Groups inside a domain, tags, and bulk edits on questions (Beta, P15) —
//! organising only. Every command is Studio's alone (`guard`), and every write
//! answers with the host's report and announces what changed as
//! `catalog-changed`, so Studio refetches from the host, never from a guess.

use questiongame_host::catalog::{BulkEdit, BulkReport, CatalogChange, CatalogKind, ChangeOp, DomainGroup, TagCount};
use questiongame_host::{DomainGroupId, DomainId, QuestionId};
use tauri::{AppHandle, State, WebviewWindow};

use crate::error::AppResult;
use crate::state::{AppState, now_ms};
use crate::{emit, guard};

fn changed(app: &AppHandle, kind: CatalogKind, id: impl Into<String>) {
    emit::catalog_changed(app, &CatalogChange { kind, id: id.into(), op: ChangeOp::Upserted });
}

fn report_changes(app: &AppHandle, report: &BulkReport, domain: Option<&DomainId>) {
    for id in &report.changed {
        changed(app, CatalogKind::Question, id.as_str());
    }
    if let Some(domain) = domain
        && !report.changed.is_empty()
    {
        changed(app, CatalogKind::Domain, domain.as_str());
    }
}

/// One edit for every selected question; `preview` writes nothing.
#[tauri::command(async)]
pub fn catalog_bulk_edit(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<QuestionId>,
    edit: BulkEdit,
    preview: bool,
) -> AppResult<BulkReport> {
    guard::allow(window.label(), "catalog_bulk_edit")?;
    let host = state.lock();
    let report = host.catalog.catalog_bulk_edit(&ids, &edit, !preview, now_ms())?;
    if !preview {
        let domain = match &edit {
            BulkEdit::Group { domain_id, .. } | BulkEdit::AddToDomain { domain_id } | BulkEdit::RemoveFromDomain { domain_id } => Some(domain_id),
            _ => None,
        };
        report_changes(&app, &report, domain);
    }
    Ok(report)
}

/// Every tag in this workspace, with how many questions carry it.
#[tauri::command(async)]
pub fn tag_list(window: WebviewWindow, state: State<'_, AppState>) -> AppResult<Vec<TagCount>> {
    guard::allow(window.label(), "tag_list")?;
    Ok(state.lock().catalog.tag_list()?)
}

#[tauri::command(async)]
pub fn tag_rename(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    from: String,
    to: String,
    preview: bool,
) -> AppResult<BulkReport> {
    guard::allow(window.label(), "tag_rename")?;
    let host = state.lock();
    let report = host.catalog.tag_rename(&from, &to, !preview, now_ms())?;
    if !preview {
        report_changes(&app, &report, None);
    }
    Ok(report)
}

#[tauri::command(async)]
pub fn tag_delete(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    tag: String,
    preview: bool,
) -> AppResult<BulkReport> {
    guard::allow(window.label(), "tag_delete")?;
    let host = state.lock();
    let report = host.catalog.tag_delete(&tag, !preview, now_ms())?;
    if !preview {
        report_changes(&app, &report, None);
    }
    Ok(report)
}

#[tauri::command(async)]
pub fn domain_group_create(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    domain_id: DomainId,
    name: String,
) -> AppResult<DomainGroup> {
    guard::allow(window.label(), "domain_group_create")?;
    let group = state.lock().catalog.domain_group_create(&domain_id, &name, now_ms())?;
    changed(&app, CatalogKind::Domain, domain_id.as_str());
    Ok(group)
}

#[tauri::command(async)]
pub fn domain_group_rename(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: DomainGroupId,
    name: String,
) -> AppResult<()> {
    guard::allow(window.label(), "domain_group_rename")?;
    // The group's stored domain is the one announced, not the caller's word for it.
    let domain_id = state.lock().catalog.domain_group_rename(&id, &name, now_ms())?;
    changed(&app, CatalogKind::Domain, domain_id.as_str());
    Ok(())
}

#[tauri::command(async)]
pub fn domain_group_reorder(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    domain_id: DomainId,
    order: Vec<DomainGroupId>,
) -> AppResult<()> {
    guard::allow(window.label(), "domain_group_reorder")?;
    state.lock().catalog.domain_group_reorder(&domain_id, &order, now_ms())?;
    changed(&app, CatalogKind::Domain, domain_id.as_str());
    Ok(())
}

/// With `into`, a merge: its questions join that group first, in one write (P20).
#[tauri::command(async)]
pub fn domain_group_delete(
    window: WebviewWindow,
    app: AppHandle,
    state: State<'_, AppState>,
    id: DomainGroupId,
    into: Option<DomainGroupId>,
) -> AppResult<()> {
    guard::allow(window.label(), "domain_group_delete")?;
    let domain_id = state
        .lock()
        .catalog
        .domain_group_delete_into(&id, into.as_ref(), now_ms())?;
    changed(&app, CatalogKind::Domain, domain_id.as_str());
    Ok(())
}

#[cfg(test)]
mod tests {
    use crate::guard;

    #[test]
    fn only_studio_may_organise_the_library() {
        for command in [
            "catalog_bulk_edit", "tag_list", "tag_rename", "tag_delete",
            "domain_group_create", "domain_group_rename", "domain_group_reorder", "domain_group_delete",
        ] {
            assert!(guard::allow("stage", command).is_err(), "{command}");
            assert!(guard::allow("stats", command).is_err(), "{command}");
        }
    }
}
