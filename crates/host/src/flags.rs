//! `FlagService` — the settings document, and the only flag reader (§2.16).
//!
//! Three kinds of flag live behind one interface:
//!
//! ```text
//! feature root   feat.<name>       a whole subgraph; default on; off ⇒ feature_off
//! policy key     timer.enabled …   the §4.2 settings document
//! runtime flag   session.locked …  derived from the Play, never stored here
//! ```
//!
//! The reason they share a module is the §4.2 sentence "changing one key must
//! leave a legal document". Every write here lands on a *clone*, the clone is
//! validated whole, and only a legal document is committed — so a refused
//! write changes nothing, the same discipline `MatchService` keeps for
//! commands. The interlocks are therefore enforced by the host, not by a
//! disabled input; [`FlagService::disabled`] exists so the UI can grey the
//! illegal sibling first, but it is advice, not the rule.
//!
//! Two things this module deliberately does **not** do:
//!
//! - It never stores `play.status`, `session.locked` or `overlay.busy`. Those
//!   arrive as a [`RuntimeContext`] built from `MatchService` at the call site.
//!   A second copy of the Play's status is exactly the drift §2.16 forbids.
//! - It never writes a Play. [`FlagService::freeze`] *produces* the
//!   [`FrozenSettings`] a `PlaySnapshot` carries (§4.3 step 3); `MatchService`
//!   is still the only writer.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::error::{MatchError, MatchResult};
use crate::ids::OperatorId;
use crate::monitor::StageReattach;
use crate::play::PlayStatus;
use crate::service::MatchService;
use crate::settings::{
    ConsecutiveBonus, DifficultyMap, FrozenSettings, JudgingSettings, Language, LiveSettings, LockSpeedBase,
    OverrideAfterLock, RevealChannel, RevealMode, RevealSettings, ScoringMode, ScoringSettings,
    SpeedWindow, TimerCascade, TimerLevel, TurnSettings,
};

// ---------------------------------------------------------------- feature roots

/// A `feat.*` root — a whole subgraph, on by default (§2.16).
///
/// The set is closed on purpose: a root that no command consults is not a
/// feature flag, it is a dead string. Each one here has a family in §11 behind
/// it, and `AudioSynth` is the one v1 ships **off** (§2.25).
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum FeatureRoot {
    /// §2.25 — cue playback. Off silences every cue key at once.
    Audio,
    /// §2.25 — generated tones filling a cue with no file. Off in v1.
    AudioSynth,
    /// §2.13 — `catalog_search` and its index.
    Search,
    /// §11.K — the Statistics tab and its optional window.
    Statistics,
}

impl FeatureRoot {
    pub const ALL: [FeatureRoot; 4] = [
        FeatureRoot::Audio,
        FeatureRoot::AudioSynth,
        FeatureRoot::Search,
        FeatureRoot::Statistics,
    ];

    pub fn key(self) -> &'static str {
        match self {
            FeatureRoot::Audio => "feat.audio",
            FeatureRoot::AudioSynth => "feat.audio.synth",
            FeatureRoot::Search => "feat.search",
            FeatureRoot::Statistics => "feat.statistics",
        }
    }

    /// The root this one hangs off. "Whole subgraph" is a graph, so a child is
    /// off whenever its parent is, whatever the child's own switch says.
    pub fn parent(self) -> Option<FeatureRoot> {
        match self {
            FeatureRoot::AudioSynth => Some(FeatureRoot::Audio),
            _ => None,
        }
    }

    pub fn from_key(key: &str) -> Option<FeatureRoot> {
        FeatureRoot::ALL.into_iter().find(|r| r.key() == key)
    }
}

/// The switches themselves. Default on, except the one §2.25 names as off.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct FeatureRoots {
    pub audio: bool,
    pub audio_synth: bool,
    pub search: bool,
    pub statistics: bool,
}

impl Default for FeatureRoots {
    fn default() -> Self {
        FeatureRoots {
            audio: true,
            audio_synth: false,
            search: true,
            statistics: true,
        }
    }
}

impl FeatureRoots {
    /// The switch as authored, ignoring the parent chain. Settings shows this;
    /// commands ask [`FlagService::feature`] instead.
    pub fn switch(&self, root: FeatureRoot) -> bool {
        match root {
            FeatureRoot::Audio => self.audio,
            FeatureRoot::AudioSynth => self.audio_synth,
            FeatureRoot::Search => self.search,
            FeatureRoot::Statistics => self.statistics,
        }
    }

    fn set(&mut self, root: FeatureRoot, on: bool) {
        match root {
            FeatureRoot::Audio => self.audio = on,
            FeatureRoot::AudioSynth => self.audio_synth = on,
            FeatureRoot::Search => self.search = on,
            FeatureRoot::Statistics => self.statistics = on,
        }
    }

    /// The resolved value: off if this switch is off, or any ancestor's is.
    pub fn resolved(&self, root: FeatureRoot) -> bool {
        let mut node = Some(root);
        while let Some(current) = node {
            if !self.switch(current) {
                return false;
            }
            node = current.parent();
        }
        true
    }
}

// ------------------------------------------------------------------- shortcuts

/// A keyboard chord, normalized so `Ctrl+Shift+L` and `shift+control+l` are
/// the same binding and therefore conflict (§2.20 tab 3).
///
/// Normalization is modifiers in a fixed order, then the key, all lowercase.
/// `TanStack Hotkeys` is a `main`-only concern; what the host owns is which
/// command a chord belongs to, and that two commands never share one.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(transparent)]
pub struct Chord(String);

