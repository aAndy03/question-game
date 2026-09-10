//! Points (§2.3, §4.4).
//!
//! ```text
//! base   = flat_points | f(difficulty)
//! points = floor(base * (1 + speed_weight * progress))
//! ```
//!
//! **The formula lives in [`crate::explain`], not here.** This module is the
//! three names the rest of the host calls — `base_points`, `speed_multiplier`,
//! `award_points` — and each is one line of that breakdown. There is one
//! arithmetic, so the Statistics ledger explains the number the scoreboard was
//! actually paid (P11.12); before that split, a second copy of the formula was
//! the obvious way for the two to drift.
//!
//! Three things this module still refuses to do:
//!
//! - **Double-apply the speed factor.** The exclusive lock-speed mode and the
//!   option on flat/difficulty are one factor, computed once (§2.3).
//! - **Score anything but a reveal.** It is a pure function; `reveal_outcome`
//!   is the only caller that writes the result (§2.4).
//! - **Invent a speed factor at operator pace.** No duration means no weight.

use crate::explain::{self, SpeedFactor};
use crate::rules::Judgement;
use crate::settings::{JudgingSettings, ScoringSettings};

/// The base before any speed factor.
pub fn base_points(scoring: &ScoringSettings, difficulty: u8) -> u32 {
    explain::explain(
        scoring,
        &JudgingSettings::default(),
        difficulty,
        &Judgement::correct(),
        None,
        None,
    )
    .base
}

/// `1 + speed_weight * progress`, or exactly `1.0` when lock-speed is off,
/// when the Play runs at operator pace, when the answer was never locked (an
/// empty reveal), or when the lock fell outside `scoring.speed_window`.
/// Weight `0` also equals the base.
pub fn speed_multiplier(
    scoring: &ScoringSettings,
    remaining_ms_at_lock: Option<u32>,
    duration_ms: Option<u32>,
) -> f64 {
    explain::speed_factor(scoring, remaining_ms_at_lock, duration_ms).multiplier()
}

/// Points for one revealed outcome. Wrong or empty is `0`; a partial lock is
/// `0` unless partial credit is on, and then it is the §4.4 share of whatever
/// the speed factor already produced.
pub fn award_points(
    scoring: &ScoringSettings,
    judging: &JudgingSettings,
    difficulty: u8,
    judgement: &Judgement,
    remaining_ms_at_lock: Option<u32>,
    duration_ms: Option<u32>,
) -> u32 {
    explain::explain(
        scoring,
        judging,
        difficulty,
        judgement,
        remaining_ms_at_lock,
        duration_ms,
    )
    .points
}

