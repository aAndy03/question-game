//! Entity ids.
//!
//! Every id is a distinct newtype over `String`. The cost is one `::from` at
//! the edges; the return is that `give_token(question_id)` does not compile.
//! Node ids and layout overrides key off these values (P1), so they are stable
//! for the life of a Play and never derived from an array index.

use std::fmt;

use serde::{Deserialize, Serialize};

macro_rules! id_type {
    ($(#[$meta:meta])* $name:ident) => {
        $(#[$meta])*
        #[derive(Clone, PartialEq, Eq, PartialOrd, Ord, Hash, Serialize, Deserialize)]
        #[serde(transparent)]
        pub struct $name(String);

        impl $name {
            pub fn new(value: impl Into<String>) -> Self {
                Self(value.into())
            }

            pub fn as_str(&self) -> &str {
                &self.0
            }
        }

        impl From<&str> for $name {
            fn from(value: &str) -> Self {
                Self(value.to_owned())
            }
        }

        impl From<String> for $name {
            fn from(value: String) -> Self {
                Self(value)
            }
        }

        impl fmt::Display for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                f.write_str(&self.0)
            }
        }

        /// `Debug` prints the bare id — assertion failures read as
        /// `team-alpha`, not `TeamId("team-alpha")`.
        impl fmt::Debug for $name {
            fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
                write!(f, "{}", self.0)
            }
        }
    };
}

id_type!(
    /// A team in the roster. Snapshot-copied at Play start (§4.3).
    TeamId
);
id_type!(
    /// A domain on the board.
    DomainId
);
id_type!(
    /// A question in the snapshot. Consumption is per-Play (§2.1).
    QuestionId
);
id_type!(
    /// One answer option. Judging compares sets of these (§2.5).
    OptionId
);
id_type!(
    /// One run of a recipe.
    PlayId
);
id_type!(
    /// The recipe a Play was built from.
    RecipeId
);
id_type!(
    /// A user-data file the catalog points at — logo, question media (§4.1).
    /// The row survives a missing file; Stage falls back to a plate.
    AssetId
);
id_type!(
    /// Whoever is running the show (§4.1). Never part of a Play's truth.
    OperatorId
);
id_type!(
    /// One library among several in the same file (Beta 2.0).
    WorkspaceId
);
id_type!(
    /// A named group of workspaces in the switcher.
    WorkspaceGroupId
);
id_type!(
    /// One appended fact. `<play id>:<seq>` — deterministic, so a replay
    /// rebuilds the same log rather than a fresh set of uuids.
    EventId
);

impl PlayId {
    /// Callers (P5/P6) mint a Play id once, outside the event fold. The fold
    /// itself stays deterministic.
    pub fn generate() -> Self {
        Self(uuid::Uuid::new_v4().to_string())
    }
}

impl EventId {
    pub fn of(play: &PlayId, seq: u64) -> Self {
        Self(format!("{play}:{seq}"))
    }
}