impl Chord {
    /// `None` when the chord has no key, or a modifier it does not recognise —
    /// the conflict table cannot hold a binding it cannot compare.
    pub fn parse(raw: &str) -> Option<Chord> {
        let mut modifiers: Vec<&'static str> = Vec::new();
        let mut key: Option<String> = None;
        for part in raw.split('+') {
            let part = part.trim().to_ascii_lowercase();
            if part.is_empty() {
                return None;
            }
            let modifier = match part.as_str() {
                "ctrl" | "control" => Some("ctrl"),
                "shift" => Some("shift"),
                "alt" | "option" => Some("alt"),
                "meta" | "cmd" | "command" | "win" => Some("meta"),
                _ => None,
            };
            match modifier {
                Some(m) => {
                    if !modifiers.contains(&m) {
                        modifiers.push(m);
                    }
                }
                // Two literal keys in one chord is not a chord.
                None if key.is_some() => return None,
                None => key = Some(part),
            }
        }
        let key = key?;
        // Fixed order, so the binding is a value and not a spelling.
        let order = ["ctrl", "alt", "shift", "meta"];
        let mut parts: Vec<&str> = order
            .into_iter()
            .filter(|m| modifiers.contains(m))
            .collect();
        parts.push(&key);
        Some(Chord(parts.join("+")))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Command name → chord. Command names are the §13 list; the host does not
/// police them (P6 owns the contract), it only keeps the map one-to-one.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(transparent)]
pub struct ShortcutMap(BTreeMap<String, Chord>);

impl ShortcutMap {
    pub fn get(&self, command: &str) -> Option<&Chord> {
        self.0.get(command)
    }

    pub fn command_for(&self, chord: &Chord) -> Option<&str> {
        self.0
            .iter()
            .find(|(_, bound)| *bound == chord)
            .map(|(command, _)| command.as_str())
    }

    pub fn iter(&self) -> impl Iterator<Item = (&str, &Chord)> {
        self.0.iter().map(|(k, v)| (k.as_str(), v))
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }
}


// ----------------------------------------------------------------------- audio

/// The eight cue keys of §2.25. The audio seam's interface is the key, never a
/// file: what a key plays is a Settings choice that travels to Stage inside
/// `play-state.audio`, and nothing above the Stage adapter names a file.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CueKey {
    Lock,
    Correct,
    Wrong,
    OverlayStart,
    PlayStart,
    TimerStart,
    TimerPause,
    /// The countdown reached zero with no reveal yet.
    TimerExpired,
}

impl CueKey {
    pub const ALL: [CueKey; 8] = [
        CueKey::Lock,
        CueKey::Correct,
        CueKey::Wrong,
        CueKey::OverlayStart,
        CueKey::PlayStart,
        CueKey::TimerStart,
        CueKey::TimerPause,
        CueKey::TimerExpired,
    ];

    pub fn as_str(self) -> &'static str {
        match self {
            CueKey::Lock => "lock",
            CueKey::Correct => "correct",
            CueKey::Wrong => "wrong",
            CueKey::OverlayStart => "overlay_start",
            CueKey::PlayStart => "play_start",
            CueKey::TimerStart => "timer_start",
            CueKey::TimerPause => "timer_pause",
            CueKey::TimerExpired => "timer_expired",
        }
    }

    /// The shipped pack's file for this key. The name is the contract: a real
    /// pack overwrites the placeholder file for file and nothing else changes.
    pub fn default_file(self) -> String {
        format!("{}.wav", self.as_str())
    }
}

/// Control-behaviour audio (§2.5, §2.25): live for the whole Play, so a mute
/// lands on Stage on the next emission. `cues` carries **every** key; `None`
/// is a key the operator muted. Serialized as-is into `play-state.audio`.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AudioSettings {
    /// 0–100.
    pub volume: u8,
    pub muted: bool,
    pub cues: BTreeMap<CueKey, Option<String>>,
}

impl Default for AudioSettings {
    fn default() -> Self {
        AudioSettings {
            volume: 80,
            muted: false,
            cues: CueKey::ALL
                .into_iter()
                .map(|k| (k, Some(k.default_file())))
                .collect(),
        }
    }
}

impl AudioSettings {
    /// A volume over 100 is not a louder Stage, and a missing key would leave
    /// Stage guessing what to play — both are refused rather than clamped.
    pub fn validate(&self) -> MatchResult<()> {
        if self.volume > 100 {
            return Err(MatchError::IllegalSettings {
                key: "audio.volume",
                reason: "volume is 0-100",
            });
        }
        if CueKey::ALL.iter().any(|k| !self.cues.contains_key(k)) {
            return Err(MatchError::IllegalSettings {
                key: "audio.cues",
                reason: "every cue key needs an entry (a muted key is null)",
            });
        }
        Ok(())
    }
}

// ------------------------------------------------------------------- documents

/// How dense the Control mosaic packs its panels (§4.2 `control.mosaic_density`).
/// Presentation only — nothing here reaches a Play.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MosaicDensity {
    Compact,
    #[default]
    Comfortable,
    Spacious,
}

impl MosaicDensity {
    pub fn as_str(self) -> &'static str {
        match self {
            MosaicDensity::Compact => "compact",
            MosaicDensity::Comfortable => "comfortable",
            MosaicDensity::Spacious => "spacious",
        }
    }
}

/// The recipe's B5 document — every key §4.2 marks *Game*, plus the reveal
/// defaults, which are a Game default that Control may then change live.
///
/// All of it except `reveal` freezes at `play_start` (§2.5).
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct GameSettings {
    pub scoring: ScoringSettings,
    pub judging: JudgingSettings,
    pub turn: TurnSettings,
    /// The recipe level of the §2.18 cascade. Unset inherits the globals.
    pub timer: TimerLevel,
    pub reveal: RevealSettings,
    /// Which of Stage's authored copy tables the audience reads. Like
    /// `reveal`, a Game default that stays live (§2.5 freezes nothing it
    /// cannot score with). `#[serde(default)]`: a recipe row written before
    /// the key existed is English.
    #[serde(default)]
    pub language: Language,
}

/// Control-behaviour keys: live for the whole Play (§2.5), so none of them is
/// in [`FrozenSettings`] and none of them can move a score.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct ControlSettings {
    pub override_after_lock: OverrideAfterLock,
    pub reveal: RevealSettings,
    pub overlay_animations_enabled: bool,
    pub viewer_hit_targets: bool,
    pub mosaic_density: MosaicDensity,
    /// OS monitor keys. The connected *list* is runtime data the app crate
    /// hands to [`crate::monitor::StageDisplay`]; what lives here is the
    /// operator's pick, and it is the host's whole memory of where Stage
    /// belongs. `None` means Stage stays on primary — the host never picks a
    /// display for the operator (§9, decided 2026-09-05).
    pub stage_monitor_id: Option<String>,
    /// The displays that **mirror** the pacer, by OS monitor key (§9, P11.11).
    ///
    /// Beside `stage_monitor_id`, not instead of it: that field keeps meaning
    /// "where the pacer goes", so a settings document written by an older
    /// build reads back with no mirrors and behaves exactly as it did. Empty
    /// is the default and the whole of today's behaviour.
    #[serde(default)]
    pub stage_mirror_ids: Vec<String>,
    /// Where the Statistics window opens **when the operator asks for it**
    /// (§11.K, P11). Remembering a display is not the same as showing one:
    /// nothing in the host opens this window, and a display coming back does
    /// not either — `stats_window` is the only door (revised 2026-09-07).
    pub stats_monitor_id: Option<String>,
    /// Fullscreen the Statistics window, or leave it a normal window the
    /// operator can size and move. Fullscreen is right on a wall display and
    /// wrong on the one display a single-monitor setup has.
    #[serde(default = "default_true")]
    pub stats_fullscreen: bool,
    /// What happens when the remembered display reappears **during a Play**.
    /// Outside a Play, Stage always goes back to it.
    pub stage_reattach: StageReattach,
    /// Cue volume, mute and the cue map (§2.25). Live mid-Play.
    #[serde(default)]
    pub audio: AudioSettings,
}

