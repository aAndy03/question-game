//! `CatalogService` — the library, the recipe store, the Play log and the
//! globals document (§11.A, §11.B, §5.10, §11.L).
//!
//! ```text
//! service   the verb list — the only thing outside this module talks to
//! model     the §4.1 entities, the recipe, and the §2.17 overlays
//! snapshot  the §4.3 copy: catalog bodies with overlays applied
//! search    Tantivy, inside the service — there is no `SearchService`
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

pub mod db;
pub mod error;
pub mod model;
pub mod search;
pub mod service;
mod snapshot;
mod store;

pub use crate::flags::GameSettings;
pub use db::CatalogLocation;
pub use error::{CatalogError, CatalogKind, CatalogResult};
pub use model::{
    ArchiveScope, Asset, BoardDomain, CatalogItem, Domain, DomainMember, DomainOverlay, EditScope,
    Operator, PlayRecord, Question, QuestionOption, QuestionOverlay, Recipe, RecipeOverlays,
    Stamps, Team, TeamOverlay,
};
pub use search::{SearchHit, SearchQuery};
pub use service::{CatalogChange, CatalogService, ChangeOp, OverlayTarget, RecipeChange};
