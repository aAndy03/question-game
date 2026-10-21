//! The library entities (§4.1), the recipe (§11.B), and the per-recipe
//! overlays (§2.17).
//!
//! Two conventions run through the whole file:
//!
//! - **No clock inside**, same as the Play. Every write takes the millisecond
//!   it happened at, and `created_at` / `updated_at` are set from that. Nothing
//!   here calls `SystemTime::now`.
//! - **Metadata is host-owned.** `created_at`, `updated_at`, `play_count` and
//!   `last_play_at` are overwritten by `catalog_upsert` from the stored row;
//!   whatever a caller puts in those fields is ignored rather than trusted.
//!
//! **Archive is `archived_at`**, never a delete (§4.1). There is no hard-delete
//! path in v1, which is why the interface has `catalog_archive` /
//! `catalog_restore` and no `catalog_delete`.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::flags::GameSettings;
use crate::ids::{AssetId, DomainId, OperatorId, OptionId, QuestionId, RecipeId, TeamId};
use crate::snapshot::AnswerMode;

use super::error::{CatalogError, CatalogResult};

/// Which rows a list or a search should see. Each library tab owns its own
/// archive view (§2.24), so the scope is a parameter, never a global mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ArchiveScope {
    #[default]
    Active,
    Archived,
    All,
}

impl ArchiveScope {
    /// The `WHERE` fragment. Written once so no query can invent a third
    /// meaning for "archived".
    pub(crate) fn sql(self) -> &'static str {
        match self {
            ArchiveScope::Active => "archived_at IS NULL",
            ArchiveScope::Archived => "archived_at IS NOT NULL",
            ArchiveScope::All => "1 = 1",
        }
    }
}

/// Who put a row in the library (§12.1). `Seed` rows are the shipped Demo
/// document, and the only thing the mark buys is that *Restore sample game*
/// can tell a seed row the operator edited from one they never touched —
/// nothing else reads it, and a seed row is an ordinary row everywhere else.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Origin {
    Seed,
    #[default]
    Operator,
}

impl Origin {
    /// The stored spelling, and the wire one.
    pub fn as_str(self) -> &'static str {
        match self {
            Origin::Seed => "seed",
            Origin::Operator => "operator",
        }
    }

    /// A value this build does not know reads as `Operator`: the safe side,
    /// because it means "do not overwrite this row".
    pub(crate) fn parse(value: &str) -> Origin {
        match value {
            "seed" => Origin::Seed,
            _ => Origin::Operator,
        }
    }
}

/// Created / updated / archived, in epoch milliseconds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Stamps {
    pub created_at: u64,
    pub updated_at: u64,
    /// `Some` means archived — soft, restorable, never a delete (§4.1).
    pub archived_at: Option<u64>,
    /// The family of copies this row belongs to, `None` when it was never
    /// copied. Set by the host only; a save never changes it.
    #[serde(default)]
    pub family_id: Option<i64>,
}