/// serde default for a flag that ships on. An older stored document has no
/// `stats_fullscreen` key, and `false` there would be a silent change.
fn default_true() -> bool {
    true
}

impl ControlSettings {
    /// §4.2 defaults: overlays on, hit targets on, reveals operator-timed.
    pub fn defaults() -> Self {
        ControlSettings {
            overlay_animations_enabled: true,
            viewer_hit_targets: true,
            stats_fullscreen: true,
            ..ControlSettings::default()
        }
    }
}

/// The all-games document (§11.L L1/L2): first run writes it, the Settings tab
/// and Control Global edit it.
///
/// `game_defaults` **seeds** a new recipe and nothing more — §12: "Global award
/// default does not rewrite a recipe that already overrode it." A recipe that
/// exists carries its own copy.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct GlobalSettings {
    /// `globals.timer.*` — the bottom of the §2.18 cascade.
    pub timer: TimerLevel,
    pub game_defaults: GameSettings,
    pub control: ControlSettings,
    pub features: FeatureRoots,
    pub shortcuts: ShortcutMap,
    /// Who is at the keyboard (§2.15). The top bar shows this operator's
    /// name; grid|table and mosaic preferences are kept per operator against
    /// it. `None` until the first operator is created. Pin gating is P10's.
    #[serde(default)]
    pub active_operator_id: Option<OperatorId>,
}

impl Default for GlobalSettings {
    /// The P10 demo defaults: award by difficulty, lock-speed off, timer on at
    /// 30s, cap and bonus off, every reveal operator-timed.
    fn default() -> Self {
        GlobalSettings {
            timer: TimerLevel::new(true, 30_000),
            game_defaults: GameSettings::default(),
            control: ControlSettings::defaults(),
            features: FeatureRoots::default(),
            shortcuts: ShortcutMap::default(),
            active_operator_id: None,
        }
    }
}

// ------------------------------------------------------------------ write keys

/// One key of the recipe document. Writes are per key because the §4.2 rule is
/// per key: *changing one key* must leave a legal document.
///
/// On the wire it is `{ key, value }` — adjacently tagged, so the JSON reads
/// the way §4.2 reads and a two-value key (`reveal`) still has a shape.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "key", content = "value")]
pub enum GameSetting {
    ScoringMode(ScoringMode),
    FlatPoints(u32),
    DifficultyMap(DifficultyMap),
    SpeedWeight(f64),
    /// Where the speed bonus reaches zero (P11.12).
    SpeedWindow(SpeedWindow),
    /// Quantize the speed bonus into `n` equal bands (P11.12).
    SpeedSteps(Option<u32>),
    LockSpeedEnabled(bool),
    LockSpeedBase(LockSpeedBase),
    MaxConsecutiveCorrect(Option<u32>),
    BonusAfterConsecutive(Option<ConsecutiveBonus>),
    PartialCredit(bool),
    OrderMatters(bool),
    /// `None` inherits `globals.timer.enabled` (§2.18).
    TimerEnabled(Option<bool>),
    /// `None` inherits `globals.timer.duration_ms`.
    TimerDurationMs(Option<u32>),
    Reveal(RevealChannel, RevealMode),
    /// Stage's authored-copy language. Live, like `Reveal`.
    Language(Language),
}

impl GameSetting {
    /// The §4.2 path. Also the notice `target_path` (§14), so it has to name
    /// the field an operator can actually see.
    pub fn key(&self) -> &'static str {
        match self {
            GameSetting::ScoringMode(_) => "scoring.mode",
            GameSetting::FlatPoints(_) => "scoring.flat_points",
            GameSetting::DifficultyMap(_) => "scoring.difficulty_map",
            GameSetting::SpeedWeight(_) => "scoring.speed_weight",
            GameSetting::SpeedWindow(_) => "scoring.speed_window",
            GameSetting::SpeedSteps(_) => "scoring.speed_steps",
            GameSetting::LockSpeedEnabled(_) => "scoring.lock_speed.enabled",
            GameSetting::LockSpeedBase(_) => "scoring.lock_speed_base",
            GameSetting::MaxConsecutiveCorrect(_) => "turn.max_consecutive_correct",
            GameSetting::BonusAfterConsecutive(_) => "turn.bonus_after_consecutive",
            GameSetting::PartialCredit(_) => "judging.partial_credit",
            GameSetting::OrderMatters(_) => "judging.order_matters",
            GameSetting::TimerEnabled(_) => "timer.enabled",
            GameSetting::TimerDurationMs(_) => "timer.duration_ms",
            GameSetting::Reveal(channel, _) => channel.key(),
            GameSetting::Language(_) => "stage.language",
        }
    }

    /// True for the keys that freeze at `play_start` (§2.5). Two exceptions:
    /// reveal, which §4.2 lists as a Game default *and* Control live, and the
    /// Stage language, which is presentation and can move no score.
    pub fn is_game_affecting(&self) -> bool {
        !matches!(self, GameSetting::Reveal(..) | GameSetting::Language(_))
    }

    fn apply(&self, game: &mut GameSettings) {
        match self.clone() {
            GameSetting::ScoringMode(v) => game.scoring.mode = v,
            GameSetting::FlatPoints(v) => game.scoring.flat_points = v,
            GameSetting::DifficultyMap(v) => game.scoring.difficulty_map = v,
            GameSetting::SpeedWeight(v) => game.scoring.speed_weight = v,
            GameSetting::SpeedWindow(v) => game.scoring.speed_window = v,
            GameSetting::SpeedSteps(v) => game.scoring.speed_steps = v,
            GameSetting::LockSpeedEnabled(v) => game.scoring.lock_speed_enabled = v,
            GameSetting::LockSpeedBase(v) => game.scoring.lock_speed_base = v,
            GameSetting::MaxConsecutiveCorrect(v) => game.turn.max_consecutive_correct = v,
            GameSetting::BonusAfterConsecutive(v) => game.turn.bonus_after_consecutive = v,
            GameSetting::PartialCredit(v) => game.judging.partial_credit = v,
            GameSetting::OrderMatters(v) => game.judging.order_matters = v,
            GameSetting::TimerEnabled(v) => game.timer.enabled = v,
            GameSetting::TimerDurationMs(v) => game.timer.duration_ms = v,
            GameSetting::Reveal(channel, mode) => game.reveal.set(channel, mode),
            GameSetting::Language(v) => game.language = v,
        }
    }
}

