//! The Stage half of `play-state`.
//!
//! `PlayStateForStage` (in `packages/contract`) is two things bolted together:
//! the **game** — teams, ring, domains, session, clock — which `MatchService`
//! owns, and the **presentation** — `currentScreen`, `overlay`, `revealModes`,
//! `decor` — which `PresentationService` owns. [`project`] emits the first
//! half; [`PresentationService::play_state`] merges the second and the app
//! crate calls `emitTo("stage", …)` with the result.
//!
//! Both halves are declared here, and `tests/stage_contract.rs` checks the
//! whole emission against the P1 fixtures: a field that drifts from the
//! TypeScript contract fails a Rust test instead of blanking Stage.
//! `contract_version` is mirrored the same way.
//!
//! [`PresentationService::play_state`]: crate::presentation::PresentationService::play_state
//!
//! Everything is derived and read-only. Stage is a projection, not a
//! controller (§5.7): nothing on this path can write a Play.

use serde::{Deserialize, Serialize};

use crate::flags::AudioSettings;
use crate::ids::{DomainId, OptionId, QuestionId, TeamId};
use crate::play::{Play, PlayStatus};
use crate::rules::Verdict;
use crate::session::Session;
use crate::settings::{Language, RevealSettings};
use crate::snapshot::AnswerMode;

