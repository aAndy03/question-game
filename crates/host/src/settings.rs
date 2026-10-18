//! The settings `MatchService` needs, split by when they may change.
//!
//! `FlagService` (P5) owns the settings *document*, the §4.2 interlock table
//! and the `feat.*` roots. What lives here is the resolved result it hands to a
//! Play: the game-affecting keys frozen at `play_start` (§2.5) and the
//! control-behaviour keys that stay live for the whole Play.
//!
//! The split is the point. A frozen key sits inside `PlaySnapshot`, so it is
//! copied once and cannot drift; a live key sits on the service, so the
//! operator can change it mid-Play. Pause is not a back door into award edits:
//! there is no command here that writes a frozen key.

use serde::{Deserialize, Serialize};

use crate::error::{MatchError, MatchResult};

fn illegal(key: &'static str, reason: &'static str) -> MatchError {
    MatchError::IllegalSettings { key, reason }
}

/// §2.3. `LockSpeed` is the *exclusive* mode; the same speed factor also exists
/// as an option on the other two (`ScoringSettings::lock_speed_enabled`). Never
/// apply it twice.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScoringMode {
    Flat,
    Difficulty,
    LockSpeed,
}

/// Which base the exclusive lock-speed mode multiplies.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LockSpeedBase {
    Flat,
    Difficulty,
}

/// `scoring.difficulty_map` — "table or curve" (§4.2). Both shapes map a 1–100
/// difficulty onto a base point value.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind")]
pub enum DifficultyMap {
    /// `points = floor(difficulty * factor)`.
    Linear { factor: f64 },
    /// Bands, each carrying the highest difficulty it covers. Sorted on use, so
    /// an operator may author them in any order; a difficulty above the last
    /// band takes the last band's award.
    Bands { bands: Vec<DifficultyBand> },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct DifficultyBand {
    /// Inclusive upper bound, 1–100.
    pub up_to: u8,
    pub points: u32,
}

impl DifficultyMap {
    /// A map has to be a map: an empty band table awards nothing at every
    /// difficulty, and a bound outside 1-100 names a difficulty that cannot
    /// exist (§4.1).
    pub fn validate(&self) -> MatchResult<()> {
        match self {
            DifficultyMap::Linear { factor } if !factor.is_finite() || *factor < 0.0 => {
                Err(illegal(
                    "scoring.difficulty_map",
                    "the linear factor must be finite and >= 0",
                ))
            }
            DifficultyMap::Bands { bands } if bands.is_empty() => Err(illegal(
                "scoring.difficulty_map",
                "a band table needs at least one band",
            )),
            DifficultyMap::Bands { bands }
                if bands.iter().any(|b| b.up_to == 0 || b.up_to > 100) =>
            {
                Err(illegal(
                    "scoring.difficulty_map",
                    "every band bound must be a difficulty, 1-100",
                ))
            }
            _ => Ok(()),
        }
    }

    /// The bands as the lookup actually sees them: sorted by `up_to`, each
    /// carrying the lowest difficulty it covers as well as the highest.
    ///
    /// This is the one place bands are ordered and their lower bounds are
    /// derived, so the award, the ledger and the Rules preview cannot disagree
    /// about which band a difficulty falls in. Linear has no spans.
    pub fn spans(&self) -> Vec<BandSpan> {
        let DifficultyMap::Bands { bands } = self else {
            return Vec::new();
        };
        let mut sorted: Vec<DifficultyBand> = bands.clone();
        sorted.sort_by_key(|b| b.up_to);
        let mut from = 1u8;
        sorted
            .into_iter()
            .enumerate()
            .map(|(index, band)| {
                let span = BandSpan {
                    index: index as u32,
                    from,
                    up_to: band.up_to,
                    // Two bands may share a ceiling, or a later one may sit
                    // below an earlier one. The lookup takes the first match,
                    // so such a band can never pay — and a ladder that showed
                    // it as a range would be showing a range that overlaps its
                    // neighbour. It is kept and marked, not dropped: an
                    // operator who typed it needs to be told why it is dead.
                    reachable: from <= band.up_to,
                    points: band.points,
                };
                from = band.up_to.saturating_add(1);
                span
            })
            .collect()
    }