/// One key of the all-games document. `Game(..)` writes the seed a *new*
/// recipe copies; it never reaches a recipe that already exists.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "key", content = "value")]
pub enum GlobalSetting {
    TimerEnabled(bool),
    TimerDurationMs(u32),
    Game(GameSetting),
    OverrideAfterLock(OverrideAfterLock),
    Reveal(RevealChannel, RevealMode),
    OverlayAnimationsEnabled(bool),
    ViewerHitTargets(bool),
    MosaicDensity(MosaicDensity),
    StageMonitorId(Option<String>),
    /// `stage.mirror_ids` — the displays showing the same picture (P11.11).
    StageMirrorIds(Vec<String>),
    StatsMonitorId(Option<String>),
    /// `stats.fullscreen`. Control-behaviour; takes effect the next time the
    /// window is opened, and on an open window straight away.
    StatsFullscreen(bool),
    StageReattach(StageReattach),
    /// `audio.volume`, 0–100. Control-behaviour.
    AudioVolume(u8),
    /// `audio.muted`. Control-behaviour.
    AudioMuted(bool),
    /// `audio.cues.<key>`: a file in the bundled pack, or `None` to mute the key.
    AudioCue(CueKey, Option<String>),
    Feature(FeatureRoot, bool),
    /// `operator.active`. Whether the id names a live operator is the
    /// catalog's to say; the command layer asks it before this lands.
    ActiveOperatorId(Option<OperatorId>),
}

impl GlobalSetting {
    pub fn key(&self) -> &'static str {
        match self {
            GlobalSetting::AudioVolume(_) => "audio.volume",
            GlobalSetting::AudioMuted(_) => "audio.muted",
            GlobalSetting::AudioCue(..) => "audio.cues",
            GlobalSetting::TimerEnabled(_) => "globals.timer.enabled",
            GlobalSetting::TimerDurationMs(_) => "globals.timer.duration_ms",
            GlobalSetting::Game(setting) => setting.key(),
            GlobalSetting::OverrideAfterLock(_) => "override.after_lock",
            GlobalSetting::Reveal(channel, _) => channel.key(),
            GlobalSetting::OverlayAnimationsEnabled(_) => "overlay_animations.enabled",
            GlobalSetting::ViewerHitTargets(_) => "viewer.hit_targets",
            GlobalSetting::MosaicDensity(_) => "control.mosaic_density",
            GlobalSetting::StageMonitorId(_) => "stage.monitor_id",
            GlobalSetting::StageMirrorIds(_) => "stage.mirror_ids",
            GlobalSetting::StatsMonitorId(_) => "stats.monitor_id",
            GlobalSetting::StatsFullscreen(_) => "stats.fullscreen",
            GlobalSetting::StageReattach(_) => "stage.reattach",
            GlobalSetting::Feature(root, _) => root.key(),
            GlobalSetting::ActiveOperatorId(_) => "operator.active",
        }
    }
}

// -------------------------------------------------------------- runtime inputs

/// What the host knows about the Play right now.
///
/// Built at the call site with [`RuntimeContext::of`] and thrown away — the
/// runtime flags of §2.16 are *derived*, and a stored copy would be a second
/// source of truth for `play.status`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct RuntimeContext {
    pub play_status: Option<PlayStatus>,
    pub session_issued: bool,
    pub session_locked: bool,
    pub session_resolved: bool,
    pub timer_running: bool,
    /// `PresentationService`'s queue flag (§11.G). Nothing else here can know
    /// it, so it is passed in.
    pub overlay_busy: bool,
}

impl RuntimeContext {
    /// Read every runtime flag off the one writer of a Play.
    pub fn of(service: &MatchService, overlay_busy: bool) -> Self {
        let Some(play) = service.get_state() else {
            return RuntimeContext {
                overlay_busy,
                ..RuntimeContext::default()
            };
        };
        let session = play.session();
        RuntimeContext {
            play_status: Some(play.status()),
            session_issued: session.is_some_and(|s| !s.is_resolved()),
            session_locked: session.is_some_and(|s| s.is_locked()),
            session_resolved: session.is_some_and(|s| s.is_resolved()),
            timer_running: session
                .and_then(|s| s.timer.as_ref())
                .is_some_and(|t| t.running()),
            overlay_busy,
        }
    }

    /// Playing or paused — the window in which game-affecting keys are frozen
    /// (§2.5). A completed Play keeps its own snapshot, so editing the recipe
    /// again is safe (§11.H).
    pub fn play_is_open(&self) -> bool {
        self.play_status.is_some_and(PlayStatus::is_open)
    }
}