/// Whether the speed factor did anything, and why not when it did not.
pub fn speed_state(
    scoring: &ScoringSettings,
    remaining_ms_at_lock: Option<u32>,
    duration_ms: Option<u32>,
) -> SpeedFactor {
    explain::speed_factor(scoring, remaining_ms_at_lock, duration_ms)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::rules::Verdict;
    use crate::settings::{DifficultyMap, LockSpeedBase, ScoringMode};

    fn correct() -> Judgement {
        Judgement {
            verdict: Verdict::Correct,
            correct_locked: 1,
            incorrect_locked: 0,
            correct_total: 1,
        }
    }

    fn partial() -> Judgement {
        Judgement {
            verdict: Verdict::Partial,
            correct_locked: 2,
            incorrect_locked: 1,
            correct_total: 3,
        }
    }

    fn wrong() -> Judgement {
        Judgement {
            verdict: Verdict::Incorrect,
            correct_locked: 0,
            incorrect_locked: 1,
            correct_total: 2,
        }
    }

    fn flat(weight: f64, lock_speed: bool) -> ScoringSettings {
        ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 100,
            difficulty_map: DifficultyMap::Linear { factor: 10.0 },
            speed_weight: weight,
            lock_speed_enabled: lock_speed,
            lock_speed_base: LockSpeedBase::Flat,
            ..ScoringSettings::default()
        }
    }

    #[test]
    fn flat_ignores_difficulty_and_difficulty_ignores_flat() {
        let judging = JudgingSettings::default();
        assert_eq!(
            award_points(&flat(0.0, false), &judging, 70, &correct(), None, None),
            100,
        );
        let by_difficulty = ScoringSettings {
            mode: ScoringMode::Difficulty,
            ..flat(0.0, false)
        };
        assert_eq!(
            award_points(&by_difficulty, &judging, 70, &correct(), None, None),
            700,
        );
    }

    #[test]
    fn weight_zero_equals_the_base() {
        let scoring = flat(0.0, true);
        assert_eq!(
            award_points(
                &scoring,
                &JudgingSettings::default(),
                50,
                &correct(),
                Some(30_000),
                Some(30_000),
            ),
            100,
        );
    }

    #[test]
    fn the_exclusive_mode_and_the_option_produce_the_same_number() {
        let judging = JudgingSettings::default();
        let option = flat(1.0, true);
        let exclusive = ScoringSettings {
            mode: ScoringMode::LockSpeed,
            lock_speed_enabled: true,
            lock_speed_base: LockSpeedBase::Flat,
            ..flat(1.0, true)
        };
        // Locked with half the clock left: 100 * (1 + 1 * 0.5) = 150. Not 225,
        // which is what applying the factor twice would give.
        let with_option = award_points(
            &option,
            &judging,
            50,
            &correct(),
            Some(15_000),
            Some(30_000),
        );
        let with_exclusive = award_points(
            &exclusive,
            &judging,
            50,
            &correct(),
            Some(15_000),
            Some(30_000),
        );
        assert_eq!(with_option, 150);
        assert_eq!(with_exclusive, 150);
    }

    #[test]
    fn operator_pace_disables_the_speed_weight() {
        let scoring = flat(1.0, true);
        assert_eq!(
            award_points(
                &scoring,
                &JudgingSettings::default(),
                50,
                &correct(),
                None,
                None
            ),
            100,
        );
    }

    #[test]
    fn wrong_and_empty_score_zero() {
        let scoring = flat(1.0, true);
        assert_eq!(
            award_points(
                &scoring,
                &JudgingSettings::default(),
                50,
                &wrong(),
                Some(30_000),
                Some(30_000),
            ),
            0,
        );
    }

    #[test]
    fn partial_credit_is_off_by_default_and_is_a_share_when_on() {
        let scoring = flat(0.0, false);
        let off = JudgingSettings::default();
        assert_eq!(award_points(&scoring, &off, 50, &partial(), None, None), 0,);

        let on = JudgingSettings {
            partial_credit: true,
            ..off
        };
        // (2 correct - 1 incorrect) / 3 correct total = 1/3 of 100.
        assert_eq!(award_points(&scoring, &on, 50, &partial(), None, None), 33);
    }

    #[test]
    fn partial_credit_never_pays_an_incorrect_lock() {
        let on = JudgingSettings {
            partial_credit: true,
            order_matters: true,
        };
        // Every correct option locked, but in the wrong order: judging calls it
        // incorrect, and partial credit must not pay it the full share.
        let right_set_wrong_order = Judgement {
            verdict: Verdict::Incorrect,
            correct_locked: 2,
            incorrect_locked: 0,
            correct_total: 2,
        };
        assert_eq!(
            award_points(
                &flat(0.0, false),
                &on,
                50,
                &right_set_wrong_order,
                None,
                None
            ),
            0,
        );
    }

    #[test]
    fn partial_credit_never_goes_negative() {
        let scoring = flat(0.0, false);
        let on = JudgingSettings {
            partial_credit: true,
            order_matters: false,
        };
        let mostly_wrong = Judgement {
            verdict: Verdict::Partial,
            correct_locked: 1,
            incorrect_locked: 3,
            correct_total: 2,
        };
        assert_eq!(
            award_points(&scoring, &on, 50, &mostly_wrong, None, None),
            0,
        );
    }
}