    /// The band that pays for this difficulty, and whether it only paid
    /// because the difficulty ran off the end of the table.
    pub fn band_for(&self, difficulty: u8) -> Option<(BandSpan, bool)> {
        let spans = self.spans();
        if let Some(span) = spans.iter().find(|s| difficulty <= s.up_to) {
            return Some((*span, false));
        }
        spans.last().map(|span| (*span, true))
    }

    pub fn points(&self, difficulty: u8) -> u32 {
        match self {
            DifficultyMap::Linear { factor } => {
                (f64::from(difficulty) * factor).floor().max(0.0) as u32
            }
            DifficultyMap::Bands { .. } => self
                .band_for(difficulty)
                .map(|(span, _)| span.points)
                .unwrap_or(0),
        }
    }
}

/// One band with both of its bounds resolved (P11.12). `from` is derived from
/// the previous band's `up_to`, which is what makes a band table readable:
/// the operator authors ceilings and reads ranges.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BandSpan {
    pub index: u32,
    pub from: u8,
    pub up_to: u8,
    /// False when an earlier band already covers everything up to this
    /// ceiling, so no difficulty can ever reach it.
    pub reachable: bool,
    pub points: u32,
}

/// Where the lock-speed bonus reaches zero (P11.12).
///
/// The P4 formula weighed `remaining / duration` — a share of whatever clock
/// *that* question happened to get, so the same answer time was worth
/// different amounts on different questions. This says where the bonus ends,
/// in the unit the operator thinks in.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case", tag = "kind", content = "value")]
pub enum SpeedWindow {
    /// A share of that question's own clock. `1.0` is the whole clock — the
    /// P4 formula unchanged, and the default.
    Fraction(f64),
    /// Absolute milliseconds, clamped to the clock. The same answer time is
    /// then worth the same on every question whatever its duration.
    Ms(u32),
}

impl Default for SpeedWindow {
    fn default() -> Self {
        SpeedWindow::Fraction(1.0)
    }
}

impl SpeedWindow {
    /// The window in milliseconds for a question with this countdown.
    pub fn resolve(&self, duration_ms: u32) -> u32 {
        match self {
            SpeedWindow::Fraction(f) => {
                let f = if f.is_finite() { f.clamp(0.0, 1.0) } else { 0.0 };
                (f64::from(duration_ms) * f).round() as u32
            }
            SpeedWindow::Ms(ms) => (*ms).min(duration_ms),
        }
    }

