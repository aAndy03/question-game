//! P11.12 exit criterion 1: the award behaves the same way over the whole
//! compound space, not just over the combinations anyone thought to write a
//! fixture for.
//!
//! Fourteen settings can move a number and four of them neutralise others.
//! Every property here is something an operator would say out loud about the
//! rules — "difficulty 21 always pays the same", "wrong is always zero",
//! "answering at the same moment is always worth the same" — asserted over
//! generated documents rather than over four-team examples.
//!
//! The space:
//!
//! ```text
//! mode          flat | difficulty | lock_speed
//! lock base     flat | difficulty                (lock_speed only)
//! lock option   on | off                         (the other two only)
//! weight        0.0 .. 4.0
//! window        Fraction(0.05..=1.0) | Ms(500..=60_000)
//! steps         none | 1..=10
//! map           linear(0..=20) | bands(1..=6)
//! partial       on | off
//! order         on | off
//! duration      none (operator pace) | 1s .. 120s
//! ```

use proptest::prelude::*;
use questiongame_host::award::{award_points, base_points, speed_multiplier};
use questiongame_host::explain::{self, BaseSource, SpeedFactor, SpeedOff};
use questiongame_host::rules::{Judgement, Verdict};
use questiongame_host::settings::{
    DifficultyBand, DifficultyMap, JudgingSettings, LockSpeedBase, ScoringMode, ScoringSettings,
    SpeedWindow,
};

// ------------------------------------------------------------------ strategies

fn difficulty_map() -> impl Strategy<Value = DifficultyMap> {
    prop_oneof![
        (0.0f64..=20.0).prop_map(|factor| DifficultyMap::Linear { factor }),
        proptest::collection::vec((1u8..=100, 0u32..=500), 1..=6).prop_map(|raw| {
            DifficultyMap::Bands {
                bands: raw
                    .into_iter()
                    .map(|(up_to, points)| DifficultyBand { up_to, points })
                    .collect(),
            }
        }),
    ]
}

fn speed_window() -> impl Strategy<Value = SpeedWindow> {
    prop_oneof![
        (0.05f64..=1.0).prop_map(SpeedWindow::Fraction),
        (500u32..=60_000).prop_map(SpeedWindow::Ms),
    ]
}

fn scoring() -> impl Strategy<Value = ScoringSettings> {
    (
        prop_oneof![
            Just(ScoringMode::Flat),
            Just(ScoringMode::Difficulty),
            Just(ScoringMode::LockSpeed),
        ],
        0u32..=1000,
        difficulty_map(),
        0.0f64..=4.0,
        any::<bool>(),
        prop_oneof![Just(LockSpeedBase::Flat), Just(LockSpeedBase::Difficulty)],
        speed_window(),
        proptest::option::of(1u32..=10),
    )
        .prop_map(
            |(
                mode,
                flat_points,
                difficulty_map,
                speed_weight,
                lock_speed_enabled,
                lock_speed_base,
                speed_window,
                speed_steps,
            )| {
                ScoringSettings {
                    mode,
                    flat_points,
                    difficulty_map,
                    speed_weight,
                    // §2.3: the exclusive mode and the option are never both
                    // on — a document that says so is refused, so the space
                    // never generates one.
                    lock_speed_enabled: !matches!(mode, ScoringMode::LockSpeed)
                        && lock_speed_enabled,
                    lock_speed_base,
                    speed_window,
                    speed_steps,
                }
            },
        )
}

fn judging() -> impl Strategy<Value = JudgingSettings> {
    (any::<bool>(), any::<bool>()).prop_map(|(partial_credit, order_matters)| JudgingSettings {
        partial_credit,
        order_matters,
    })
}

fn judgement() -> impl Strategy<Value = Judgement> {
    (
        prop_oneof![
            Just(Verdict::Correct),
            Just(Verdict::Incorrect),
            Just(Verdict::Partial),
        ],
        0u32..=5,
        0u32..=5,
        1u32..=5,
    )
        .prop_map(|(verdict, correct_locked, incorrect_locked, correct_total)| Judgement {
            verdict,
            correct_locked,
            incorrect_locked,
            correct_total,
        })
}

