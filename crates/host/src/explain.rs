//! Why a team was awarded what it was awarded (P11.12).
//!
//! [`award::award_points`](crate::award::award_points) answers *how much*. This
//! module answers *why*, and the two cannot disagree because `award_points` is
//! `explain(..).points` — there is one arithmetic, written once, and the
//! Statistics ledger reads the same steps the scoreboard was paid from.
//!
//! ```text
//! base ──┬─ flat_points                 mode=flat, or lock_speed & base=flat
//!        └─ difficulty_map(difficulty)  mode=difficulty, or lock_speed & base=difficulty
//! ×speed ─ 1 + speed_weight × progress  (progress: §2.3 + the P11.12 window)
//! scaled = floor(base × speed)
//! verdict → scaled | share of scaled | 0
//! +bonus  → the streak award, once per token
//! ```
//!
//! **The award is a pure function of `(difficulty, verdict, lock progress,
//! streak)` and the frozen settings.** It never reads the domain, the team, the
//! round or the position in the board, which is why difficulty 21 pays the same
//! everywhere — a property test in `tests/award_compound.rs` holds that down.

use serde::{Deserialize, Serialize};

use crate::rules::{Judgement, Verdict};
use crate::settings::{
    BandSpan, ConsecutiveBonus, DifficultyMap, JudgingSettings, LockSpeedBase, ScoringMode,
    ScoringSettings,
};

/// Which base was read, and everything needed to say so in words.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BaseSource {
    Flat {
        points: u32,
    },
    Linear {
        factor: f64,
        difficulty: u8,
    },
    /// The band that paid. `above_last` means the difficulty ran off the end of
    /// the table and took the last band's award (§4.1).
    Band {
        #[serde(flatten)]
        span: BandSpan,
        above_last: bool,
    },
    /// A band table with no bands. Validation refuses one, but a snapshot from
    /// an older build could carry it, and "0 because there was no table" is a
    /// better answer than a silent zero.
    NoBands,
}

/// Why the speed factor was exactly `1.0`. Five distinct ways a weight the
/// operator set can do nothing — each of them worth saying out loud.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SpeedOff {
    /// Neither the exclusive mode nor the option is on.
    ModeOff,
    /// The Play runs at operator pace, so there is no clock to weigh (§2.18).
    OperatorPace,
    /// An empty reveal: nothing was ever locked.
    NeverLocked,
    /// `speed_weight` is 0, which §4.2 keeps as a legal value.
    WeightZero,
    /// The lock landed at or past `speed_window` (P11.12).
    OutsideWindow,
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum SpeedFactor {
    Off {
        reason: SpeedOff,
    },
    On {
        weight: f64,
        /// The countdown this question was issued with (§2.18's answer).
        duration_ms: u32,
        /// How much of it counted for speed.
        window_ms: u32,
        elapsed_ms: u32,
        remaining_ms: u32,
        /// The banding, when `scoring.speed_steps` is set.
        steps: Option<u32>,
        /// `0.0..=1.0` — the share of the bonus this lock earned.
        progress: f64,
        /// `1 + weight × progress`.
        multiplier: f64,
    },
}

impl SpeedFactor {
    pub fn multiplier(&self) -> f64 {
        match self {
            SpeedFactor::Off { .. } => 1.0,
            SpeedFactor::On { multiplier, .. } => *multiplier,
        }
    }
}

/// The §4.4 share a partly-correct lock takes, when partial credit is on.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PartialShare {
    pub correct_locked: u32,
    pub incorrect_locked: u32,
    pub correct_total: u32,
    /// `(correct − incorrect) / total`, floored at 0.
    pub share: f64,
}

/// The streak bonus, when this answer is the one that reached the count.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BonusAward {
    /// Consecutive corrects on this token, including this answer.
    pub streak: u32,
    pub count: u32,
    pub award: u32,
}

/// One award, step by step, in the order the steps are applied.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AwardBreakdown {
    pub judgement: Judgement,
    pub base: u32,
    pub base_from: BaseSource,
    pub speed: SpeedFactor,
    /// `floor(base × multiplier)` — before the verdict has its say.
    pub scaled: u32,
    pub share: Option<PartialShare>,
    /// What the question paid. This is the number `award_points` returns.
    pub points: u32,
    pub bonus: Option<BonusAward>,
    /// `points + bonus` — the number the scoreboard moved by.
    pub total: u32,
}

impl AwardBreakdown {
    /// Attach the streak bonus. `reveal_outcome` decides whether one is due —
    /// it needs the Play's consecutive count, which this module never sees.
    pub fn with_bonus(mut self, bonus: Option<BonusAward>) -> Self {
        self.total = self.points + bonus.map_or(0, |b| b.award);
        self.bonus = bonus;
        self
    }
}