/// Must equal `CONTRACT_VERSION` in `packages/contract/src/play-state.ts`.
/// A mismatch is a notice, not a blank screen — see the P1 exit criteria.
pub const CONTRACT_VERSION: u32 = 8;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTeam {
    pub id: TeamId,
    pub name: String,
    pub short_code: String,
    pub color: String,
    pub logo_url: Option<String>,
    pub detail: Option<String>,
    pub score: u32,
    /// Competition rank, ties sharing a rank: 1, 1, 3 (§4.4).
    pub rank: u32,
    pub turns_taken: u32,
    pub active: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageRing {
    pub order: Vec<TeamId>,
    pub current_team_id: Option<TeamId>,
    pub round_index: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageDomain {
    pub id: DomainId,
    pub name: String,
    pub code: String,
    pub remaining: usize,
    pub exhausted: bool,
    /// The difficulty of the next question this domain would issue — what the
    /// card shows in place of a serial number.
    pub next_difficulty: Option<u8>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOption {
    pub id: OptionId,
    pub text: String,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOutcome {
    pub verdict: Verdict,
    pub points_awarded: u32,
    pub correct_option_ids: Vec<OptionId>,
    pub bonus_awarded: Option<u32>,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageTimer {
    pub duration_ms: u32,
    /// Host-authoritative, emitted every 100ms. Stage may interpolate between
    /// ticks but must never run past zero on its own.
    pub remaining_ms: u32,
    pub running: bool,
    pub remaining_ms_at_lock: Option<u32>,
    pub expired_open: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageReveals {
    pub stem: bool,
    pub option_ids: Vec<OptionId>,
    pub outcome: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageSession {
    pub question_id: QuestionId,
    pub domain_id: DomainId,
    pub stem: String,
    pub options: Vec<StageOption>,
    pub answer_mode: AnswerMode,
    pub difficulty: u8,
    pub selected_option_ids: Vec<OptionId>,
    pub locked_option_ids: Option<Vec<OptionId>>,
    pub outcome: Option<StageOutcome>,
    pub timer: Option<StageTimer>,
    pub reveals: StageReveals,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StagePlayClock {
    pub elapsed_ms: u64,
    pub running: bool,
}

/// The game half of `PlayStateForStage`. The presentation half — `decor`,
/// `currentScreen`, `overlay`, `revealModes` — is merged by
/// `PresentationService`, which is the only thing that owns it.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageGameState {
    pub contract_version: u32,
    pub play_id: String,
    pub status: PlayStatus,
    pub teams: Vec<StageTeam>,
    pub ring: StageRing,
    pub domains: Vec<StageDomain>,
    pub session: Option<StageSession>,
    pub clock: StagePlayClock,
    pub leaderboard_revealed_ranks: Vec<u32>,
    /// Questions issued so far this Play, the current one included.
    pub questions_issued: u32,
}

/// The game half with **no Play behind it** — what Stage draws between shows.
///
/// It exists because "no Play" has to reach Stage as a state like any other.
/// Unloading a recipe leaves the host with nothing to project, and a webview
/// that is simply not sent anything goes on drawing the Play that ended; the
/// screen would still be showing a finished question while Control has moved
/// on. Mirrors `EMPTY_PLAY_STATE` in `packages/contract`, which is what Stage
/// draws before the first emission — the same picture, from the other side.
pub fn empty_game() -> StageGameState {
    StageGameState {
        contract_version: CONTRACT_VERSION,
        play_id: String::new(),
        status: PlayStatus::Loaded,
        teams: Vec::new(),
        ring: StageRing {
            order: Vec::new(),
            current_team_id: None,
            round_index: 1,
        },
        domains: Vec::new(),
        session: None,
        clock: StagePlayClock {
            elapsed_ms: 0,
            running: false,
        },
        leaderboard_revealed_ranks: Vec::new(),
        questions_issued: 0,
    }
}

/// The two numbers a 100 ms tick can move, read without projecting anything.
///
/// `project` clones every team's name, short code, colour, logo and detail,
/// every domain's name and code, the ring order and the revealed ranks — a few
/// dozen allocations, and the show loop was doing it three times a tick to
/// discover that a countdown had gone down by 100 ms. This is four reads and
/// a borrowed id (P11.9).
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayTick<'a> {
    pub play_id: &'a str,
    /// `session.timer.remainingMs`, or null at operator pace / no session.
    pub remaining_ms: Option<u32>,
    pub elapsed_ms: u64,
    pub running: bool,
}

/// The clock of a Play as of `now_ms`, for `play-tick`.
pub fn tick(play: &Play, now_ms: u64) -> PlayTick<'_> {
    PlayTick {
        play_id: play.id().as_str(),
        remaining_ms: play
            .session()
            .and_then(|s| s.timer.as_ref())
            .map(|t| t.remaining_at(now_ms)),
        elapsed_ms: play.clock().elapsed_at(now_ms),
        running: play.clock().running(),
    }
}

/// Project a Play as of `now_ms`. Read-only, but **not cheap**: prefer
/// [`tick`] when only the clock can have moved (see `MatchService::tick_due`).
pub fn project(play: &Play, now_ms: u64) -> StageGameState {
    let snapshot = play.snapshot();
    let ranks = play.ranks();

    let teams = snapshot
        .teams
        .iter()
        .zip(ranks)
        .map(|(team, rank)| StageTeam {
            id: team.id.clone(),
            name: team.name.clone(),
            short_code: team.short_code.clone(),
            color: team.color.clone(),
            logo_url: team.logo_url.clone(),
            detail: team.detail.clone(),
            score: play.score(&team.id),
            rank,
            turns_taken: play.ring().turns(&team.id),
            active: play.ring().is_active(&team.id),
        })
        .collect();

    let domains = snapshot
        .domains
        .iter()
        .map(|domain| {
            let next = play.next_question(&domain.id);
            StageDomain {
                id: domain.id.clone(),
                name: domain.name.clone(),
                code: domain.code.clone(),
                remaining: play.remaining_in(&domain.id),
                exhausted: next.is_none(),
                next_difficulty: next.map(|q| q.difficulty),
            }
        })
        .collect();

    StageGameState {
        contract_version: CONTRACT_VERSION,
        play_id: play.id().to_string(),
        status: play.status(),
        teams,
        ring: StageRing {
            order: play.ring().order().to_vec(),
            current_team_id: play.ring().current().cloned(),
            round_index: play.ring().round_index(),
        },
        domains,
        session: play.session().map(|s| project_session(s, now_ms)),
        clock: StagePlayClock {
            elapsed_ms: play.clock().elapsed_at(now_ms),
            running: play.clock().running(),
        },
        leaderboard_revealed_ranks: play.leaderboard_revealed_ranks().to_vec(),
        questions_issued: play.questions_issued(),
    }
}

fn project_session(session: &Session, now_ms: u64) -> StageSession {
    StageSession {
        question_id: session.question.id.clone(),
        domain_id: session.domain_id.clone(),
        stem: session.question.stem.clone(),
        options: session
            .question
            .options
            .iter()
            .map(|o| StageOption {
                id: o.id.clone(),
                text: o.text.clone(),
            })
            .collect(),
        answer_mode: session.question.answer_mode(),
        difficulty: session.question.difficulty,
        selected_option_ids: session.selected.clone(),
        locked_option_ids: session.locked.clone(),
        outcome: session.outcome.as_ref().map(|o| StageOutcome {
            verdict: o.verdict,
            points_awarded: o.points_awarded,
            correct_option_ids: o.correct_option_ids.clone(),
            bonus_awarded: o.bonus_awarded,
        }),
        timer: session.timer.as_ref().map(|t| StageTimer {
            duration_ms: t.duration_ms(),
            remaining_ms: t.remaining_at(now_ms),
            running: t.running(),
            remaining_ms_at_lock: t.remaining_ms_at_lock(),
            expired_open: t.expired_open(),
        }),
        reveals: StageReveals {
            stem: session.reveals.stem,
            option_ids: session.reveals.option_ids.clone(),
            outcome: session.reveals.outcome,
        },
    }
}

// ------------------------------------------------------- the presentation half

/// One Stage layout. Mirrors `SCREENS` in `packages/contract/src/screens.ts`;
/// adding a screen is one variant here and one entry there.
///
/// The operator may jump anywhere, so there is no ordering and no legal
/// successor — only [`Self::available_before_play`], which keeps everything but
/// Idle off the wall until a Play has started.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum StageScreen {
    #[default]
    Idle,
    TeamOrder,
    ChooseDomain,
    Question,
    Scoreboard,
    FinalLeaderboard,
    CurrentTeam,
}

impl StageScreen {
    pub const ALL: [StageScreen; 7] = [
        StageScreen::Idle,
        StageScreen::TeamOrder,
        StageScreen::ChooseDomain,
        StageScreen::Question,
        StageScreen::Scoreboard,
        StageScreen::FinalLeaderboard,
        StageScreen::CurrentTeam,
    ];

    /// The contract's key, and the `AnimKey` fragment.
    pub fn key(self) -> &'static str {
        match self {
            StageScreen::Idle => "idle",
            StageScreen::TeamOrder => "teamOrder",
            StageScreen::ChooseDomain => "chooseDomain",
            StageScreen::Question => "question",
            StageScreen::Scoreboard => "scoreboard",
            StageScreen::FinalLeaderboard => "finalLeaderboard",
            StageScreen::CurrentTeam => "currentTeam",
        }
    }

    /// Whether the operator may show it before `play_start`. Everything but
    /// Idle would render an empty roster, an empty board, or a leaderboard of
    /// zeroes — on camera.
    pub fn available_before_play(self) -> bool {
        matches!(self, StageScreen::Idle)
    }

    /// Whether the screen reads the question session. A screen that does not
    /// must render correctly with `session: null` — asserted on the TypeScript
    /// side, mirrored here so the two lists cannot drift apart unnoticed.
    pub fn uses_session(self) -> bool {
        matches!(self, StageScreen::Question)
    }
}

/// An overlay animation: drawn *over* the screen that is up, never remounting
/// it and never resetting reveal, select or lock (§2.6).
///
/// Every kind is enqueued automatically when its cause occurs **and** may be
/// called by hand with `show_overlay` over any screen (§5.6). Stage cannot tell
/// the two apart, which is the point: one component, one timeline, one path.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(
    tag = "kind",
    rename_all = "kebab-case",
    rename_all_fields = "camelCase"
)]
pub enum OverlayRequest {
    /// The token passes. `from_team_id` is `None` for the first token of a Play.
    TokenHandoff {
        from_team_id: Option<TeamId>,
        to_team_id: TeamId,
    },
    RoundAdvance {
        round_index: u32,
    },
    MultipleAnswers {
        option_ids: Vec<OptionId>,
    },
    /// Half-screen and transparent: the question stays visible behind it.
    Outcome {
        verdict: Verdict,
    },
    CurrentTeam {
        team_id: Option<TeamId>,
    },
}

impl OverlayRequest {
    /// The `overlay:<kind>` fragment of the contract's `AnimKey`.
    pub fn kind(&self) -> &'static str {
        match self {
            OverlayRequest::TokenHandoff { .. } => "token-handoff",
            OverlayRequest::RoundAdvance { .. } => "round-advance",
            OverlayRequest::MultipleAnswers { .. } => "multiple-answers",
            OverlayRequest::Outcome { .. } => "outcome",
            OverlayRequest::CurrentTeam { .. } => "current-team",
        }
    }

    /// The key Stage reports with `anim-complete` when this overlay finishes.
    pub fn anim_key(&self) -> String {
        format!("overlay:{}", self.kind())
    }
}

