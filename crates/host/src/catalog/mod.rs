//! `CatalogService` — the library, the recipe store, the Play log and the
//! globals document (§11.A, §11.B, §5.10, §11.L).
//!
//! ```text
//! service   the verb list — the only thing outside this module talks to
//! model     the §4.1 entities, the recipe, and the §2.17 overlays
//! complete  what makes a question ready for a show (§2.32)
//! import    many questions from one JSON file, previewed then written (§2.32)
//! snapshot  the §4.3 copy: catalog bodies with overlays applied
//! search    Tantivy, inside the service — there is no `SearchService`
//! seed      the two shipped Demos, and Restore sample game (§12.1, P11.17)
//! workspace several libraries in one file, and the shared one (Beta 2.0)
//! store     every SQL statement in the project
//! db        the connection, the pragmas, the forward-only migrations
//! error     the reject table for stored data
//! ```
//!
//! The storage seam is **internal** (`01_codebase-design-spec-v1.md`): there is
//! no `Repository` port at this interface, because `rusqlite` already has a
//! local stand-in — [`CatalogLocation::Memory`] — and a port with one real
//! adapter is indirection, not a seam. Search is `catalog_search` on this
//! service for the same reason; there is no `SearchService`.

pub mod backup;
pub mod bulk;
pub mod complete;
pub mod db;
pub mod error;
pub mod family;
pub mod groups;
pub mod import;
pub mod model;
pub mod search;
pub mod seed;
pub mod service;
mod snapshot;
mod store;
pub mod transfer;
pub mod workspace;

pub use crate::flags::GameSettings;
pub use backup::{
    META_LAST_OPENED, META_LAST_SEEN, OpenOptions, OpenReport, PRE_WORKSPACES_LABEL,
    PRE_WORKSPACES_PREFIX, UNSTAMPED_VERSION, compact_copy,
};
pub use complete::QuestionGap;
pub use db::{CatalogLocation, META_CURRENT_WORKSPACE};
pub use error::{CatalogError, CatalogKind, CatalogResult};
pub use import::{ImportCounts, ImportReport, ImportRow, RowStatus};
pub use model::{
    ArchiveScope, Asset, BoardDomain, CatalogItem, Domain, DomainGroup, DomainMember, DomainOverlay, EditScope,
    Operator, Origin, PlayRecord, Question, QuestionOption, QuestionOverlay, Recipe,
    RecipeOverlays, Stamps, Team, TeamOverlay,
};
pub use search::{SearchHit, SearchQuery};
pub use seed::{Demo, SeedMode, SeedResult, SeedStatus};
pub use service::{
    CatalogChange, CatalogService, ChangeOp, OverlayTarget, RecipeChange, WipedPlays,
};
pub use bulk::{BulkEdit, BulkReport};
pub use groups::{TAG_MAX, TAGS_PER_QUESTION, TagCount, tag_key};
pub use family::{FamilyCopy, PropagationPreview, SkippedCopy};
pub use transfer::{Refusal, Selection, Touched, TransferOp, TransferReport};
pub use workspace::{DeleteReport, WORKSPACE_NAME_MAX, Workspace, WorkspaceGroup};