/// What a flag read answers with. One shape per kind of key, so a caller that
/// asks for `play.status` cannot silently read it as a bool.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "value")]
pub enum FlagValue {
    Bool(bool),
    /// `None` when no Play is loaded.
    Status(Option<PlayStatus>),
    Number(u64),
    Text(&'static str),
}

/// Every key [`FlagService::flag`] resolves, in the three §2.16 kinds. Exposed
/// so a settings or diagnostics surface can enumerate rather than guess; keys
/// outside this list belong to the typed accessors.
pub const FLAG_KEYS: &[&str] = &[
    // feature roots
    "feat.audio",
    "feat.audio.synth",
    "feat.search",
    "feat.statistics",
    // policy keys
    "timer.enabled",
    "timer.duration_ms",
    "override.after_lock",
    "overlay_animations.enabled",
    "viewer.hit_targets",
    "judging.partial_credit",
    "judging.order_matters",
    "scoring.mode",
    "control.mosaic_density",
    "stage.reattach",
    "reveal.question",
    "reveal.answers",
    "reveal.outcome",
    "reveal.leaderboard",
    "stage.language",
    // runtime flags
    "play.status",
    "play.open",
    "session.issued",
    "session.locked",
    "session.resolved",
    "timer.running",
    "overlay.busy",
];

/// Why a key or affordance is greyed out. Disabled, never hidden (§2.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case", tag = "reason", content = "detail")]
pub enum DisabledReason {
    /// Game-affecting, and a Play is open.
    Frozen,
    /// Legal, but a sibling key makes it inert. The stored value is kept —
    /// §4.2: "Option off: weight slider disabled; stored weight kept."
    Inert(&'static str),
    /// A `feat.*` root above it is off (§2.16).
    FeatureOff(&'static str),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Disabled {
    pub key: &'static str,
    #[serde(flatten)]
    pub reason: DisabledReason,
}

/// The whole document as one read (`settings_get`), plus what is currently
/// unwritable. Studio renders this; it never assembles its own copy.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsView<'a> {
    pub globals: &'a GlobalSettings,
    /// The recipe in Control, if any (§11.L L3).
    pub current_game: Option<&'a GameSettings>,
    /// Control-behaviour as it is *now* — the live copy, which a Play's start
    /// does not freeze.
    pub control: &'a ControlSettings,
    /// True while game-affecting keys are frozen (§2.5).
    pub game_affecting_frozen: bool,
    pub disabled: Vec<Disabled>,
}

// --------------------------------------------------------------------- service

/// The settings document and the flag reader (§2.16). One instance per host.
#[derive(Debug, Clone, PartialEq)]
pub struct FlagService {
    globals: GlobalSettings,
    current_game: Option<GameSettings>,
    control: ControlSettings,
}

impl Default for FlagService {
    fn default() -> Self {
        FlagService::new(GlobalSettings::default())
    }
}

impl FlagService {
    pub fn new(globals: GlobalSettings) -> Self {
        let control = globals.control.clone();
        FlagService {
            globals,
            current_game: None,
            control,
        }
    }

    // ------------------------------------------------------------ the document

    /// `settings_get`.
    pub fn settings_get(&self, ctx: RuntimeContext) -> SettingsView<'_> {
        SettingsView {
            globals: &self.globals,
            current_game: self.current_game.as_ref(),
            control: &self.control,
            game_affecting_frozen: ctx.play_is_open(),
            disabled: self.disabled(ctx),
        }
    }

    pub fn globals(&self) -> &GlobalSettings {
        &self.globals
    }

    pub fn current_game(&self) -> Option<&GameSettings> {
        self.current_game.as_ref()
    }

    pub fn control(&self) -> &ControlSettings {
        &self.control
    }

    /// `play_load`'s settings half: the recipe's B5 document arrives from
    /// `CatalogService` and becomes the Current game tab.
    ///
    /// It is validated on the way in, because a document written by an older
    /// build is not automatically legal today — and its reveal defaults seed
    /// the live control copy (§4.2: Game default, then Control live).
    pub fn load_recipe(&mut self, game: GameSettings) -> MatchResult<()> {
        validate(&game)?;
        self.control.reveal = game.reveal;
        self.current_game = Some(game);
        Ok(())
    }

    /// The recipe left Control. Control-behaviour keys stay where the operator
    /// last put them; only the recipe document goes.
    pub fn unload_recipe(&mut self) {
        self.current_game = None;
    }

    /// A fresh recipe's document — the globals seed, copied (§12).
    pub fn new_recipe_settings(&self) -> GameSettings {
        self.globals.game_defaults.clone()
    }

    // --------------------------------------------------------------- the writes

    /// `settings_set_global`. Refused whole if the result would be illegal.
    pub fn settings_set_global(
        &mut self,
        setting: GlobalSetting,
        ctx: RuntimeContext,
    ) -> MatchResult<()> {
        let mut globals = self.globals.clone();
        let mut control = self.control.clone();

        match setting.clone() {
            GlobalSetting::TimerEnabled(v) => {
                guard_timer_off_while_running(v, ctx, "globals.timer.enabled")?;
                globals.timer.enabled = Some(v);
            }
            GlobalSetting::TimerDurationMs(v) => globals.timer.duration_ms = Some(v),
            GlobalSetting::Game(game) => game.apply(&mut globals.game_defaults),
            GlobalSetting::OverrideAfterLock(v) => {
                globals.control.override_after_lock = v;
                control.override_after_lock = v;
            }
            GlobalSetting::Reveal(channel, mode) => {
                globals.control.reveal.set(channel, mode);
                control.reveal.set(channel, mode);
            }
            GlobalSetting::OverlayAnimationsEnabled(v) => {
                globals.control.overlay_animations_enabled = v;
                control.overlay_animations_enabled = v;
            }
            GlobalSetting::ViewerHitTargets(v) => {
                globals.control.viewer_hit_targets = v;
                control.viewer_hit_targets = v;
            }
            GlobalSetting::MosaicDensity(v) => {
                globals.control.mosaic_density = v;
                control.mosaic_density = v;
            }
            GlobalSetting::StageMonitorId(v) => {
                globals.control.stage_monitor_id.clone_from(&v);
                control.stage_monitor_id = v;
            }
            GlobalSetting::StageMirrorIds(v) => {
                globals.control.stage_mirror_ids.clone_from(&v);
                control.stage_mirror_ids = v;
            }
            GlobalSetting::StatsMonitorId(v) => {
                globals.control.stats_monitor_id.clone_from(&v);
                control.stats_monitor_id = v;
            }
            GlobalSetting::StatsFullscreen(v) => {
                globals.control.stats_fullscreen = v;
                control.stats_fullscreen = v;
            }
            GlobalSetting::StageReattach(v) => {
                globals.control.stage_reattach = v;
                control.stage_reattach = v;
            }
            GlobalSetting::AudioVolume(v) => {
                globals.control.audio.volume = v;
                control.audio.volume = v;
            }
            GlobalSetting::AudioMuted(v) => {
                globals.control.audio.muted = v;
                control.audio.muted = v;
            }
            GlobalSetting::AudioCue(cue, file) => {
                globals.control.audio.cues.insert(cue, file.clone());
                control.audio.cues.insert(cue, file);
            }
            GlobalSetting::Feature(root, on) => globals.features.set(root, on),
            GlobalSetting::ActiveOperatorId(v) => globals.active_operator_id = v,
        }

        validate_globals(&globals)?;
        self.globals = globals;
        self.control = control;
        Ok(())
    }