/// The overlay queue as Stage reads it: one running, at most one waiting
/// (§2.6).
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StageOverlay {
    pub busy: bool,
    pub active: Option<OverlayRequest>,
    pub pending: Option<OverlayRequest>,
    /// `overlay_animations.enabled`. False skips the queue entirely; the token
    /// still moves (§5.6).
    pub enabled: bool,
    /// **Which occurrence is running**, counted from the start of the process.
    ///
    /// Two identical requests are two occurrences, and the queue advances on an
    /// ack (§2.6) — so when the operator calls the same overlay twice, the
    /// promotion puts back a value equal to the one that just finished. Without
    /// this counter Stage cannot tell that from "still the same run", plays
    /// nothing, acks nothing, and the queue stops for the rest of the Play.
    /// `0` is "nothing has ever run".
    pub run_id: u64,
}

/// How the decorative bodies move. Never static, never game truth — see
/// `StageDecorSettings` in `packages/contract`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum DecorMotionMode {
    #[default]
    Collide,
    CollideAttract,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecorAnchorSettings {
    pub enabled: bool,
    pub attract_seconds: f64,
    pub repel_seconds: f64,
    pub strength: f64,
}

/// The half of `recipe.layout` that rides `play-state` (P9): per-node styles
/// and per-screen decor boxes. Stored and emitted as JSON objects; a recipe
/// with no overrides carries two empty objects.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StageLayoutNodes {
    pub nodes: serde_json::Value,
    pub screens: serde_json::Value,
    /// The operator's per-language text overrides (P11.16). Opaque here
    /// like the rest; `packages/contract` validates it and Stage merges it.
    pub text: serde_json::Value,
}

