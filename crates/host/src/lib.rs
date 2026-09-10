//! `questiongame-host` — the Rust host.
//!
//! Three services, no UI. Nothing here imports `tauri::` — a test asserts it
//! with a source sweep — and Tauri wraps this library at P6 (`04_ROADMAP.md`).
//!
//! ```text
//! MatchService         all game truth (P4). The only writer of a Play.
//! FlagService          the settings document and the only flag reader (P5).
//! CatalogService       the library, the recipe store and the Play log (P5).
//! PresentationService  the screen, the overlay queue, the reveals (P6) —
//!                      it writes reveals *through* `MatchService`.
//! ```
//!
//! Two plain modules sit beside them (P10): `operator` hashes and verifies
//! pins, `health` turns a handful of inputs into a report. Neither holds
//! state; the app crate hands them values.
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
//! explain   why an award is what it is — the one copy of the formula
//! ring      the round invariant (§5.4)
//! session   one question, issue → outcome (§5.3)
//! timer     the countdown; no clock inside, zero is a computed instant
//! award     points (§2.3, §4.4)
//! rules     judging and competition rank
//! snapshot  the §4.3 copy taken at Play start
//! settings  frozen vs control-behaviour keys
//! flags     the settings document, the §4.2 interlocks, the `feat.*` roots
//! presentation  the current screen, the overlay queue, the `anim-complete` door
//! preview   what the rules would pay, before a Play runs them
//! monitor   where the Stage window lives; the OS list arrives as data
//! notice    the §14 `{ code, severity, target_path, actions[] }` shape
//! stage     `play-state`, checked against the P1 fixtures
//! stats     the §11.K fold: a log becomes turn facts, facts become rows
//! operator  pins: argon2id in, PHC string out, never the digits (§2.15)
//! health    the §12.6 report over inputs the app crate measures
//! ```
//!
//! Section references (`§5.4`) point at `docs/v1/optimized_first_spec.md`,
//! which is the decision file. Where this code and that doc disagree, the doc
//! is right and the code is a bug.

pub mod award;
pub mod catalog;
pub mod error;
pub mod event;
pub mod explain;
pub mod flags;
pub mod health;
pub mod ids;
pub mod monitor;
pub mod notice;
pub mod operator;
pub mod play;
pub mod presentation;
pub mod preview;
pub mod ring;
pub mod rules;
pub mod service;
pub mod session;
pub mod settings;
pub mod snapshot;
pub mod stage;
pub mod stats;
pub mod timer;

pub use catalog::{CatalogError, CatalogKind, CatalogLocation, CatalogService};
pub use error::{MatchError, MatchResult};
pub use event::{Event, EventKind};
pub use explain::{AwardBreakdown, BaseSource, SpeedFactor, SpeedOff};
pub use flags::{
    AudioSettings, CueKey, FeatureRoot, FlagService, GameSettings, GlobalSettings, RuntimeContext,
};
pub use health::{HealthInputs, HealthReport, HealthStatus};
pub use ids::{
    AssetId, DomainId, EventId, OperatorId, OptionId, PlayId, QuestionId, RecipeId, TeamId,
};
pub use monitor::{
    MonitorError, MonitorInfo, MonitorKey, StageDisplay, StageMove, StagePlacement, StageReattach,
};
pub use notice::{Notice, Severity};
pub use play::{Play, PlayStatus};
pub use presentation::PresentationService;
pub use preview::{BoardShape, PreviewBoard, RulesPreview};
pub use ring::Ring;
pub use rules::Verdict;
pub use service::{MatchService, RestartMode};
pub use session::Session;
pub use snapshot::{PlaySnapshot, SnapshotDomain, SnapshotOption, SnapshotQuestion, SnapshotTeam};
pub use stage::{OverlayRequest, PlayStateForStage, StageDecorSettings, StageScreen};
pub use timer::Timer;
