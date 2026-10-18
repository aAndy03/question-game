//! What a refused command looks like on the wire.
//!
//! Every §13 command returns `Result<_, AppError>`, and `AppError` serializes
//! as the §14 notice shape's first two fields: `{ code, message }`. The code is
//! stable and machine-readable; the message is the host's own `Display`, which
//! Studio may show verbatim or replace with its own copy.
//!
//! There is no `Unknown` variant. Every error in the host is already a named
//! reject-table row, and flattening them into strings here would throw away the
//! one thing Control needs to render a useful notice.

use questiongame_host::catalog::CatalogError;
use questiongame_host::{MatchError, MonitorError};
use serde::ser::SerializeStruct;

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    /// The §5.3 reject table.
    #[error(transparent)]
    Match(#[from] MatchError),
    /// Stored data said no — not found, illegal shape, a Play already open.
    #[error(transparent)]
    Catalog(#[from] CatalogError),
    /// A display that is not there, or two that answer to one key.
    #[error(transparent)]
    Monitor(#[from] MonitorError),
    /// The window layer failed: no app-data directory, a window that will not
    /// build. Rare, and never the operator's fault.
    #[error("{0}")]
    Window(String),
    /// Stage tried to drive the show. It is a projection, not a controller
    /// (§5.7) — see [`crate::guard`].
    #[error("stage may not call {command}")]
    NotForStage { command: &'static str },
    /// The one network call (P12.9) did not get an answer. Never shown
    /// unprompted: only the operator's own *Check for updates* reports it.
    #[error("could not reach GitHub: {0}")]
    Network(String),
}

impl AppError {
    /// The stable notice code.
    pub fn code(&self) -> &'static str {
        match self {
            AppError::Match(_) => "match",
            AppError::Catalog(_) => "catalog",
            AppError::Monitor(_) => "monitor",
            AppError::Window(_) => "window",
            AppError::NotForStage { .. } => "stage_not_allowed",
            AppError::Network(_) => "network",
        }
    }
}

impl From<tauri::Error> for AppError {
    fn from(error: tauri::Error) -> Self {
        AppError::Window(error.to_string())
    }
}

impl serde::Serialize for AppError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        let mut out = serializer.serialize_struct("AppError", 2)?;
        out.serialize_field("code", self.code())?;
        out.serialize_field("message", &self.to_string())?;
        out.end()
    }
}

pub type AppResult<T> = Result<T, AppError>;

#[cfg(test)]
mod tests {
    use super::*;
    use questiongame_host::TeamId;

    #[test]
    fn a_refusal_reaches_the_frontend_as_a_code_and_a_message() {
        let error = AppError::from(MatchError::IllegalTokenTarget {
            target: TeamId::from("team-b"),
            legal: vec![TeamId::from("team-c")],
        });
        let json = serde_json::to_value(&error).unwrap();
        assert_eq!(json["code"], "match");
        assert!(
            json["message"].as_str().unwrap().contains("team-b"),
            "the id the operator has to see survives the trip",
        );
    }
}