impl Default for StageLayoutNodes {
    fn default() -> Self {
        StageLayoutNodes {
            nodes: serde_json::Value::Object(serde_json::Map::new()),
            screens: serde_json::Value::Object(serde_json::Map::new()),
            text: serde_json::Value::Object(serde_json::Map::new()),
        }
    }
}

impl StageLayoutNodes {
    /// Read `nodes` and `screens` off a recipe's layout document; anything
    /// missing or not an object is an empty object.
    pub fn of(layout: &serde_json::Value) -> Self {
        let object = |key: &str| match layout.get(key) {
            Some(v) if v.is_object() => v.clone(),
            _ => serde_json::Value::Object(serde_json::Map::new()),
        };
        StageLayoutNodes {
            nodes: object("nodes"),
            screens: object("screens"),
            text: object("text"),
        }
    }
}

/// A per-recipe **layout** setting (Screens tab, `recipe_set_layout`), so it
/// may differ between recipes and change mid-Play: it affects nothing scored.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StageDecorSettings {
    pub mode: DecorMotionMode,
    pub anchor: DecorAnchorSettings,
    pub drift: f64,
    pub attraction: f64,
    pub bounce: f64,
    pub spin: f64,
    pub max_speed: f64,
}

impl Default for StageDecorSettings {
    /// `DEFAULT_DECOR_SETTINGS` in `packages/contract/src/play-state.ts`, value
    /// for value. Mild by design: breathing, not a screensaver.
    fn default() -> Self {
        StageDecorSettings {
            mode: DecorMotionMode::Collide,
            anchor: DecorAnchorSettings {
                enabled: true,
                attract_seconds: 12.0,
                repel_seconds: 6.0,
                strength: 0.3,
            },
            drift: 14.0,
            attraction: 0.3,
            bounce: 0.9,
            spin: 4.0,
            max_speed: 40.0,
        }
    }
}

/// The whole emission: the game half, flattened, plus the presentation half.
///
/// `#[serde(flatten)]` is what keeps the two halves from being two nested
/// objects on the wire — the contract is one flat record, and
/// `tests/stage_contract.rs` holds it to that.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlayStateForStage {
    #[serde(flatten)]
    pub game: StageGameState,
    pub decor: StageDecorSettings,
    /// The recipe's Screens-tab overrides (P9), passed through from
    /// `recipe.layout`: `{ nodes, screens }`. Opaque here on purpose — the
    /// contract package owns and validates the shape.
    pub layout: StageLayoutNodes,
    pub current_screen: StageScreen,
    pub overlay: StageOverlay,
    /// Live, from `FlagService::reveal_modes` — never a second store. Stage
    /// needs them because `auto` makes Stage drive the next beat itself once
    /// `anim-complete` fires.
    pub reveal_modes: RevealSettings,
    /// Live cue volume, mute and cue map, from `FlagService::audio` (§12.5).
    /// Control-behaviour, so Stage hears a mute on the next emission.
    pub audio: AudioSettings,
    /// Which authored-copy table Stage reads (`en` | `ro`), from
    /// `FlagService::language`. Presentation only: nothing derived from the
    /// Play is translated.
    pub language: Language,
}