    /// `settings_set_current_game` — the recipe's B5 document (§11.L L3).
    ///
    /// After `play_start` the game-affecting half is refused with
    /// [`MatchError::SettingFrozen`] (§2.5). That is the enforcement; the
    /// disabled input in Control is only the courtesy.
    pub fn settings_set_current_game(
        &mut self,
        setting: GameSetting,
        ctx: RuntimeContext,
    ) -> MatchResult<()> {
        let current = self
            .current_game
            .as_ref()
            .ok_or(MatchError::NoRecipeLoaded)?;

        if ctx.play_is_open() && setting.is_game_affecting() {
            return Err(MatchError::SettingFrozen(setting.key()));
        }
        if let GameSetting::TimerEnabled(Some(v)) = setting {
            guard_timer_off_while_running(v, ctx, "timer.enabled")?;
        }

        let mut game = current.clone();
        setting.apply(&mut game);
        validate(&game)?;

        // Reveal is a Game default *and* Control live, so writing it here has
        // to move the live copy too — otherwise the Current game tab would
        // show a mode Stage is not using.
        if let GameSetting::Reveal(channel, mode) = setting {
            self.control.reveal.set(channel, mode);
        }
        self.current_game = Some(game);
        Ok(())
    }

    /// `settings_set_shortcut`. `None` clears the binding.
    ///
    /// A chord already bound elsewhere is refused rather than stolen: §2.20
    /// wants a conflict notice with *keep* and *reassign*, and the host cannot
    /// pick between them.
    pub fn settings_set_shortcut(
        &mut self,
        command: &str,
        chord: Option<Chord>,
    ) -> MatchResult<()> {
        let Some(chord) = chord else {
            self.globals.shortcuts.0.remove(command);
            return Ok(());
        };
        if let Some(existing) = self.globals.shortcuts.command_for(&chord)
            && existing != command
        {
            return Err(MatchError::IllegalSettings {
                key: "shortcuts",
                reason: "that chord is already bound to another command",
            });
        }
        self.globals.shortcuts.0.insert(command.to_owned(), chord);
        Ok(())
    }

    // ---------------------------------------------------------------- the reads

    /// §4.3 step 3 — the resolved copy `play_start` freezes into the snapshot.
    ///
    /// The cascade is resolved *here*, once, which is why a later globals edit
    /// cannot move an open Play: the Play holds numbers, not a reference to
    /// this document.
    pub fn freeze(&self) -> MatchResult<FrozenSettings> {
        let game = self
            .current_game
            .as_ref()
            .ok_or(MatchError::NoRecipeLoaded)?;
        Ok(FrozenSettings {
            scoring: game.scoring.clone(),
            judging: game.judging,
            turn: game.turn,
            timer: TimerCascade {
                globals: self.globals.timer,
                recipe: game.timer,
            },
        })
    }

    /// The control-behaviour half `MatchService` needs. Everything else in
    /// [`ControlSettings`] belongs to Presentation or to Studio chrome.
    pub fn live(&self) -> LiveSettings {
        LiveSettings {
            override_after_lock: self.control.override_after_lock,
        }
    }

    /// The `revealModes` record `PresentationService` merges into `play-state`.
    pub fn reveal_modes(&self) -> RevealSettings {
        self.control.reveal
    }

    /// The `language` `PresentationService` merges into `play-state`: the
    /// recipe in Control's, English when nothing is loaded. Read per call,
    /// never stored twice.
    pub fn language(&self) -> Language {
        self.current_game.as_ref().map_or(Language::En, |g| g.language)
    }

    /// The `audio` record `PresentationService` merges into `play-state`
    /// (§12.5). Passed in per call like `reveal_modes`, never stored twice.
    pub fn audio(&self) -> AudioSettings {
        self.control.audio.clone()
    }

    /// The §2.18 cascade as it stands now — what a Play *would* freeze.
    pub fn timer_cascade(&self) -> TimerCascade {
        TimerCascade {
            globals: self.globals.timer,
            recipe: self
                .current_game
                .as_ref()
                .map(|g| g.timer)
                .unwrap_or_default(),
        }
    }

    /// A feature root, resolved through its parents (§2.16).
    pub fn feature(&self, root: FeatureRoot) -> bool {
        self.globals.features.resolved(root)
    }

    /// The gate a command puts in front of itself: off ⇒ `feature_off`.
    pub fn require_feature(&self, root: FeatureRoot) -> MatchResult<()> {
        if self.feature(root) {
            Ok(())
        } else {
            Err(MatchError::FeatureOff(root.key()))
        }
    }

    /// One lookup over all three flag kinds (§2.16). `None` is an unknown key,
    /// never a false — see [`FLAG_KEYS`] for what resolves.
    pub fn flag(&self, key: &str, ctx: RuntimeContext) -> Option<FlagValue> {
        if let Some(root) = FeatureRoot::from_key(key) {
            return Some(FlagValue::Bool(self.feature(root)));
        }
        let cascade = self.timer_cascade();
        let control = &self.control;
        let judging = self.current_game.as_ref().map(|g| g.judging);
        let value = match key {
            // policy keys
            "timer.enabled" => FlagValue::Bool(cascade.enabled()),
            "timer.duration_ms" => FlagValue::Number(u64::from(cascade.resolve(None).unwrap_or(0))),
            "override.after_lock" => FlagValue::Text(match control.override_after_lock {
                OverrideAfterLock::Allow => "allow",
                OverrideAfterLock::RefuseUntilReveal => "refuse_until_reveal",
            }),
            "overlay_animations.enabled" => FlagValue::Bool(control.overlay_animations_enabled),
            "viewer.hit_targets" => FlagValue::Bool(control.viewer_hit_targets),
            "control.mosaic_density" => FlagValue::Text(control.mosaic_density.as_str()),
            "stage.reattach" => FlagValue::Text(control.stage_reattach.as_str()),
            "judging.partial_credit" => FlagValue::Bool(judging?.partial_credit),
            "judging.order_matters" => FlagValue::Bool(judging?.order_matters),
            "scoring.mode" => FlagValue::Text(match self.current_game.as_ref()?.scoring.mode {
                ScoringMode::Flat => "flat",
                ScoringMode::Difficulty => "difficulty",
                ScoringMode::LockSpeed => "lock_speed",
            }),
            "reveal.question" => FlagValue::Text(control.reveal.question.as_str()),
            "reveal.answers" => FlagValue::Text(control.reveal.answers.as_str()),
            "reveal.outcome" => FlagValue::Text(control.reveal.outcome.as_str()),
            "reveal.leaderboard" => FlagValue::Text(control.reveal.leaderboard.as_str()),
            "stage.language" => FlagValue::Text(self.language().as_str()),
            // runtime flags — derived, never stored
            "play.status" => FlagValue::Status(ctx.play_status),
            "play.open" => FlagValue::Bool(ctx.play_is_open()),
            "session.issued" => FlagValue::Bool(ctx.session_issued),
            "session.locked" => FlagValue::Bool(ctx.session_locked),
            "session.resolved" => FlagValue::Bool(ctx.session_resolved),
            "timer.running" => FlagValue::Bool(ctx.timer_running),
            "overlay.busy" => FlagValue::Bool(ctx.overlay_busy),
            _ => return None,
        };
        Some(value)
    }