    fn validate(&self) -> MatchResult<()> {
        match self {
            // A window of zero can never pay, so it is a setting that cannot
            // mean anything — the same shape as a cap of zero (§4.4).
            SpeedWindow::Fraction(f) if !f.is_finite() || *f <= 0.0 || *f > 1.0 => Err(illegal(
                "scoring.speed_window",
                "a share of the clock, greater than 0 and at most 1; switch lock-speed off instead",
            )),
            SpeedWindow::Ms(0) => Err(illegal(
                "scoring.speed_window",
                "a window of 0 ms can never pay; switch lock-speed off instead",
            )),
            _ => Ok(()),
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ScoringSettings {
    pub mode: ScoringMode,
    pub flat_points: u32,
    pub difficulty_map: DifficultyMap,
    /// `speed_weight` ≥ 0. `0` equals the base (§2.3).
    pub speed_weight: f64,
    /// The option on flat/difficulty. Ignored in the exclusive mode, which is
    /// already lock-speed — applying both would double-count.
    pub lock_speed_enabled: bool,
    pub lock_speed_base: LockSpeedBase,
    /// Where the speed bonus reaches zero (P11.12). Defaults to the whole
    /// clock, which is the P4 formula, so a snapshot written before this
    /// field existed deserialises into the rules it was played under.
    #[serde(default)]
    pub speed_window: SpeedWindow,
    /// Quantize the bonus into `n` equal bands across the window, so every
    /// answer inside a band is worth identically the same. `None` is the
    /// continuous slope — the P4 behaviour, and the default.
    #[serde(default)]
    pub speed_steps: Option<u32>,
}

impl Default for ScoringSettings {
    /// The P10 demo defaults: award by difficulty, lock-speed off.
    fn default() -> Self {
        ScoringSettings {
            mode: ScoringMode::Difficulty,
            flat_points: 100,
            difficulty_map: DifficultyMap::Linear { factor: 10.0 },
            speed_weight: 0.0,
            lock_speed_enabled: false,
            lock_speed_base: LockSpeedBase::Difficulty,
            speed_window: SpeedWindow::default(),
            speed_steps: None,
        }
    }
}

impl ScoringSettings {
    /// True when the lock-speed factor applies at all — exclusive mode, or the
    /// option switched on. The two are never combined (§2.3).
    pub fn uses_lock_speed(&self) -> bool {
        matches!(self.mode, ScoringMode::LockSpeed) || self.lock_speed_enabled
    }

    /// True when this scoring path reads `flat_points` as its base.
    pub fn uses_flat_base(&self) -> bool {
        match self.mode {
            ScoringMode::Flat => true,
            ScoringMode::Difficulty => false,
            ScoringMode::LockSpeed => matches!(self.lock_speed_base, LockSpeedBase::Flat),
        }
    }

    /// True when this scoring path reads `difficulty_map` as its base.
    pub fn uses_difficulty_base(&self) -> bool {
        match self.mode {
            ScoringMode::Flat => false,
            ScoringMode::Difficulty => true,
            ScoringMode::LockSpeed => matches!(self.lock_speed_base, LockSpeedBase::Difficulty),
        }
    }

    /// The §4.2 interlocks that live on this group. A combination that cannot
    /// mean anything is refused; a value that is merely unused is kept, because
    /// §4.2 says so outright ("Option off: weight slider disabled; stored weight
    /// kept").
    pub fn validate(&self) -> MatchResult<()> {
        // Lock-speed is an exclusive mode *or* an option on the other two
        // (§2.3). Both at once would apply the speed factor twice.
        if matches!(self.mode, ScoringMode::LockSpeed) && self.lock_speed_enabled {
            return Err(illegal(
                "scoring.lock_speed.enabled",
                "lock-speed is already the mode; the option would apply it twice",
            ));
        }
        if !self.speed_weight.is_finite() || self.speed_weight < 0.0 {
            return Err(illegal("scoring.speed_weight", "must be finite and >= 0"));
        }
        self.speed_window.validate()?;
        if self.speed_steps == Some(0) {
            return Err(illegal(
                "scoring.speed_steps",
                "zero bands is not a banding; clear it for the continuous slope",
            ));
        }
        self.difficulty_map.validate()
    }

    /// How much of the speed bonus this lock earns, `0.0..=1.0` (P11.12).
    ///
    /// `1.0` is an instant lock, `0.0` is a lock at or past the window's edge.
    /// With `speed_window: Fraction(1.0)` and no steps this is exactly
    /// `remaining / duration`, which is what P4 weighed.
    pub fn speed_progress(&self, remaining_ms_at_lock: u32, duration_ms: u32) -> f64 {
        let window_ms = self.speed_window.resolve(duration_ms);
        if window_ms == 0 {
            return 0.0;
        }
        let elapsed = duration_ms.saturating_sub(remaining_ms_at_lock.min(duration_ms));
        if elapsed >= window_ms {
            return 0.0;
        }
        let raw = 1.0 - f64::from(elapsed) / f64::from(window_ms);
        match self.speed_steps {
            // Every lock inside a band lands on the band's own value, so two
            // answers the operator cannot tell apart are worth the same.
            Some(steps) if steps > 0 => {
                let n = f64::from(steps);
                (raw * n).ceil().min(n) / n
            }
            _ => raw,
        }
    }
}

/// Both default to `false` (§2.5): no partial credit, and `{A,C}` equals
/// `{C,A}`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct JudgingSettings {
    /// On, a partly-correct lock scores the §4.4 share.
    pub partial_credit: bool,
    /// On, position is part of the answer and the outcome is binary.
    pub order_matters: bool,
}

/// A flat extra once a team strings together `count` correct answers on one
/// token (§4.4). Awarded once per token, at the answer that reaches `count`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ConsecutiveBonus {
    pub count: u32,
    pub award: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct TurnSettings {
    /// The cap: after this many consecutive corrects the token ends. The last
    /// answer still counts as correct and still scores (§4.4).
    pub max_consecutive_correct: Option<u32>,
    pub bonus_after_consecutive: Option<ConsecutiveBonus>,
}

impl TurnSettings {
    /// The §4.4 interlocks between the cap and the bonus.
    pub fn validate(&self) -> MatchResult<()> {
        // A cap of zero would end the token before the team answered anything,
        // and a bonus at zero corrects would pay for nothing.
        if self.max_consecutive_correct == Some(0) {
            return Err(illegal(
                "turn.max_consecutive_correct",
                "a cap of 0 would end the token before an answer; clear it instead",
            ));
        }
        let Some(bonus) = self.bonus_after_consecutive else {
            return Ok(());
        };
        if bonus.count == 0 {
            return Err(illegal(
                "turn.bonus_after_consecutive",
                "the streak must be at least 1 answer long",
            ));
        }
        // The cap ends the token *at* n corrects and the bonus lands *at*
        // count, so count > cap is a bonus that can never be paid.
        if let Some(cap) = self.max_consecutive_correct
            && bonus.count > cap
        {
            return Err(illegal(
                "turn.bonus_after_consecutive",
                "the streak is longer than the cap, so the bonus can never be reached",
            ));
        }
        Ok(())
    }
}

/// One level of the §2.18 cascade. `None` means "this level says nothing";
/// the next level down decides.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct TimerLevel {
    pub enabled: Option<bool>,
    pub duration_ms: Option<u32>,
}

impl TimerLevel {
    pub fn new(enabled: bool, duration_ms: u32) -> Self {
        TimerLevel {
            enabled: Some(enabled),
            duration_ms: Some(duration_ms),
        }
    }

