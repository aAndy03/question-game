//! Workspaces (Beta 2.0): several libraries in one file, and a shared library
//! every workspace sees.
//!
//! A workspace is a name the operator typed and nothing else — no kind, no
//! template, no suggested name. What a workspace sees is its own rows and the
//! shared ones, and that scope is decided in the host, on the writer
//! connection ([`super::db::bind_workspace`]), for every read and write.
//! Operators, shortcuts and the app's own settings stay global.

use serde::{Deserialize, Serialize};

use crate::ids::{WorkspaceGroupId, WorkspaceId};

use super::error::{CatalogError, CatalogResult};

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