    /// Every settings key that is currently unwritable or inert, with the
    /// reason. This is §4.2's "UI disables the illegal sibling first", computed
    /// once by the flag reader instead of four times in Studio.
    ///
    /// Order is stable so a diff of two calls is readable.
    pub fn disabled(&self, ctx: RuntimeContext) -> Vec<Disabled> {
        let mut out: Vec<Disabled> = Vec::new();
        let d = |key, reason| Disabled { key, reason };

        if !self.feature(FeatureRoot::Audio) {
            out.push(d(
                "feat.audio.synth",
                DisabledReason::FeatureOff("feat.audio"),
            ));
        }

        let Some(game) = self.current_game.as_ref() else {
            return out;
        };
        out.extend(interlocks(game, self.timer_cascade().enabled(), ctx.play_is_open()));
        out
    }

    /// The same §4.2 table over a recipe that is **not** in Control (P11.12).
    ///
    /// `disabled` can only answer for the recipe the operator has loaded, so
    /// Game ▸ Rules used to re-derive "the weight is inert" client-side — a
    /// second copy of an interlock, which §4.2 exists to prevent. This is the
    /// one table, asked about any document; `disabled` calls it too.
    pub fn interlocks_for(&self, game: &GameSettings, frozen: bool) -> Vec<Disabled> {
        // A recipe not in Control resolves its own timer against the globals,
        // which is exactly what `play_load` will do for it later.
        let cascade = TimerCascade {
            globals: self.globals.timer,
            recipe: game.timer,
        };
        interlocks(game, cascade.enabled(), frozen)
    }

    /// §4.2: `timer.enabled = false` hides StartTimer and the Stage clock.
    pub fn show_timer_controls(&self) -> bool {
        self.timer_cascade().enabled()
    }