impl Stamps {
    pub fn is_archived(&self) -> bool {
        self.archived_at.is_some()
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Team {
    pub id: TeamId,
    pub name: String,
    pub short_code: String,
    /// A design-system token where possible (`var(--ink)`), otherwise a literal.
    pub color: String,
    pub logo_asset_id: Option<AssetId>,
    pub notes: Option<String>,
    #[serde(default)]
    pub origin: Origin,
    #[serde(flatten)]
    pub stamps: Stamps,
    /// Host-owned counters, bumped when a Play that used this team completes.
    pub play_count: u32,
    pub last_play_at: Option<u64>,
}

impl Team {
    pub fn new(
        id: impl Into<TeamId>,
        name: impl Into<String>,
        short_code: impl Into<String>,
    ) -> Self {
        Team {
            id: id.into(),
            name: name.into(),
            short_code: short_code.into(),
            color: "var(--ink)".to_owned(),
            logo_asset_id: None,
            notes: None,
            origin: Origin::Operator,
            stamps: Stamps::default(),
            play_count: 0,
            last_play_at: None,
        }
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        if self.name.trim().is_empty() {
            return Err(CatalogError::invalid(
                format!("team.{}.name", self.id),
                "a team needs a name",
            ));
        }
        Ok(())
    }
}

/// One question's place in one domain. The sort key belongs to the membership,
/// not to the question: a difficulty edit must not reorder a domain (§4.1).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainMember {
    pub question_id: QuestionId,
    pub sort_key: i64,
    /// The domain group it sits in here, if any (P15). Part of the membership,
    /// so a domain save writes exactly what it is sent: every caller that
    /// rebuilds a member carries it.
    #[serde(default)]
    pub group_id: Option<crate::ids::DomainGroupId>,
}

/// An operator-made group of questions inside one domain (P15). Organising
/// only: boards and Plays never read it. It lives where its domain lives.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainGroup {
    pub id: crate::ids::DomainGroupId,
    pub domain_id: DomainId,
    pub name: String,
    pub sort_key: i64,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Domain {
    pub id: DomainId,
    pub name: String,
    /// The part-number style code the Stage card shows, e.g. `TEC_881`.
    pub code: String,
    pub description: Option<String>,
    /// Membership in authored order. A question may sit in many domains.
    pub questions: Vec<DomainMember>,
    /// The domain's groups in order (P15). Read-only on a save: the group
    /// verbs write them.
    #[serde(default)]
    pub groups: Vec<DomainGroup>,
    #[serde(default)]
    pub origin: Origin,
    #[serde(flatten)]
    pub stamps: Stamps,
}

impl Domain {
    pub fn new(id: impl Into<DomainId>, name: impl Into<String>, code: impl Into<String>) -> Self {
        Domain {
            id: id.into(),
            name: name.into(),
            code: code.into(),
            description: None,
            questions: Vec::new(),
            groups: Vec::new(),
            origin: Origin::Operator,
            stamps: Stamps::default(),
        }
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        if self.name.trim().is_empty() {
            return Err(CatalogError::invalid(
                format!("domain.{}.name", self.id),
                "a domain needs a name",
            ));
        }
        let mut seen: Vec<&QuestionId> = Vec::new();
        for member in &self.questions {
            if seen.contains(&&member.question_id) {
                return Err(CatalogError::invalid(
                    format!("domain.{}.questions", self.id),
                    "a question sits in a domain once",
                ));
            }
            seen.push(&member.question_id);
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOption {
    pub id: OptionId,
    pub text: String,
    pub correct: bool,
}

impl QuestionOption {
    pub fn new(id: impl Into<OptionId>, text: impl Into<String>, correct: bool) -> Self {
        QuestionOption {
            id: id.into(),
            text: text.into(),
            correct,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Question {
    pub id: QuestionId,
    pub stem: String,
    pub media_asset_id: Option<AssetId>,
    /// Authored order. Stage reveals them in it (§2.6).
    pub options: Vec<QuestionOption>,
    /// 1–100 (§4.1), or `None` until the author sets one — an incomplete
    /// question (§2.32). Stored as `0` by `store.rs`; `0` was never a legal
    /// difficulty, so the mapping cannot collide.
    #[serde(default)]
    pub difficulty: Option<u8>,
    pub explanation: Option<String>,
    /// The operator's tags (P15): across domains, part of the body. Cleaned on
    /// a save — trimmed, 1–40 characters, one per spelling ignoring case, the
    /// spelling already used in view kept, at most 20.
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub origin: Origin,
    #[serde(flatten)]
    pub stamps: Stamps,
}

impl Question {
    pub fn new(id: impl Into<QuestionId>, stem: impl Into<String>, difficulty: u8) -> Self {
        Question {
            id: id.into(),
            stem: stem.into(),
            media_asset_id: None,
            options: Vec::new(),
            difficulty: Some(difficulty),
            explanation: None,
            tags: Vec::new(),
            origin: Origin::Operator,
            stamps: Stamps::default(),
        }
    }

    pub fn with_options(mut self, options: Vec<QuestionOption>) -> Self {
        self.options = options;
        self
    }

    /// Derived from the correct ticks, never authored (§2.17).
    pub fn answer_mode(&self) -> AnswerMode {
        if self.options.iter().filter(|o| o.correct).count() > 1 {
            AnswerMode::Multiple
        } else {
            AnswerMode::Single
        }
    }

    pub fn correct_option_ids(&self) -> Vec<OptionId> {
        self.options
            .iter()
            .filter(|o| o.correct)
            .map(|o| o.id.clone())
            .collect()
    }

    /// The floor every write keeps (§2.32): a stem **or** an option, option
    /// ids unique, no option without text, and a difficulty inside 1–100 when
    /// one is set. Everything above the floor — two options, a correct mark, a
    /// difficulty at all, a domain — is a *gap* ([`super::complete`]): the
    /// library stores it and a board refuses it.
    pub(crate) fn validate(&self) -> CatalogResult<()> {
        let path = format!("question.{}", self.id);
        if self.stem.trim().is_empty() && self.options.is_empty() {
            return Err(CatalogError::invalid(
                path + ".stem",
                "a question needs a stem or at least one option",
            ));
        }
        let mut seen: Vec<&OptionId> = Vec::new();
        for option in &self.options {
            if seen.contains(&&option.id) {
                return Err(CatalogError::invalid(
                    path + ".options",
                    "two options share an id",
                ));
            }
            seen.push(&option.id);
        }
        if self.options.iter().any(|o| o.text.trim().is_empty()) {
            return Err(CatalogError::invalid(
                path + ".options",
                "an option needs text",
            ));
        }
        if let Some(difficulty) = self.difficulty
            && (difficulty == 0 || difficulty > 100)
        {
            return Err(CatalogError::invalid(
                path + ".difficulty",
                "difficulty is 1-100",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operator {
    pub id: OperatorId,
    pub display_name: String,
    /// Optional and hashed (§2.15). The host never stores a pin in the clear
    /// and never shows this field in metadata or the status bar.
    pub pin_hash: Option<String>,
    pub last_active_at: Option<u64>,
    pub plays_run: u32,
    #[serde(flatten)]
    pub stamps: Stamps,
}

impl Operator {
    pub fn new(id: impl Into<OperatorId>, display_name: impl Into<String>) -> Self {
        Operator {
            id: id.into(),
            display_name: display_name.into(),
            pin_hash: None,
            last_active_at: None,
            plays_run: 0,
            stamps: Stamps::default(),
        }
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        if self.display_name.trim().is_empty() {
            return Err(CatalogError::invalid(
                format!("operator.{}.name", self.id),
                "an operator needs a display name",
            ));
        }
        Ok(())
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Asset {
    pub id: AssetId,
    /// A path under user data. The webview reaches it through
    /// `convertFileSrc`; the host never hands out a raw file URL (§4.1).
    pub path: String,
    /// `image`, `audio`, `video` — the frontend decides how to render it.
    pub kind: String,
    #[serde(flatten)]
    pub stamps: Stamps,
}

impl Asset {
    pub fn new(id: impl Into<AssetId>, path: impl Into<String>, kind: impl Into<String>) -> Self {
        Asset {
            id: id.into(),
            path: path.into(),
            kind: kind.into(),
            stamps: Stamps::default(),
        }
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        if self.path.trim().is_empty() {
            return Err(CatalogError::invalid(
                format!("asset.{}.path", self.id),
                "an asset needs a path",
            ));
        }
        Ok(())
    }
}

// --------------------------------------------------------------------- overlays

/// A per-recipe patch of a team's marks (§2.17). `None` means "not
/// overridden" — the catalog value shows through.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamOverlay {
    pub name: Option<String>,
    pub short_code: Option<String>,
    pub color: Option<String>,
    pub logo_asset_id: Option<AssetId>,
}

#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainOverlay {
    pub name: Option<String>,
    pub code: Option<String>,
}

/// Stem, options, difficulty and the per-question duration — the top of the
/// §2.18 timer cascade lives here and nowhere else, because a duration is a
/// property of *this show's* use of the question, not of the question.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QuestionOverlay {
    pub stem: Option<String>,
    pub options: Option<Vec<QuestionOption>>,
    pub difficulty: Option<u8>,
    pub duration_ms: Option<u32>,
}

impl QuestionOverlay {
    pub fn is_empty(&self) -> bool {
        *self == QuestionOverlay::default()
    }
}

/// Every overlay a recipe carries, by target.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RecipeOverlays {
    pub teams: BTreeMap<TeamId, TeamOverlay>,
    pub domains: BTreeMap<DomainId, DomainOverlay>,
    pub questions: BTreeMap<QuestionId, QuestionOverlay>,
}

/// Which side of `ScopeConfirm` an inline edit landed on (§2.17).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EditScope {
    /// Overlay on the recipe item. The original does not move.
    ThisGame,
    /// Write the catalog row. Other recipes that already have their own
    /// overlay keep it — an overlay is a decision, not a cache.
    Original,
}

// ----------------------------------------------------------------------- recipe

/// One domain on the board, with the questions this show uses from it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BoardDomain {
    pub domain_id: DomainId,
    /// Authored order. The snapshot re-sorts to `difficulty ASC, id ASC`
    /// anyway (§4.3 step 5) — this order is what the Game tab shows.
    pub question_ids: Vec<QuestionId>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Recipe {
    pub id: RecipeId,
    pub name: String,
    pub folder: Option<String>,
    pub tags: Vec<String>,
    /// Roster in play order — this *is* the opening ring (§4.3 step 7).
    pub teams: Vec<TeamId>,
    pub board: Vec<BoardDomain>,
    /// The B5 document. Validated against the §4.2 interlocks on write, so a
    /// recipe row can never be the place an illegal document hides.
    pub settings: GameSettings,
    /// Screens-tab layout overrides. P9 owns the shape; the catalog stores it.
    pub layout: serde_json::Value,
    pub overlays: RecipeOverlays,
    /// Bumped by every `recipe_upsert`. `recipe-changed { id, rev }` carries it
    /// and a Play records the rev it ran (§2.8).
    pub rev: u32,
    #[serde(default)]
    pub origin: Origin,
    #[serde(flatten)]
    pub stamps: Stamps,
}

impl Recipe {
    pub fn new(id: impl Into<RecipeId>, name: impl Into<String>, settings: GameSettings) -> Self {
        Recipe {
            id: id.into(),
            name: name.into(),
            folder: None,
            tags: Vec::new(),
            teams: Vec::new(),
            board: Vec::new(),
            settings,
            layout: serde_json::Value::Object(serde_json::Map::new()),
            overlays: RecipeOverlays::default(),
            rev: 0,
            origin: Origin::Operator,
            stamps: Stamps::default(),
        }
    }

    /// What `catalog_search` finds a show by (§12: Games are a record list too).
    pub(crate) fn search_text(&self) -> String {
        let mut parts = vec![self.name.clone()];
        if let Some(folder) = &self.folder {
            parts.push(folder.clone());
        }
        parts.extend(self.tags.iter().cloned());
        parts.join(" ")
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        let path = format!("recipe.{}", self.id);
        if self.name.trim().is_empty() {
            return Err(CatalogError::invalid(
                path + ".name",
                "a recipe needs a name",
            ));
        }
        crate::flags::validate(&self.settings)?;

        let mut seen_teams: Vec<&TeamId> = Vec::new();
        for team in &self.teams {
            if seen_teams.contains(&team) {
                return Err(CatalogError::invalid(
                    path + ".teams",
                    "a team plays once per recipe",
                ));
            }
            seen_teams.push(team);
        }
        let mut seen_domains: Vec<&DomainId> = Vec::new();
        for domain in &self.board {
            if seen_domains.contains(&&domain.domain_id) {
                return Err(CatalogError::invalid(
                    path + ".board",
                    "a domain sits on the board once",
                ));
            }
            seen_domains.push(&domain.domain_id);
            let mut seen_questions: Vec<&QuestionId> = Vec::new();
            for question in &domain.question_ids {
                if seen_questions.contains(&question) {
                    return Err(CatalogError::invalid(
                        path + ".board",
                        "a question sits in a board domain once",
                    ));
                }
                seen_questions.push(question);
            }
        }
        Ok(())
    }
}

/// A Play as the library remembers it: derived from the event log, rebuilt at
/// boot, and never a place a rule is read from (§5.10).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayRecord {
    pub id: crate::ids::PlayId,
    pub recipe_id: RecipeId,
    /// Who was at the keyboard, from the log's last `OperatorSwitched`. `None`
    /// for a Play logged before the operator was recorded, or run with no
    /// active operator set.
    pub operator_id: Option<crate::ids::OperatorId>,
    /// `PlayStatus` as it serializes in `play-state`.
    pub status: String,
    pub started_at_ms: Option<u64>,
    pub ended_at_ms: Option<u64>,
    pub event_count: u64,
    pub questions_consumed: u32,
    pub scores: BTreeMap<TeamId, u32>,
}

/// One row of a `catalog_list` / `catalog_get`. §13 has one command with a
/// `kind` parameter, so this is its one return type.
///
/// Recipes are deliberately absent: §11.A and §11.B are two families with two
/// verb lists, and a recipe reachable through both `catalog_upsert` and
/// `recipe_upsert` would be two ways to do one thing.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "item")]
pub enum CatalogItem {
    Team(Box<Team>),
    Domain(Box<Domain>),
    Question(Box<Question>),
    Operator(Box<Operator>),
    Asset(Box<Asset>),
}

impl CatalogItem {
    pub fn kind(&self) -> super::error::CatalogKind {
        use super::error::CatalogKind as K;
        match self {
            CatalogItem::Team(_) => K::Team,
            CatalogItem::Domain(_) => K::Domain,
            CatalogItem::Question(_) => K::Question,
            CatalogItem::Operator(_) => K::Operator,
            CatalogItem::Asset(_) => K::Asset,
        }
    }

    pub fn id(&self) -> String {
        match self {
            CatalogItem::Team(t) => t.id.to_string(),
            CatalogItem::Domain(d) => d.id.to_string(),
            CatalogItem::Question(q) => q.id.to_string(),
            CatalogItem::Operator(o) => o.id.to_string(),
            CatalogItem::Asset(a) => a.id.to_string(),
        }
    }

    pub fn as_team(&self) -> Option<&Team> {
        match self {
            CatalogItem::Team(team) => Some(team),
            _ => None,
        }
    }

    pub fn as_domain(&self) -> Option<&Domain> {
        match self {
            CatalogItem::Domain(domain) => Some(domain),
            _ => None,
        }
    }

    pub fn as_question(&self) -> Option<&Question> {
        match self {
            CatalogItem::Question(question) => Some(question),
            _ => None,
        }
    }

    pub fn as_operator(&self) -> Option<&Operator> {
        match self {
            CatalogItem::Operator(operator) => Some(operator),
            _ => None,
        }
    }

    pub fn as_asset(&self) -> Option<&Asset> {
        match self {
            CatalogItem::Asset(asset) => Some(asset),
            _ => None,
        }
    }

    /// Everything `catalog_search` should be able to find this row by. One
    /// place, so a field added to an entity is one edit away from being
    /// searchable rather than two.
    pub(crate) fn search_text(&self) -> String {
        let parts: Vec<&str> = match self {
            CatalogItem::Team(team) => vec![
                &team.name,
                &team.short_code,
                team.notes.as_deref().unwrap_or(""),
            ],
            CatalogItem::Domain(domain) => vec![
                &domain.name,
                &domain.code,
                domain.description.as_deref().unwrap_or(""),
            ],
            CatalogItem::Question(question) => {
                let mut parts = vec![
                    question.stem.as_str(),
                    question.explanation.as_deref().unwrap_or(""),
                ];
                parts.extend(question.options.iter().map(|o| o.text.as_str()));
                parts.extend(question.tags.iter().map(String::as_str));
                return parts.join(" ");
            }
            CatalogItem::Operator(operator) => vec![&operator.display_name],
            CatalogItem::Asset(asset) => vec![&asset.path, &asset.kind],
        };
        parts.join(" ")
    }

    /// The row's stamps, whatever its kind.
    pub fn stamps(&self) -> &Stamps {
        match self {
            CatalogItem::Team(team) => &team.stamps,
            CatalogItem::Domain(domain) => &domain.stamps,
            CatalogItem::Question(question) => &question.stamps,
            CatalogItem::Operator(operator) => &operator.stamps,
            CatalogItem::Asset(asset) => &asset.stamps,
        }
    }

    pub(crate) fn is_archived(&self) -> bool {
        match self {
            CatalogItem::Team(team) => team.stamps.is_archived(),
            CatalogItem::Domain(domain) => domain.stamps.is_archived(),
            CatalogItem::Question(question) => question.stamps.is_archived(),
            CatalogItem::Operator(operator) => operator.stamps.is_archived(),
            CatalogItem::Asset(asset) => asset.stamps.is_archived(),
        }
    }

    pub(crate) fn validate(&self) -> CatalogResult<()> {
        match self {
            CatalogItem::Team(team) => team.validate(),
            CatalogItem::Domain(domain) => domain.validate(),
            CatalogItem::Question(question) => question.validate(),
            CatalogItem::Operator(operator) => operator.validate(),
            CatalogItem::Asset(asset) => asset.validate(),
        }
    }
}

impl From<Team> for CatalogItem {
    fn from(team: Team) -> Self {
        CatalogItem::Team(Box::new(team))
    }
}
impl From<Domain> for CatalogItem {
    fn from(domain: Domain) -> Self {
        CatalogItem::Domain(Box::new(domain))
    }
}
impl From<Question> for CatalogItem {
    fn from(question: Question) -> Self {
        CatalogItem::Question(Box::new(question))
    }
}
impl From<Operator> for CatalogItem {
    fn from(operator: Operator) -> Self {
        CatalogItem::Operator(Box::new(operator))
    }
}
impl From<Asset> for CatalogItem {
    fn from(asset: Asset) -> Self {
        CatalogItem::Asset(Box::new(asset))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn question() -> Question {
        Question::new("q-1", "Which one?", 40).with_options(vec![
            QuestionOption::new("opt-a", "A", true),
            QuestionOption::new("opt-b", "B", false),
        ])
    }

    #[test]
    fn answer_mode_follows_the_correct_ticks() {
        let mut q = question();
        assert_eq!(q.answer_mode(), AnswerMode::Single);
        q.options[1].correct = true;
        assert_eq!(q.answer_mode(), AnswerMode::Multiple);
    }

    #[test]
    fn the_floor_is_a_stem_or_an_option() {
        let mut q = question();
        q.options.clear();
        assert!(q.validate().is_ok(), "a stem alone is incomplete, not refused");
        q.stem = "   ".to_owned();
        assert!(q.validate().is_err(), "nothing at all is refused");

        let mut q = question();
        q.stem.clear();
        assert!(q.validate().is_ok(), "options alone are accepted too");
    }

    #[test]
    fn an_incomplete_question_is_not_a_refusal() {
        let mut q = question();
        q.options[0].correct = false;
        q.options.pop();
        q.difficulty = None;
        assert!(q.validate().is_ok());
    }

    #[test]
    fn the_floor_still_refuses_what_no_edit_can_mean() {
        let mut q = question();
        q.options[1].text = " ".to_owned();
        assert!(q.validate().is_err(), "an option with no text");

        let mut q = question();
        q.options[1].id = q.options[0].id.clone();
        assert!(q.validate().is_err(), "two options with one id");

        let mut q = question();
        q.difficulty = Some(0);
        assert!(q.validate().is_err());
        q.difficulty = Some(101);
        assert!(q.validate().is_err());
        q.difficulty = Some(100);
        assert!(q.validate().is_ok());
    }
}