/// A countdown, or operator pace.
fn duration() -> impl Strategy<Value = Option<u32>> {
    proptest::option::of(1_000u32..=120_000)
}

proptest! {
    #![proptest_config(ProptestConfig::with_cases(400))]

    /// Every document is legal, or it is refused. There is no third state, and
    /// `play_load` runs this same table over a snapshot from the database.
    #[test]
    fn a_generated_document_is_either_legal_or_refused(scoring in scoring()) {
        // The generator never builds the one combination §2.3 forbids, so
        // everything it produces has to validate.
        prop_assert!(scoring.validate().is_ok(), "{scoring:?}");
    }

    /// The formula exists once. `award_points` is `explain(..).points`, and
    /// `base_points` / `speed_multiplier` are the same breakdown's fields.
    #[test]
    fn award_points_is_the_breakdown(
        scoring in scoring(),
        judging in judging(),
        difficulty in 1u8..=100,
        judgement in judgement(),
        duration in duration(),
        locked in proptest::option::of(0u32..=120_000),
    ) {
        let remaining = locked.map(|ms| ms.min(duration.unwrap_or(0)));
        let breakdown = explain::explain(
            &scoring, &judging, difficulty, &judgement, remaining, duration,
        );
        prop_assert_eq!(
            breakdown.points,
            award_points(&scoring, &judging, difficulty, &judgement, remaining, duration),
        );
        prop_assert_eq!(breakdown.base, base_points(&scoring, difficulty));
        prop_assert_eq!(
            breakdown.speed.multiplier(),
            speed_multiplier(&scoring, remaining, duration),
        );
        // The scaled figure is the base and the factor, applied once.
        prop_assert_eq!(
            breakdown.scaled,
            (f64::from(breakdown.base) * breakdown.speed.multiplier()).floor() as u32,
        );
    }

    /// The operator's rule: the award depends on the difficulty, the verdict,
    /// how fast it was locked and the streak — and on nothing else. Two
    /// questions at difficulty 21 pay the same whatever domain, team, round or
    /// board position they came from, because none of those is an input.
    #[test]
    fn the_same_difficulty_and_the_same_lock_always_pay_the_same(
        scoring in scoring(),
        judging in judging(),
        difficulty in 1u8..=100,
        judgement in judgement(),
        duration in duration(),
        remaining in 0u32..=120_000,
    ) {
        let remaining = Some(remaining.min(duration.unwrap_or(0)));
        let once = award_points(&scoring, &judging, difficulty, &judgement, remaining, duration);
        let twice = award_points(&scoring, &judging, difficulty, &judgement, remaining, duration);
        prop_assert_eq!(once, twice);
    }

    /// A wrong answer is zero, whatever else is set. Partial credit does not
    /// pay an incorrect lock — otherwise a right set in the wrong order would
    /// score full marks under `order_matters` (§4.4).
    #[test]
    fn incorrect_is_always_zero(
        scoring in scoring(),
        judging in judging(),
        difficulty in 1u8..=100,
        duration in duration(),
        remaining in 0u32..=120_000,
        correct_locked in 0u32..=5,
        correct_total in 1u32..=5,
    ) {
        let judgement = Judgement {
            verdict: Verdict::Incorrect,
            correct_locked,
            incorrect_locked: 1,
            correct_total,
        };
        prop_assert_eq!(
            award_points(&scoring, &judging, difficulty, &judgement,
                         Some(remaining.min(duration.unwrap_or(0))), duration),
            0,
        );
    }

    /// The speed factor is applied exactly once. The exclusive mode and the
    /// option are the same factor over the same base, so they produce the
    /// identical number — never the square of it (§2.3).
    #[test]
    fn the_mode_and_the_option_are_one_factor(
        flat_points in 0u32..=1000,
        speed_weight in 0.0f64..=4.0,
        window in speed_window(),
        steps in proptest::option::of(1u32..=10),
        duration in 1_000u32..=120_000,
        remaining in 0u32..=120_000,
    ) {
        let base = ScoringSettings {
            flat_points,
            speed_weight,
            speed_window: window,
            speed_steps: steps,
            lock_speed_base: LockSpeedBase::Flat,
            ..ScoringSettings::default()
        };
        let option = ScoringSettings { mode: ScoringMode::Flat, lock_speed_enabled: true, ..base.clone() };
        let exclusive = ScoringSettings { mode: ScoringMode::LockSpeed, lock_speed_enabled: false, ..base };
        let judging = JudgingSettings::default();
        let remaining = Some(remaining.min(duration));
        prop_assert_eq!(
            award_points(&option, &judging, 50, &Judgement::correct(), remaining, Some(duration)),
            award_points(&exclusive, &judging, 50, &Judgement::correct(), remaining, Some(duration)),
        );
    }

    /// Operator pace has no clock to weigh, so the factor is exactly 1.0 and
    /// the breakdown says which of the five reasons it was (§2.18).
    #[test]
    fn operator_pace_and_an_empty_reveal_never_weight(
        scoring in scoring(),
        judging in judging(),
        difficulty in 1u8..=100,
        remaining in 0u32..=120_000,
    ) {
        let j = Judgement::correct();
        // No duration at all: operator pace.
        let paced = explain::explain(&scoring, &judging, difficulty, &j, Some(remaining), None);
        prop_assert_eq!(paced.speed.multiplier(), 1.0);
        prop_assert_eq!(paced.points, paced.base);

        // A clock, but nothing was ever locked.
        let empty = explain::explain(&scoring, &judging, difficulty, &j, None, Some(30_000));
        prop_assert_eq!(empty.speed.multiplier(), 1.0);
        let never_weighted = matches!(
            empty.speed,
            SpeedFactor::Off {
                reason: SpeedOff::ModeOff | SpeedOff::WeightZero | SpeedOff::NeverLocked,
            }
        );
        prop_assert!(never_weighted, "{:?}", empty.speed);
    }

    /// P11.12's own rule: with `speed_steps`, every lock inside a band is worth
    /// *identically* the same. This is the strongest form of the operator's
    /// "predictable" — two answers they cannot tell apart cannot score
    /// differently.
    #[test]
    fn a_band_of_the_speed_window_pays_one_number(
        speed_weight in 0.1f64..=4.0,
        steps in 1u32..=10,
        duration in 10_000u32..=120_000,
        band in 0u32..=9,
        a in 0.0f64..=1.0,
        b in 0.0f64..=1.0,
    ) {
        let steps = steps.max(band + 1);
        let scoring = ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 1000,
            speed_weight,
            lock_speed_enabled: true,
            speed_window: SpeedWindow::Fraction(1.0),
            speed_steps: Some(steps),
            ..ScoringSettings::default()
        };
        // Two elapsed times strictly inside the same band of the window.
        let width = f64::from(duration) / f64::from(steps);
        let lo = f64::from(band) * width;
        let pick = |t: f64| {
            let elapsed = lo + t * width * 0.98 + width * 0.01;
            duration - (elapsed.min(f64::from(duration) - 1.0) as u32)
        };
        let judging = JudgingSettings::default();
        let at = |remaining| award_points(
            &scoring, &judging, 50, &Judgement::correct(), Some(remaining), Some(duration),
        );
        prop_assert_eq!(at(pick(a)), at(pick(b)));
    }

    /// A lock at or past the window earns nothing extra, and says so — which is
    /// the whole point of "no speed bonus after a third of the clock".
    #[test]
    fn past_the_window_is_the_bare_base(
        speed_weight in 0.1f64..=4.0,
        share in 0.05f64..=0.9,
        duration in 10_000u32..=120_000,
        over in 1u32..=5_000,
    ) {
        let scoring = ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 500,
            speed_weight,
            lock_speed_enabled: true,
            speed_window: SpeedWindow::Fraction(share),
            ..ScoringSettings::default()
        };
        let window = scoring.speed_window.resolve(duration);
        let elapsed = (window + over).min(duration);
        let remaining = duration - elapsed;
        let b = explain::explain(
            &scoring, &JudgingSettings::default(), 50, &Judgement::correct(),
            Some(remaining), Some(duration),
        );
        prop_assert_eq!(b.points, 500);
        let outside = matches!(
            b.speed,
            SpeedFactor::Off {
                reason: SpeedOff::OutsideWindow,
            }
        );
        prop_assert!(outside, "{:?}", b.speed);
    }

    /// An absolute window makes the same answer *time* worth the same on any
    /// clock — the case a per-question duration override used to break.
    #[test]
    fn an_absolute_window_ignores_the_clock(
        speed_weight in 0.1f64..=4.0,
        window_ms in 1_000u32..=20_000,
        elapsed in 0u32..=20_000,
        short in 25_000u32..=40_000,
        long in 60_000u32..=120_000,
    ) {
        let scoring = ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points: 400,
            speed_weight,
            lock_speed_enabled: true,
            speed_window: SpeedWindow::Ms(window_ms),
            ..ScoringSettings::default()
        };
        let judging = JudgingSettings::default();
        let at = |duration: u32| award_points(
            &scoring, &judging, 50, &Judgement::correct(),
            Some(duration - elapsed.min(duration)), Some(duration),
        );
        prop_assert_eq!(at(short), at(long));
    }

    /// The default window with no banding is the pre-P11.12 formula, byte for
    /// byte. This is what lets an old `PlaySnapshot` deserialise into the rules
    /// it was actually played under.
    #[test]
    fn the_default_window_reproduces_the_p4_formula(
        flat_points in 0u32..=1000,
        speed_weight in 0.0f64..=4.0,
        duration in 1_000u32..=120_000,
        remaining in 0u32..=120_000,
    ) {
        let scoring = ScoringSettings {
            mode: ScoringMode::Flat,
            flat_points,
            speed_weight,
            lock_speed_enabled: true,
            ..ScoringSettings::default()
        };
        let remaining = remaining.min(duration);
        let expected = 1.0 + speed_weight * f64::from(remaining) / f64::from(duration);
        prop_assert_eq!(
            award_points(&scoring, &JudgingSettings::default(), 50,
                         &Judgement::correct(), Some(remaining), Some(duration)),
            (f64::from(flat_points) * expected).floor() as u32,
        );
    }

    /// The base is the difficulty's, and only the difficulty's. A band table
    /// that rises with difficulty pays no less for a harder question, and the
    /// breakdown names which band did it.
    #[test]
    fn a_rising_band_table_never_pays_less_for_a_harder_question(
        raw in proptest::collection::vec((1u8..=100, 0u32..=300), 1..=6),
        a in 1u8..=100,
        b in 1u8..=100,
    ) {
        // Sort the ceilings and make the awards rise with them: the shape an
        // operator authoring easy/medium/hard means to write.
        let mut ups: Vec<u8> = raw.iter().map(|(up_to, _)| *up_to).collect();
        ups.sort_unstable();
        ups.dedup();
        let bands: Vec<DifficultyBand> = ups
            .iter()
            .enumerate()
            .map(|(i, up_to)| DifficultyBand { up_to: *up_to, points: (i as u32 + 1) * 10 })
            .collect();
        let scoring = ScoringSettings {
            mode: ScoringMode::Difficulty,
            difficulty_map: DifficultyMap::Bands { bands },
            ..ScoringSettings::default()
        };
        let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
        prop_assert!(base_points(&scoring, lo) <= base_points(&scoring, hi));

        // And the breakdown can always say which band paid.
        let b = explain::explain(
            &scoring, &JudgingSettings::default(), hi, &Judgement::correct(), None, None,
        );
        let named_a_band = matches!(b.base_from, BaseSource::Band { .. });
        prop_assert!(named_a_band, "{:?}", b.base_from);
        prop_assert_eq!(b.base, base_points(&scoring, hi));
    }

    /// A band table's spans tile 1..=100 with no gap and no overlap, so every
    /// difficulty has exactly one band and the ladder shown in the preview is
    /// the ladder the award walks.
    #[test]
    fn the_band_spans_tile_the_difficulty_range(
        raw in proptest::collection::vec((1u8..=100, 0u32..=300), 1..=6),
    ) {
        let map = DifficultyMap::Bands {
            bands: raw.into_iter()
                .map(|(up_to, points)| DifficultyBand { up_to, points })
                .collect(),
        };
        let spans = map.spans();
        prop_assert!(!spans.is_empty());
        for difficulty in 1u8..=100 {
            // Only the reachable spans tile: a band whose ceiling an earlier
            // band already covered can never be the first match, and the
            // ladder marks it dead rather than drawing an overlap.
            let matched: Vec<_> = spans
                .iter()
                .filter(|s| s.reachable && difficulty >= s.from && difficulty <= s.up_to)
                .collect();
            // Above the last ceiling nothing matches, and the last band pays —
            // §4.1's documented fall-through.
            let last = spans.last().expect("non-empty");
            let reachable_last = spans.iter().rev().find(|s| s.reachable).expect("one is reachable");
            if difficulty > reachable_last.up_to {
                prop_assert!(matched.is_empty());
                prop_assert_eq!(map.points(difficulty), last.points);
            } else {
                prop_assert_eq!(matched.len(), 1, "difficulty {} matched {:?}", difficulty, matched);
                prop_assert_eq!(map.points(difficulty), matched[0].points);
            }
        }
    }

    /// Partial credit is a share of the *scaled* figure, never more than it,
    /// and never negative — a mostly-wrong lock cannot pay a team (§4.4).
    #[test]
    fn a_partial_share_is_between_nothing_and_the_whole(
        scoring in scoring(),
        difficulty in 1u8..=100,
        duration in duration(),
        remaining in 0u32..=120_000,
        correct_locked in 0u32..=5,
        incorrect_locked in 0u32..=5,
        correct_total in 1u32..=5,
    ) {
        let judging = JudgingSettings { partial_credit: true, order_matters: false };
        let judgement = Judgement {
            verdict: Verdict::Partial,
            correct_locked,
            incorrect_locked,
            correct_total,
        };
        let remaining = Some(remaining.min(duration.unwrap_or(0)));
        let b = explain::explain(&scoring, &judging, difficulty, &judgement, remaining, duration);
        prop_assert!(b.points <= b.scaled, "a part paid more than the whole: {} > {}", b.points, b.scaled);
        if let Some(share) = b.share {
            prop_assert!((0.0..=1.0).contains(&share.share), "share {} is not a share", share.share);
        }
        // Off, the same lock pays nothing at all.
        let off = JudgingSettings { partial_credit: false, order_matters: false };
        prop_assert_eq!(
            award_points(&scoring, &off, difficulty, &judgement, remaining, duration),
            0,
        );
    }

    /// The streak bonus lands on exactly one answer of a run: the one that
    /// reaches the count. Not the ones before it, not the ones after it.
    #[test]
    fn the_streak_bonus_is_paid_once(count in 1u32..=8, award in 0u32..=500, streak in 1u32..=12) {
        let bonus = questiongame_host::settings::ConsecutiveBonus { count, award };
        let paid = explain::bonus_for(Some(bonus), Verdict::Correct, streak);
        prop_assert_eq!(paid.is_some(), streak == count);
        // A wrong answer never carries a streak bonus, whatever the count.
        prop_assert!(explain::bonus_for(Some(bonus), Verdict::Incorrect, streak).is_none());
        prop_assert!(explain::bonus_for(None, Verdict::Correct, count).is_none());
    }

    /// `total` is `points + bonus`, and the bonus is additive — it is never
    /// scaled by the speed factor or shared by partial credit (§4.4).
    #[test]
    fn the_bonus_is_added_after_everything_else(
        scoring in scoring(),
        judging in judging(),
        difficulty in 1u8..=100,
        judgement in judgement(),
        duration in duration(),
        remaining in 0u32..=120_000,
        award in 0u32..=500,
    ) {
        let remaining = Some(remaining.min(duration.unwrap_or(0)));
        let bare = explain::explain(&scoring, &judging, difficulty, &judgement, remaining, duration);
        let with = bare.clone().with_bonus(Some(explain::BonusAward { streak: 3, count: 3, award }));
        prop_assert_eq!(with.points, bare.points);
        prop_assert_eq!(with.total, bare.points + award);
    }
}