    /// §4.2/§2.6: under `refuse_until_reveal` the GiveToken affordance is
    /// disabled while an answer is locked and unrevealed. `allow` shows it and
    /// pairs it with `reveal_and_pass` — the host refuses a bare override in
    /// both modes either way.
    pub fn show_give_token(&self, ctx: RuntimeContext) -> bool {
        match self.control.override_after_lock {
            OverrideAfterLock::Allow => true,
            OverrideAfterLock::RefuseUntilReveal => !ctx.session_locked || ctx.session_resolved,
        }
    }
}

/// The §4.2 interlock table over one game document.
///
/// One copy, called by [`FlagService::disabled`] for the recipe in Control and
/// by [`FlagService::interlocks_for`] for any other. Every entry says which
/// sibling key made this one inert, because that sentence is what the operator
/// needs and it is not derivable from the key alone.
fn interlocks(game: &GameSettings, timer_on: bool, frozen: bool) -> Vec<Disabled> {
    let mut out: Vec<Disabled> = Vec::new();
    let d = |key, reason| Disabled { key, reason };
    let scoring = &game.scoring;
    let exclusive = matches!(scoring.mode, ScoringMode::LockSpeed);

    // The mode picks which base is live and whether the option exists at
    // all. Both directions of the §4.2 interlock, so neither branch can
    // present a control that does nothing.
    if exclusive {
        out.push(d(
            "scoring.lock_speed.enabled",
            DisabledReason::Inert("scoring.mode is already lock_speed"),
        ));
    } else {
        out.push(d(
            "scoring.lock_speed_base",
            DisabledReason::Inert("scoring.mode is not lock_speed"),
        ));
    }
    if !scoring.uses_flat_base() {
        out.push(d(
            "scoring.flat_points",
            DisabledReason::Inert("no scoring path uses the flat base"),
        ));
    }
    if !scoring.uses_difficulty_base() {
        out.push(d(
            "scoring.difficulty_map",
            DisabledReason::Inert("no scoring path uses the difficulty base"),
        ));
    }
    // §2.4: operator pace disables the lock-speed weight — there is no
    // remaining time to weigh. The window and the banding hang off the same
    // weight, so they go inert together with it (P11.12).
    let speed_dead = if !scoring.uses_lock_speed() {
        Some(DisabledReason::Inert("lock-speed scoring is off"))
    } else if !timer_on {
        Some(DisabledReason::Inert("the play runs at operator pace"))
    } else {
        None
    };
    match speed_dead {
        Some(reason) => {
            out.push(d("scoring.speed_weight", reason));
            out.push(d("scoring.speed_window", reason));
            out.push(d("scoring.speed_steps", reason));
        }
        // A weight of zero is legal and kept (§4.2), but a window and a
        // banding over a bonus of nothing are controls that cannot move a
        // number.
        None if scoring.speed_weight <= 0.0 => {
            let reason = DisabledReason::Inert("scoring.speed_weight is 0");
            out.push(d("scoring.speed_window", reason));
            out.push(d("scoring.speed_steps", reason));
        }
        None => {}
    }
    if !timer_on {
        out.push(d(
            "timer.duration_ms",
            DisabledReason::Inert("timer.enabled is off"),
        ));
    }

    if frozen {
        out.extend(
            GAME_AFFECTING_KEYS
                .iter()
                .map(|key| d(*key, DisabledReason::Frozen)),
        );
    }
    out
}

/// The keys §4.2 marks *Game, frozen*. Listed once so the freeze rule and the
/// disabled list cannot drift apart.
pub const GAME_AFFECTING_KEYS: &[&str] = &[
    "scoring.mode",
    "scoring.flat_points",
    "scoring.difficulty_map",
    "scoring.speed_weight",
    "scoring.speed_window",
    "scoring.speed_steps",
    "scoring.lock_speed.enabled",
    "scoring.lock_speed_base",
    "turn.max_consecutive_correct",
    "turn.bonus_after_consecutive",
    "judging.partial_credit",
    "judging.order_matters",
    "timer.enabled",
    "timer.duration_ms",
];

// ------------------------------------------------------------------ validation

/// §2.18: a countdown that is *running* may not be switched off underneath the
/// team answering it. Pause the Play or resolve the question first.
fn guard_timer_off_while_running(
    enabled: bool,
    ctx: RuntimeContext,
    key: &'static str,
) -> MatchResult<()> {
    if !enabled && ctx.timer_running {
        return Err(MatchError::IllegalSettings {
            key,
            reason: "a countdown is running; pause or resolve the question first",
        });
    }
    Ok(())
}

/// The §4.2 interlock table over one recipe document.
///
/// The checks live on the settings types themselves ([`ScoringSettings::validate`]
/// and friends), so `play_load` can run exactly the same table over a
/// [`FrozenSettings`] that arrived from the database rather than from here.
/// Everything they refuse is a combination that cannot mean anything — not a
/// value an operator merely would not want.
pub fn validate(game: &GameSettings) -> MatchResult<()> {
    game.scoring.validate()?;
    game.turn.validate()?;
    game.timer.validate("timer.duration_ms")
}

fn validate_globals(globals: &GlobalSettings) -> MatchResult<()> {
    validate(&globals.game_defaults)?;
    globals.control.audio.validate()?;
    globals.timer.validate("globals.timer.duration_ms")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::DifficultyBand;

    #[test]
    fn a_chord_is_a_value_not_a_spelling() {
        let canonical = Chord::parse("ctrl+shift+l").unwrap();
        assert_eq!(Chord::parse("Shift+Control+L").unwrap(), canonical);
        assert_eq!(Chord::parse(" CMD + k ").unwrap().as_str(), "meta+k");
        assert_eq!(canonical.as_str(), "ctrl+shift+l");
    }

    #[test]
    fn a_chord_with_no_key_or_two_keys_is_not_a_chord() {
        assert!(Chord::parse("ctrl+shift").is_none());
        assert!(Chord::parse("ctrl+k+j").is_none());
        assert!(Chord::parse("ctrl+").is_none());
        assert!(Chord::parse("").is_none());
    }

    #[test]
    fn a_feature_root_is_off_when_its_parent_is() {
        let roots = FeatureRoots {
            audio: false,
            audio_synth: true,
            ..FeatureRoots::default()
        };
        // The switch still reads on — Settings shows what was authored — but
        // the resolved value follows the subgraph (§2.16).
        assert!(roots.switch(FeatureRoot::AudioSynth));
        assert!(!roots.resolved(FeatureRoot::AudioSynth));
        assert!(roots.resolved(FeatureRoot::Search));
    }

    #[test]
    fn the_v1_default_has_audio_on_and_synth_off() {
        let roots = FeatureRoots::default();
        assert!(roots.resolved(FeatureRoot::Audio));
        assert!(!roots.resolved(FeatureRoot::AudioSynth));
    }

    #[test]
    fn every_feature_key_round_trips() {
        for root in FeatureRoot::ALL {
            assert_eq!(FeatureRoot::from_key(root.key()), Some(root));
        }
        assert_eq!(FeatureRoot::from_key("feat.nope"), None);
    }

    #[test]
    fn lock_speed_cannot_be_the_mode_and_the_option_at_once() {
        let mut game = GameSettings::default();
        game.scoring.mode = ScoringMode::LockSpeed;
        game.scoring.lock_speed_enabled = true;
        assert_eq!(
            validate(&game).unwrap_err(),
            MatchError::IllegalSettings {
                key: "scoring.lock_speed.enabled",
                reason: "lock-speed is already the mode; the option would apply it twice",
            }
        );
    }

    #[test]
    fn an_unused_speed_weight_stays_legal() {
        // §4.2: "Option off: weight slider disabled; stored weight kept."
        let mut game = GameSettings::default();
        game.scoring.speed_weight = 0.5;
        game.scoring.lock_speed_enabled = false;
        assert!(validate(&game).is_ok());
    }

    #[test]
    fn a_speed_weight_must_be_a_finite_non_negative_number() {
        let mut game = GameSettings::default();
        game.scoring.speed_weight = -0.1;
        assert!(validate(&game).is_err());
        game.scoring.speed_weight = f64::NAN;
        assert!(validate(&game).is_err());
        game.scoring.speed_weight = f64::INFINITY;
        assert!(validate(&game).is_err());
    }

    #[test]
    fn a_difficulty_map_must_be_a_map() {
        let mut game = GameSettings::default();
        game.scoring.difficulty_map = DifficultyMap::Bands { bands: Vec::new() };
        assert!(validate(&game).is_err());
        game.scoring.difficulty_map = DifficultyMap::Bands {
            bands: vec![DifficultyBand {
                up_to: 101,
                points: 10,
            }],
        };
        assert!(validate(&game).is_err());
        game.scoring.difficulty_map = DifficultyMap::Linear { factor: -1.0 };
        assert!(validate(&game).is_err());
    }

    #[test]
    fn a_cap_of_zero_and_a_bonus_at_zero_are_refused() {
        let mut game = GameSettings::default();
        game.turn.max_consecutive_correct = Some(0);
        assert!(validate(&game).is_err());

        let mut game = GameSettings::default();
        game.turn.bonus_after_consecutive = Some(ConsecutiveBonus {
            count: 0,
            award: 50,
        });
        assert!(validate(&game).is_err());
    }

    #[test]
    fn a_bonus_the_cap_can_never_reach_is_refused() {
        let mut game = GameSettings::default();
        game.turn.max_consecutive_correct = Some(2);
        game.turn.bonus_after_consecutive = Some(ConsecutiveBonus {
            count: 3,
            award: 50,
        });
        assert!(validate(&game).is_err());

        // Landing exactly on the cap is the interesting legal case: the last
        // correct answer both pays the bonus and ends the token (§4.4).
        game.turn.bonus_after_consecutive = Some(ConsecutiveBonus {
            count: 2,
            award: 50,
        });
        assert!(validate(&game).is_ok());
    }

    #[test]
    fn a_zero_countdown_is_not_operator_pace() {
        let mut game = GameSettings::default();
        game.timer.duration_ms = Some(0);
        assert!(validate(&game).is_err());
        game.timer.duration_ms = None;
        game.timer.enabled = Some(false);
        assert!(validate(&game).is_ok());
    }
}