    /// A countdown of zero is not operator pace. Turning `enabled` off is how
    /// an operator asks for that, and the host will not guess (§2.18).
    pub fn validate(&self, key: &'static str) -> MatchResult<()> {
        if self.duration_ms == Some(0) {
            return Err(illegal(
                key,
                "0 is not a countdown; turn the timer off for operator pace",
            ));
        }
        Ok(())
    }
}

/// The §2.18 cascade, frozen at `play_start`:
///
/// ```text
/// duration: question overlay → recipe timer.duration_ms → globals.timer.duration_ms
/// enabled:  recipe if set, else globals
/// ```
///
/// Disabled at the winning level means **operator pace**: no countdown, no
/// `start_timer`, no T=0 auto-lock, lock-speed weight disabled, Stage clock
/// hidden (§2.4). A duration nowhere in the cascade is operator pace too — the
/// host will not invent a number the operator never chose.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct TimerCascade {
    pub globals: TimerLevel,
    pub recipe: TimerLevel,
}

impl Default for TimerCascade {
    fn default() -> Self {
        TimerCascade {
            globals: TimerLevel::new(true, 30_000),
            recipe: TimerLevel::default(),
        }
    }
}

impl TimerCascade {
    /// Both levels, each named by its own §4.2 key so a notice can point at
    /// the field the operator actually edited.
    pub fn validate(&self) -> MatchResult<()> {
        self.globals.validate("globals.timer.duration_ms")?;
        self.recipe.validate("timer.duration_ms")
    }

    pub fn enabled(&self) -> bool {
        self.recipe.enabled.or(self.globals.enabled).unwrap_or(true)
    }