/// Whether a streak bonus is due for a correct answer at this streak length.
/// One place, so `reveal_outcome` and the Statistics ledger agree about which
/// answer in a run is the one that pays.
pub fn bonus_for(
    bonus: Option<ConsecutiveBonus>,
    verdict: Verdict,
    streak: u32,
) -> Option<BonusAward> {
    let bonus = bonus?;
    (verdict == Verdict::Correct && streak == bonus.count).then_some(BonusAward {
        streak,
        count: bonus.count,
        award: bonus.award,
    })
}

/// Every step of one award. Pure, and the only place the formula exists.
pub fn explain(
    scoring: &ScoringSettings,
    judging: &JudgingSettings,
    difficulty: u8,
    judgement: &Judgement,
    remaining_ms_at_lock: Option<u32>,
    duration_ms: Option<u32>,
) -> AwardBreakdown {
    let base_from = base_source(scoring, difficulty);
    let base = base_of(&base_from);
    let speed = speed_factor(scoring, remaining_ms_at_lock, duration_ms);
    let scaled_f = (f64::from(base) * speed.multiplier()).floor().max(0.0);
    let scaled = scaled_f as u32;

    let (points, share) = match judgement.verdict {
        Verdict::Correct => (scaled, None),
        // Only a *partial* verdict can take a share. An incorrect lock is zero
        // even with partial credit on — otherwise a right set in the wrong
        // order would score full marks under `judging.order_matters`.
        Verdict::Partial if judging.partial_credit && judgement.correct_total > 0 => {
            let net = f64::from(judgement.correct_locked) - f64::from(judgement.incorrect_locked);
            // A part is never more than the whole. `judge` cannot produce more
            // correct locks than there are correct options, but this function
            // is public and the ledger re-judges from logs, so the clamp is
            // where the rule is written rather than where it is assumed.
            let share = (net / f64::from(judgement.correct_total)).clamp(0.0, 1.0);
            (
                (scaled_f * share).floor().max(0.0) as u32,
                Some(PartialShare {
                    correct_locked: judgement.correct_locked,
                    incorrect_locked: judgement.incorrect_locked,
                    correct_total: judgement.correct_total,
                    share,
                }),
            )
        }
        _ => (0, None),
    };

    AwardBreakdown {
        judgement: *judgement,
        base,
        base_from,
        speed,
        scaled,
        share,
        points,
        bonus: None,
        total: points,
    }
}

/// Which base this scoring path reads, resolved against the difficulty.
pub fn base_source(scoring: &ScoringSettings, difficulty: u8) -> BaseSource {
    let flat = BaseSource::Flat {
        points: scoring.flat_points,
    };
    let by_difficulty = || match &scoring.difficulty_map {
        DifficultyMap::Linear { factor } => BaseSource::Linear {
            factor: *factor,
            difficulty,
        },
        map @ DifficultyMap::Bands { .. } => match map.band_for(difficulty) {
            Some((span, above_last)) => BaseSource::Band { span, above_last },
            None => BaseSource::NoBands,
        },
    };
    match scoring.mode {
        ScoringMode::Flat => flat,
        ScoringMode::Difficulty => by_difficulty(),
        ScoringMode::LockSpeed => match scoring.lock_speed_base {
            LockSpeedBase::Flat => flat,
            LockSpeedBase::Difficulty => by_difficulty(),
        },
    }
}

fn base_of(source: &BaseSource) -> u32 {
    match source {
        BaseSource::Flat { points } => *points,
        BaseSource::Linear { factor, difficulty } => {
            (f64::from(*difficulty) * factor).floor().max(0.0) as u32
        }
        BaseSource::Band { span, .. } => span.points,
        BaseSource::NoBands => 0,
    }
}

