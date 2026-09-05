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
    pub fn points(&self, difficulty: u8) -> u32 {
        match self {
            DifficultyMap::Linear { factor } => {
                (f64::from(difficulty) * factor).floor().max(0.0) as u32
            }
            DifficultyMap::Bands { bands } => {
                let mut sorted: Vec<&DifficultyBand> = bands.iter().collect();
                sorted.sort_by_key(|b| b.up_to);
                sorted
                    .iter()
                    .find(|b| difficulty <= b.up_to)
                    .or_else(|| sorted.last())
                    .map(|b| b.points)
                    .unwrap_or(0)
            }
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
        }
    }
}

impl ScoringSettings {
    /// True when the lock-speed factor applies at all — exclusive mode, or the
    /// option switched on. The two are never combined (§2.3).
    pub fn uses_lock_speed(&self) -> bool {
        matches!(self.mode, ScoringMode::LockSpeed) || self.lock_speed_enabled
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