    /// The countdown for a question, `None` at operator pace.
    /// `question_duration_ms` is the per-question recipe overlay (§2.17).
    pub fn resolve(&self, question_duration_ms: Option<u32>) -> Option<u32> {
        if !self.enabled() {
            return None;
        }
        question_duration_ms
            .or(self.recipe.duration_ms)
            .or(self.globals.duration_ms)
            .filter(|ms| *ms > 0)
    }
}

/// Everything frozen at `play_start` (§2.5). Copied into `PlaySnapshot`, so a
/// catalog or settings edit during an open Play cannot reach it.
#[derive(Debug, Clone, PartialEq, Default, Serialize, Deserialize)]
pub struct FrozenSettings {
    pub scoring: ScoringSettings,
    pub judging: JudgingSettings,
    pub turn: TurnSettings,
    pub timer: TimerCascade,
}

impl FrozenSettings {
    /// The §4.2 interlocks over a resolved copy.
    ///
    /// `FlagService` runs the same checks before a key is ever written, so a
    /// snapshot built through it is legal by construction. This is the second
    /// line: `play_load` calls it, because a snapshot can also arrive from an
    /// older database row, and a Play that starts on an illegal document would
    /// score wrong for its whole life rather than fail loudly at the start.
    pub fn validate(&self) -> MatchResult<()> {
        self.scoring.validate()?;
        self.turn.validate()?;
        self.timer.validate()
    }
}

/// The language of Stage's **authored** text — HUD labels, screen titles,
/// verdict wording. Never of anything derived from the Play: team names,
/// domains, stems and options are shown as the author wrote them.
///
/// A Game default that is not game-affecting: a language switch mid-Play
/// moves no score, so it is not in [`FrozenSettings`] and never refused.
/// The tables themselves live on Stage (`apps/stage/src/copy`); the host only
/// says which one to read.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    #[default]
    En,
    Ro,
}

impl Language {
    pub fn as_str(self) -> &'static str {
        match self {
            Language::En => "en",
            Language::Ro => "ro",
        }
    }
}

/// One of the four reveal channels (§4.2). Mirrors `RevealChannel` in
/// `packages/contract/src/reveal.ts`: `answers` covers every option, so there
/// is no per-option mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RevealChannel {
    Question,
    Answers,
    Outcome,
    Leaderboard,
}

impl RevealChannel {
    pub const ALL: [RevealChannel; 4] = [
        RevealChannel::Question,
        RevealChannel::Answers,
        RevealChannel::Outcome,
        RevealChannel::Leaderboard,
    ];

    /// The §4.2 settings key, which is also the notice `target_path` (§14).
    pub fn key(self) -> &'static str {
        match self {
            RevealChannel::Question => "reveal.question",
            RevealChannel::Answers => "reveal.answers",
            RevealChannel::Outcome => "reveal.outcome",
            RevealChannel::Leaderboard => "reveal.leaderboard",
        }
    }
}

/// Who advances a reveal. `Operator` is the default everywhere (§4.2): the
/// show is operator-timed, and auto is the opt-in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum RevealMode {
    #[default]
    Operator,
    Auto,
}

impl RevealMode {
    pub fn as_str(self) -> &'static str {
        match self {
            RevealMode::Operator => "operator",
            RevealMode::Auto => "auto",
        }
    }
}

/// What a recipe's board may select (P12.7, §2.31).
///
/// Game-affecting: it decides what a Play can contain. Not in
/// [`FrozenSettings`] because the snapshot already *is* the board it allowed —
/// it is read where a board is written or a snapshot is built, from the recipe.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct BoardSettings {
    /// Several questions at one difficulty in one domain. Off by default: two
    /// at one difficulty pay the same and the team choosing cannot tell them
    /// apart. On, they are asked one after the other, `id ASC`.
    pub allow_repeated_difficulty: bool,
}

