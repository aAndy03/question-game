//! `CatalogError` — the reject table for the library and the recipe store.
//!
//! Separate from [`MatchError`](crate::error::MatchError) on purpose: that one
//! is the §5.3 table for a running Play, and mixing "this question has one
//! option" into it would make both lists harder to read. Every variant here
//! carries what the notice family (§14) needs — a `target_path` that points at
//! a row an operator can open.

use serde::{Deserialize, Serialize};
use thiserror::Error;

use crate::error::MatchError;

/// What the catalog was asked about, and what `catalog-changed { kind, … }`
/// reports (§11.A).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CatalogKind {
    Team,
    Domain,
    Question,
    Operator,
    Asset,
    Recipe,
}

impl CatalogKind {
    pub const ALL: [CatalogKind; 6] = [
        CatalogKind::Team,
        CatalogKind::Domain,
        CatalogKind::Question,
        CatalogKind::Operator,
        CatalogKind::Asset,
        CatalogKind::Recipe,
    ];

    /// The tab name, and the `kind` field of `catalog-changed`.
    pub fn as_str(self) -> &'static str {
        match self {
            CatalogKind::Team => "team",
            CatalogKind::Domain => "domain",
            CatalogKind::Question => "question",
            CatalogKind::Operator => "operator",
            CatalogKind::Asset => "asset",
            CatalogKind::Recipe => "recipe",
        }
    }

    pub(crate) fn table(self) -> &'static str {
        match self {
            CatalogKind::Team => "teams",
            CatalogKind::Domain => "domains",
            CatalogKind::Question => "questions",
            CatalogKind::Operator => "operators",
            CatalogKind::Asset => "assets",
            CatalogKind::Recipe => "recipes",
        }
    }
}

impl std::fmt::Display for CatalogKind {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

#[derive(Debug, Error)]
pub enum CatalogError {
    #[error("no {kind} with id {id}")]
    NotFound { kind: CatalogKind, id: String },

    /// A row a recipe or an open Play still points at. Hard delete is not v1
    /// (§4.1); this is the guard on the paths that *would* remove data.
    #[error("{kind} {id} is still used by {used_by}")]
    StillReferenced {
        kind: CatalogKind,
        id: String,
        used_by: &'static str,
    },

    /// A shape rule — the §2.32 floor for a question (a stem or an option,
    /// option text, difficulty 1–100) or a recipe board rule (P11.13, §2.32).
    #[error("{target_path}: {reason}")]
    Invalid {
        target_path: String,
        reason: &'static str,
    },

    /// A question file the import could not read at all (§2.32) — not JSON,
    /// not this format, too long, a default domain that is not there. Nothing
    /// was written. Its own variant because the reason carries the parser's
    /// line and column, which a `&'static str` cannot.
    #[error("import: {reason}")]
    Import { reason: String },

    /// A settings document that would not be legal (§4.2). The recipe store
    /// runs the same interlocks `FlagService` does, because a recipe row is
    /// where an illegal document would otherwise be able to hide.
    #[error(transparent)]
    Settings(#[from] MatchError),

    /// §4.3: two Plays of one recipe cannot be `playing` at once — a rule that
    /// has to survive a restart of the process, not only hold inside one
    /// `MatchService`.
    #[error("recipe {recipe} already has an open play, {play}")]
    PlayAlreadyOpen { recipe: String, play: String },

    /// The file was written by a newer build. v1 is forward-only and has no
    /// downgrade story, so this is a notice, not a silent migration.
    #[error("the library is at schema {found}, this build knows {known}")]
    SchemaTooNew { found: u32, known: u32 },

    /// The copy an upgrade takes before it changes anything could not be
    /// written (P12.6). Nothing was migrated and nothing was written: the
    /// library is as the previous build left it.
    #[error("could not back up the library to {}: {reason}. Nothing was changed; the previous version can still open it.", dir.display())]
    BackupFailed { dir: std::path::PathBuf, reason: String },

    /// An id that belongs to a row local to another workspace. A save cannot
    /// reach across: only copy and move change where a row lives.
    #[error("{kind} {id} belongs to another workspace")]
    WrongWorkspace { kind: CatalogKind, id: String },

    /// No active workspace to open the library in. Every library has one from
    /// migration 4 on, and the last active one cannot be archived, so this is
    /// a damaged file, not an operator mistake.
    #[error("the library has no active workspace")]
    NoWorkspace,

    /// A reference rule between workspaces and the shared library: a shared
    /// domain holds only shared questions; a game uses its own and shared rows.
    #[error("{rule}: {detail}")]
    ScopeRule { rule: &'static str, detail: String },

    #[error(transparent)]
    Sqlite(#[from] rusqlite::Error),

    /// The search index. It is a projection of the catalog, so a failure here
    /// costs a search result, never a row.
    #[error("search: {0}")]
    Search(#[from] tantivy::TantivyError),

    #[error("could not read a stored record: {0}")]
    Corrupt(#[from] serde_json::Error),
}

impl CatalogError {
    pub(crate) fn not_found(kind: CatalogKind, id: impl Into<String>) -> Self {
        CatalogError::NotFound {
            kind,
            id: id.into(),
        }
    }

    pub(crate) fn invalid(target_path: impl Into<String>, reason: &'static str) -> Self {
        CatalogError::Invalid {
            target_path: target_path.into(),
            reason,
        }
    }
}

pub type CatalogResult<T> = Result<T, CatalogError>;
