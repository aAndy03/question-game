//! `questiongame-host` — the Rust host.
//!
//! Three services, no UI. Nothing here imports `tauri::` — a test asserts it
//! with a source sweep — and Tauri wraps this library at P6 (`04_ROADMAP.md`).
//!
//! ```text
//! MatchService    all game truth (P4). The only writer of a Play.
//! FlagService     the settings document and the only flag reader (P5).
//! CatalogService  the library, the recipe store and the Play log (P5).
//! ```
//!
//! They compose without knowing about each other: `FlagService::freeze` hands
//! `CatalogService::build_snapshot` the resolved settings, the snapshot goes
//! into `MatchService::play_load`, and the Play's log goes back to
//! `CatalogService::play_persist`. Nothing else writes a Play, resolves the
//! §2.18 cascade, or runs SQL.
//!
//! ```text
//! catalog   the library, the recipe store, the Play log, `catalog_search`
//! service   the §13 command surface — the only writer of a Play
//! play      the materialized projection; a pure fold over the log
//! event     the append-only log, undo as an inversion span
//! ring      the round invariant (§5.4)
//! session   one question, issue → outcome (§5.3)
//! timer     the countdown; no clock inside, zero is a computed instant
//! award     points (§2.3, §4.4)
//! rules     judging and competition rank
//! snapshot  the §4.3 copy taken at Play start
//! settings  frozen vs control-behaviour keys
//! flags     the settings document, the §4.2 interlocks, the `feat.*` roots
//! stage     the game half of `play-state`, checked against the P1 fixtures
//! ```
//!
//! Section references (`§5.4`) point at `docs/v1/optimized_first_spec.md`,
//! which is the decision file. Where this code and that doc disagree, the doc
//! is right and the code is a bug.

pub mod award;
pub mod catalog;
pub mod error;
pub mod event;
pub mod flags;
pub mod ids;
pub mod play;
pub mod ring;
pub mod rules;
pub mod service;
pub mod session;
pub mod settings;
pub mod snapshot;
pub mod stage;
pub mod timer;

pub use catalog::{CatalogError, CatalogKind, CatalogLocation, CatalogService};
pub use error::{MatchError, MatchResult};
pub use event::{Event, EventKind};
pub use flags::{FeatureRoot, FlagService, GameSettings, GlobalSettings, RuntimeContext};
pub use ids::{
    AssetId, DomainId, EventId, OperatorId, OptionId, PlayId, QuestionId, RecipeId, TeamId,
};
pub use play::{Play, PlayStatus};
pub use ring::Ring;
pub use rules::Verdict;
pub use service::{MatchService, RestartMode};
pub use session::Session;
pub use snapshot::{PlaySnapshot, SnapshotDomain, SnapshotOption, SnapshotQuestion, SnapshotTeam};
pub use timer::Timer;