/// The speed factor, and why it is what it is.
pub fn speed_factor(
    scoring: &ScoringSettings,
    remaining_ms_at_lock: Option<u32>,
    duration_ms: Option<u32>,
) -> SpeedFactor {
    let off = |reason| SpeedFactor::Off { reason };
    if !scoring.uses_lock_speed() {
        return off(SpeedOff::ModeOff);
    }
    if scoring.speed_weight <= 0.0 || !scoring.speed_weight.is_finite() {
        return off(SpeedOff::WeightZero);
    }
    let Some(duration_ms) = duration_ms.filter(|d| *d > 0) else {
        return off(SpeedOff::OperatorPace);
    };
    let Some(remaining) = remaining_ms_at_lock else {
        return off(SpeedOff::NeverLocked);
    };
    let remaining_ms = remaining.min(duration_ms);
    let window_ms = scoring.speed_window.resolve(duration_ms);
    let progress = scoring.speed_progress(remaining_ms, duration_ms);
    if progress <= 0.0 {
        return off(SpeedOff::OutsideWindow);
    }
    SpeedFactor::On {
        weight: scoring.speed_weight,
        duration_ms,
        window_ms,
        elapsed_ms: duration_ms - remaining_ms,
        remaining_ms,
        steps: scoring.speed_steps,
        progress,
        multiplier: 1.0 + scoring.speed_weight * progress,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::award::award_points;
    use crate::settings::{DifficultyBand, SpeedWindow};

    fn correct() -> Judgement {
        Judgement {
            verdict: Verdict::Correct,
            correct_locked: 1,
            incorrect_locked: 0,
            correct_total: 1,
        }
    }

    fn scoring(window: SpeedWindow, steps: Option<u32>) -> ScoringSettings {
        ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 100,
            difficulty_map: DifficultyMap::Linear { factor: 10.0 },
            speed_weight: 1.0,
            lock_speed_enabled: true,
            lock_speed_base: LockSpeedBase::Flat,
            speed_window: window,
            speed_steps: steps,
        }
    }

    #[test]
    fn the_default_window_is_the_p4_formula() {
        let s = scoring(SpeedWindow::Fraction(1.0), None);
        // Locked with half the clock left: 100 * (1 + 1 * 0.5) = 150.
        let b = explain(
            &s,
            &JudgingSettings::default(),
            50,
            &correct(),
            Some(15_000),
            Some(30_000),
        );
        assert_eq!(b.points, 150);
        assert_eq!(b.speed.multiplier(), 1.5);
    }

    #[test]
    fn a_third_of_the_clock_stops_paying_after_a_third() {
        let s = scoring(SpeedWindow::Fraction(1.0 / 3.0), None);
        let judging = JudgingSettings::default();
        // 10s window on a 30s clock. Locked at 5s elapsed → half the window
        // left → 100 * 1.5 = 150.
        assert_eq!(
            explain(&s, &judging, 50, &correct(), Some(25_000), Some(30_000)).points,
            150
        );
        // Locked at 11s elapsed — past the window. Base, and it says why.
        let late = explain(&s, &judging, 50, &correct(), Some(19_000), Some(30_000));
        assert_eq!(late.points, 100);
        assert!(matches!(
            late.speed,
            SpeedFactor::Off {
                reason: SpeedOff::OutsideWindow
            }
        ));
    }

    #[test]
    fn an_absolute_window_is_worth_the_same_on_any_clock() {
        let s = scoring(SpeedWindow::Ms(10_000), None);
        let judging = JudgingSettings::default();
        // One second to answer, on a 30s clock and on a 12s clock: both are
        // 1s into a 10s window, so both pay the same.
        let long = explain(&s, &judging, 50, &correct(), Some(29_000), Some(30_000));
        let short = explain(&s, &judging, 50, &correct(), Some(11_000), Some(12_000));
        assert_eq!(long.points, short.points);
        assert_eq!(long.points, 190); // 100 * (1 + 0.9)
    }

    #[test]
    fn steps_pay_every_lock_in_a_band_the_same() {
        let s = scoring(SpeedWindow::Fraction(1.0), Some(3));
        let judging = JudgingSettings::default();
        let at = |remaining| explain(&s, &judging, 50, &correct(), Some(remaining), Some(30_000)).points;
        // Top band (more than 2/3 of the clock left) is the full weight.
        assert_eq!(at(30_000), 200);
        assert_eq!(at(21_000), 200);
        // Middle band.
        assert_eq!(at(20_000), 166);
        assert_eq!(at(11_000), 166);
        // Bottom band.
        assert_eq!(at(10_000), 133);
        assert_eq!(at(1), 133);
    }

    #[test]
    fn the_band_that_paid_is_named() {
        let mut s = scoring(SpeedWindow::default(), None);
        s.mode = ScoringMode::Difficulty;
        s.lock_speed_enabled = false;
        s.difficulty_map = DifficultyMap::Bands {
            bands: vec![
                DifficultyBand {
                    up_to: 33,
                    points: 10,
                },
                DifficultyBand {
                    up_to: 66,
                    points: 20,
                },
            ],
        };
        let b = explain(&s, &JudgingSettings::default(), 40, &correct(), None, None);
        let BaseSource::Band { span, above_last } = b.base_from else {
            panic!("expected a band, got {:?}", b.base_from);
        };
        assert_eq!((span.index, span.from, span.up_to, span.points), (1, 34, 66, 20));
        assert!(!above_last);

        // A difficulty past the last band takes the last band's award, and the
        // breakdown says that is what happened.
        let over = explain(&s, &JudgingSettings::default(), 90, &correct(), None, None);
        let BaseSource::Band { above_last, .. } = over.base_from else {
            panic!("expected a band");
        };
        assert!(above_last);
    }

    #[test]
    fn explain_and_award_points_agree() {
        let s = scoring(SpeedWindow::Fraction(0.5), Some(4));
        let judging = JudgingSettings {
            partial_credit: true,
            order_matters: false,
        };
        let j = Judgement {
            verdict: Verdict::Partial,
            correct_locked: 2,
            incorrect_locked: 1,
            correct_total: 3,
        };
        for remaining in [0, 1, 7_500, 15_000, 29_999, 30_000] {
            assert_eq!(
                explain(&s, &judging, 60, &j, Some(remaining), Some(30_000)).points,
                award_points(&s, &judging, 60, &j, Some(remaining), Some(30_000)),
            );
        }
    }
}