/// The four channels, each independently operator or auto. Serializes as the
/// `revealModes` record `PlayStateForStage` carries — a `Record<RevealChannel,
/// RevealMode>`, which is exactly these four keys.
///
/// Both a Game default and Control-behaviour (§4.2): the recipe carries the
/// opening value and the operator may change it mid-Play, so this is *not* in
/// [`FrozenSettings`].
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct RevealSettings {
    pub question: RevealMode,
    pub answers: RevealMode,
    pub outcome: RevealMode,
    pub leaderboard: RevealMode,
}

impl RevealSettings {
    pub fn get(&self, channel: RevealChannel) -> RevealMode {
        match channel {
            RevealChannel::Question => self.question,
            RevealChannel::Answers => self.answers,
            RevealChannel::Outcome => self.outcome,
            RevealChannel::Leaderboard => self.leaderboard,
        }
    }

    pub fn set(&mut self, channel: RevealChannel, mode: RevealMode) {
        match channel {
            RevealChannel::Question => self.question = mode,
            RevealChannel::Answers => self.answers = mode,
            RevealChannel::Outcome => self.outcome = mode,
            RevealChannel::Leaderboard => self.leaderboard = mode,
        }
    }
}

/// §2.6. Control-behaviour, so it may change mid-Play.
///
/// Both values still require a reveal before the token moves — reveal is the
/// only scoring point (§2.4), and §2.6 path 2 says so outright. What this key
/// decides is the Control affordance: `refuse_until_reveal` disables the
/// GiveToken button while a lock is unrevealed; `allow` shows it and offers the
/// two-click **Reveal & pass** (`MatchService::reveal_and_pass`).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OverrideAfterLock {
    #[default]
    RefuseUntilReveal,
    Allow,
}

/// Control-behaviour settings, live for the whole Play (§2.5).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct LiveSettings {
    pub override_after_lock: OverrideAfterLock,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_cascade_prefers_the_question_then_the_recipe_then_the_globals() {
        let cascade = TimerCascade {
            globals: TimerLevel::new(true, 30_000),
            recipe: TimerLevel {
                enabled: None,
                duration_ms: Some(20_000),
            },
        };
        assert_eq!(cascade.resolve(Some(45_000)), Some(45_000));
        assert_eq!(cascade.resolve(None), Some(20_000));

        let no_recipe_duration = TimerCascade {
            recipe: TimerLevel::default(),
            ..cascade
        };
        assert_eq!(no_recipe_duration.resolve(None), Some(30_000));
    }

    #[test]
    fn disabled_at_the_winning_level_is_operator_pace() {
        let recipe_off = TimerCascade {
            globals: TimerLevel::new(true, 30_000),
            recipe: TimerLevel {
                enabled: Some(false),
                duration_ms: Some(20_000),
            },
        };
        assert!(!recipe_off.enabled());
        assert_eq!(recipe_off.resolve(Some(45_000)), None);

        let globals_off = TimerCascade {
            globals: TimerLevel::new(false, 30_000),
            recipe: TimerLevel::default(),
        };
        assert_eq!(globals_off.resolve(None), None);
    }

    #[test]
    fn a_duration_nowhere_in_the_cascade_is_operator_pace() {
        let empty = TimerCascade {
            globals: TimerLevel {
                enabled: Some(true),
                duration_ms: None,
            },
            recipe: TimerLevel::default(),
        };
        assert_eq!(empty.resolve(None), None);
    }

    #[test]
    fn difficulty_bands_read_in_any_authored_order() {
        let map = DifficultyMap::Bands {
            bands: vec![
                DifficultyBand {
                    up_to: 100,
                    points: 300,
                },
                DifficultyBand {
                    up_to: 33,
                    points: 100,
                },
                DifficultyBand {
                    up_to: 66,
                    points: 200,
                },
            ],
        };
        assert_eq!(map.points(1), 100);
        assert_eq!(map.points(33), 100);
        assert_eq!(map.points(34), 200);
        assert_eq!(map.points(100), 300);
    }
}
