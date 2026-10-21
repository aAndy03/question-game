//! What the rules would do, before a Play runs them (P11.12).
//!
//! Fourteen settings can move a number and four of them silently neutralise
//! others. The operator sets them one at a time in a form and finds out what
//! the combination meant during the show. This module answers the question the
//! form cannot: **given this document and this board, what does every question
//! pay?**
//!
//! It is a pure function of its arguments — no catalog, no Play, no clock —
//! and every number in it comes from [`crate::explain`], which is the same
//! arithmetic `reveal_outcome` scores with. A preview that computed its own
//! numbers would be a second rules engine, and the first thing it would do is
//! disagree.
//!
//! ```text
//! GameSettings + PreviewBoard + [Disabled]  ──build()──▶  RulesPreview
//! ```
//!
//! **Uneven domains are not an award problem.** The award never reads domain
//! membership, so difficulty 21 pays the same in a three-question domain and a
//! thirty-question one. What uneven domains change is the *ceiling* and the
//! *walk*, and that is board design — reported by [`BoardShape`], not fixed by
//! a rule.

use std::collections::{BTreeMap, BTreeSet};

use serde::{Deserialize, Serialize};

use crate::explain::{self, AwardBreakdown, BaseSource};
use crate::flags::{Disabled, DisabledReason, GameSettings};
use crate::ids::{DomainId, QuestionId};
use crate::rules::Judgement;
use crate::rules::Verdict;
use crate::settings::{BandSpan, DifficultyMap, LockSpeedBase, ScoringMode, TimerCascade};

/// Every key the award reads, in the order the formula applies them. The
/// effects table is this list joined with `effects`, so a key that gains an
/// interlock cannot be left out of the explanation.
pub const AWARD_KEYS: &[&str] = &[
    "scoring.mode",
    "scoring.flat_points",
    "scoring.difficulty_map",
    "scoring.lock_speed.enabled",
    "scoring.lock_speed_base",
    "scoring.speed_weight",
    "scoring.speed_window",
    "scoring.speed_steps",
    "timer.enabled",
    "timer.duration_ms",
    "judging.partial_credit",
    "judging.order_matters",
    "turn.max_consecutive_correct",
    "turn.bonus_after_consecutive",
];

/// The ladder shown when there is no board to read — the globals form, or a
/// recipe whose board is still empty.
const FALLBACK_DIFFICULTIES: [u8; 5] = [1, 25, 50, 75, 100];

/// More rows than this and the eye stops reading a table, so the distinct
/// difficulties are sampled evenly with both ends kept.
const MAX_ROWS: usize = 8;

// ------------------------------------------------------------------- the board

/// The board, flattened. A plain description so the preview needs neither the
/// catalog nor a snapshot; the app crate builds one from the recipe.
#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct PreviewBoard {
    pub domains: Vec<PreviewDomain>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewDomain {
    pub id: DomainId,
    pub name: String,
    pub questions: Vec<PreviewQuestion>,
    /// Board questions left out of every number here because they are
    /// incomplete (§2.32) — nothing to pay, and Load would refuse them.
    #[serde(default)]
    pub incomplete: u32,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewQuestion {
    pub id: QuestionId,
    pub stem: String,
    /// 1–100.
    pub difficulty: u8,
    /// The per-question recipe overlay duration, top of the §2.18 cascade.
    pub duration_ms: Option<u32>,
    /// How many of its options are correct. More than one is where partial
    /// credit and `order_matters` start to matter.
    pub correct_count: u32,
}

// ------------------------------------------------------------------ the answer

/// One lock time the matrix is computed at.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum LockSample {
    /// Locked the instant the question appeared.
    Instant,
    /// Locked with this many *quarters* of the clock left: 3, 2, 1.
    Quarters { left: u8 },
    /// The T=0 table locked it — no clock left at all.
    Buzzer,
    /// An empty reveal: nothing was ever locked.
    NeverLocked,
    /// The Play runs at operator pace, so there is one column and no speed.
    OperatorPace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewColumn {
    pub lock: LockSample,
    /// What the clock would read at that moment, `None` for an empty reveal or
    /// at operator pace.
    pub remaining_ms: Option<u32>,
}

/// One difficulty, and what it pays at every lock sample.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewRow {
    pub difficulty: u8,
    /// Board questions sitting at exactly this difficulty.
    pub question_count: u32,
    /// The domains they belong to, named.
    pub domains: Vec<String>,
    pub base: u32,
    pub base_from: BaseSource,
    /// One per column, in order: a correct answer, explained.
    pub correct: Vec<AwardBreakdown>,
    /// The same with a half-right multiple answer, when partial credit is on.
    /// `None` when it is off, because then every partial pays zero and a
    /// column of zeroes teaches nothing.
    pub partial: Option<Vec<AwardBreakdown>>,
    /// A wrong answer, always. A field rather than a footnote, because "wrong
    /// is zero whatever else you set" is one of the things the operator is
    /// here to confirm.
    pub incorrect: u32,
}

/// Which level of the §2.18 cascade supplied the countdown.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TimerSource {
    Recipe,
    Globals,
    /// No level named a duration, or the timer is off: operator pace.
    OperatorPace,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TimerResolution {
    pub enabled: bool,
    pub duration_ms: Option<u32>,
    pub source: TimerSource,
    /// Board questions carrying a duration of their own, which outranks both
    /// levels above.
    pub per_question: u32,
    /// The window the speed bonus is paid over, for the resolved duration.
    pub speed_window_ms: Option<u32>,
}

/// One domain's walk, and its ceiling.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DomainLadder {
    pub id: DomainId,
    pub name: String,
    pub questions: u32,
    pub min_difficulty: u8,
    pub max_difficulty: u8,
    /// Difficulties in walk order — easy to hard, the order §5.3 issues them.
    pub ladder: Vec<u8>,
    /// Every question in this domain answered correctly with no speed bonus:
    /// the honest ceiling.
    pub points_available: u32,
}

/// One rung of a board whose domains all walk the same ladder.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Rung {
    /// 1-based position in the walk: the nth question a team meets.
    pub index: u32,
    pub difficulty: u8,
    pub base: u32,
}

/// What kind of board this is — which decides how the balance readout is worth
/// drawing, and is the whole point of asking.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "kind")]
pub enum BoardShape {
    Empty,
    /// Same question count **and** the same difficulty ladder in every domain.
    /// One rung table is then the whole truth about the board.
    Aligned {
        per_domain: u32,
        rungs: Vec<Rung>,
        domains: Vec<DomainLadder>,
    },
    /// Same count, different ladders. The ceiling matches; the walk does not.
    Uniform {
        per_domain: u32,
        domains: Vec<DomainLadder>,
    },
    /// Counts differ, so the domains empty at different rates.
    Ragged {
        min: u32,
        max: u32,
        domains: Vec<DomainLadder>,
    },
}

/// Something about this combination that will surprise the operator during a
/// show. Codes, not sentences: Studio renders the copy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "code")]
pub enum PreviewWarning {
    /// Rows the game names that are archived (beta.4): Load refuses them, so
    /// the operator hears it here first, by name — "team Red".
    ArchivedOnGame { names: Vec<String> },
    /// Questions carry their own durations, so the same answer *time* is not
    /// worth the same across the board — unless the window is absolute.
    MixedDurations { questions: u32 },
    /// Lock-speed scoring with no countdown to measure it against.
    SpeedWithoutTimer,
    /// A band table whose award falls as difficulty rises. Legal, and almost
    /// never meant.
    BandsNotMonotonic { index: u32 },
    /// A band an earlier one already covers, so no difficulty can reach it.
    /// Two bands with the same ceiling is the easy way to author one.
    UnreachableBand { index: u32, up_to: u8 },
    /// Board difficulties above the last band's ceiling, all paying that band.
    AboveLastBand { questions: u32, up_to: u8 },
    /// The streak bonus is longer than the cap, so it can never be paid.
    BonusUnreachable { count: u32, cap: u32 },
    /// Domains hold different numbers of questions, so they empty at different
    /// rates and their walks have different numbers of rungs.
    RaggedBoard { min: u32, max: u32 },
    /// Every question on the board is the same difficulty, so a difficulty
    /// base is a flat base with extra steps.
    FlatBoard { difficulty: u8 },
    /// One board domain selects two questions at the same difficulty (P11.13).
    /// `recipe_upsert` refuses to write such a board, so this is a recipe
    /// saved by an older build, or one whose questions were re-graded in the
    /// library afterwards. The Play will not start until it is fixed, and
    /// hearing that here is better than hearing it from Load.
    DuplicateDifficulty { difficulty: u8, questions: u32 },
    /// Board questions that are incomplete — no difficulty, no correct
    /// answer, too few options (§2.32). `recipe_upsert` refuses to select one,
    /// so this is a question the library changed underneath the board. As
    /// severe as a duplicate: Load refuses the board.
    IncompleteQuestions { questions: u32 },
}

/// Everything the Rules preview draws.
#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RulesPreview {
    pub timer: TimerResolution,
    /// Bands resolved to explicit `from..=up_to` spans; empty when the base is
    /// flat or linear.
    pub bands: Vec<BandSpan>,
    pub columns: Vec<PreviewColumn>,
    pub rows: Vec<PreviewRow>,
    pub board: BoardShape,
    /// **The point of truth for the effects table**: one entry per
    /// [`AWARD_KEYS`] key, in order, saying what that setting is doing right
    /// now and what it is set to. Built from the settings document itself, so
    /// nothing downstream has to infer a value from an absence.
    pub rules: Vec<RuleEffect>,
    /// Which keys are inert, frozen or feature-off, for the form's greying.
    /// Derived from `rules`, never assembled twice.
    pub effects: Vec<Disabled>,
    pub warnings: Vec<PreviewWarning>,
}

// -------------------------------------------------------------- what a key does

/// What one award key is doing right now.
///
/// **`Off` and `Disabled` are different things, and conflating them was a bug
/// (2026-09-10).** A switch the operator has turned off is perfectly usable —
/// it just is not contributing — while a disabled key cannot contribute
/// whatever its value, because a sibling setting has neutralised it. Reporting
/// only the second meant a key with no interlock entry rendered as "in use"
/// even when it was switched off, so Rules claimed partial credit was on while
/// the form right above it showed the switch off.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "state")]
pub enum RuleState {
    /// Live, and its value is moving numbers.
    Active,
    /// Usable, but its current value contributes nothing — a switch that is
    /// off, an optional that is unset, a weight of zero. The operator can turn
    /// it on right now.
    Off,
    /// §4.2 says it cannot do anything, and which sibling decided that.
    Disabled {
        #[serde(flatten)]
        reason: DisabledReason,
    },
}

/// What a key is set to, structured. Codes and numbers only — the readable
/// string is Studio's, the way every other host-to-Studio label works.
#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase", tag = "kind", content = "value")]
pub enum RuleValue {
    /// An optional with nothing in it: no cap, no streak bonus, no banding.
    Unset,
    Flag(bool),
    Points(u32),
    Number(f64),
    Ms(u32),
    /// An enum variant by its serde name — `flat`, `difficulty`, `lock_speed`.
    Choice(&'static str),
    /// `difficulty_map: linear`, by its factor.
    Linear(f64),
    /// `difficulty_map: bands`, by how many there are.
    Bands(u32),
    /// `speed_window: fraction`, `0.0..=1.0`.
    Fraction(f64),
    Streak {
        count: u32,
        award: u32,
    },
    /// `timer.enabled` unset at the recipe level: the globals decided, and
    /// this is what they decided.
    Inherited(bool),
}

#[derive(Debug, Clone, Copy, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RuleEffect {
    pub key: &'static str,
    #[serde(flatten)]
    pub state: RuleState,
    pub value: RuleValue,
}

// ------------------------------------------------------------------- the build

/// Explain `game` over `board`. `effects` comes from
/// [`crate::flags::FlagService::interlocks_for`]; `globals_timer` is the
/// bottom level of the §2.18 cascade.
pub fn build(
    game: &GameSettings,
    board: &PreviewBoard,
    globals_timer: crate::settings::TimerLevel,
    effects: Vec<Disabled>,
) -> RulesPreview {
    let cascade = TimerCascade {
        globals: globals_timer,
        recipe: game.timer,
    };
    let timer = resolve_timer(game, board, &cascade);
    let columns = columns_for(timer.duration_ms);
    let difficulties = sample_difficulties(board);
    let rows = difficulties
        .iter()
        .map(|d| row_for(game, board, &columns, *d))
        .collect();
    let shape = board_shape(game, board);

    let rules = rules_for(game, &timer, &effects);
    RulesPreview {
        bands: game.scoring.difficulty_map.spans(),
        warnings: warnings_for(game, board, &timer, &shape),
        timer,
        columns,
        rows,
        board: shape,
        rules,
        effects,
    }
}

/// Every award key's state and value, in [`AWARD_KEYS`] order.
///
/// The one place the two questions are answered together — "can this setting
/// do anything right now" and "what is it set to" — because answering only the
/// first is what made an off switch read as *in use*.
///
/// An interlock always wins: a key a sibling has neutralised is `Disabled`
/// whatever its own value, since that is the more useful thing to say. Below
/// that, a value that contributes nothing is `Off`, and everything else is
/// `Active`.
fn rules_for(
    game: &GameSettings,
    timer: &TimerResolution,
    effects: &[Disabled],
) -> Vec<RuleEffect> {
    let scoring = &game.scoring;
    let disabled = |key: &str| effects.iter().find(|d| d.key == key).map(|d| d.reason);

    // A key whose *value* is doing nothing, and the value itself. `None` here
    // means the key is always doing something — `scoring.mode` and
    // `timer.enabled` have no "off": every setting of them is a decision.
    let entry = |key: &'static str, off: bool, value: RuleValue| RuleEffect {
        key,
        state: match disabled(key) {
            Some(reason) => RuleState::Disabled { reason },
            None if off => RuleState::Off,
            None => RuleState::Active,
        },
        value,
    };

    let map_value = match &scoring.difficulty_map {
        DifficultyMap::Linear { factor } => RuleValue::Linear(*factor),
        DifficultyMap::Bands { bands } => RuleValue::Bands(bands.len() as u32),
    };
    let window_value = match scoring.speed_window {
        crate::settings::SpeedWindow::Fraction(f) => RuleValue::Fraction(f),
        crate::settings::SpeedWindow::Ms(ms) => RuleValue::Ms(ms),
    };
    let timer_value = match game.timer.enabled {
        Some(on) => RuleValue::Flag(on),
        None => RuleValue::Inherited(timer.enabled),
    };

    vec![
        // Always a decision: every mode picks a base.
        entry(
            "scoring.mode",
            false,
            RuleValue::Choice(mode_key(scoring.mode)),
        ),
        entry(
            "scoring.flat_points",
            false,
            RuleValue::Points(scoring.flat_points),
        ),
        entry("scoring.difficulty_map", false, map_value),
        entry(
            "scoring.lock_speed.enabled",
            !scoring.lock_speed_enabled,
            RuleValue::Flag(scoring.lock_speed_enabled),
        ),
        entry(
            "scoring.lock_speed_base",
            false,
            RuleValue::Choice(base_key(scoring.lock_speed_base)),
        ),
        // A weight of zero is legal and kept (§4.2), and it pays exactly the
        // base — so it is off, not disabled.
        entry(
            "scoring.speed_weight",
            scoring.speed_weight <= 0.0,
            RuleValue::Number(scoring.speed_weight),
        ),
        entry("scoring.speed_window", false, window_value),
        entry(
            "scoring.speed_steps",
            scoring.speed_steps.is_none(),
            scoring
                .speed_steps
                .map_or(RuleValue::Unset, |n| RuleValue::Number(f64::from(n))),
        ),
        // Off is a mode, not an absence: operator pace changes how the whole
        // show runs, so `timer.enabled = false` is very much in effect.
        entry("timer.enabled", false, timer_value),
        entry(
            "timer.duration_ms",
            false,
            timer.duration_ms.map_or(RuleValue::Unset, RuleValue::Ms),
        ),
        entry(
            "judging.partial_credit",
            !game.judging.partial_credit,
            RuleValue::Flag(game.judging.partial_credit),
        ),
        entry(
            "judging.order_matters",
            !game.judging.order_matters,
            RuleValue::Flag(game.judging.order_matters),
        ),
        entry(
            "turn.max_consecutive_correct",
            game.turn.max_consecutive_correct.is_none(),
            game.turn
                .max_consecutive_correct
                .map_or(RuleValue::Unset, |n| RuleValue::Number(f64::from(n))),
        ),
        entry(
            "turn.bonus_after_consecutive",
            game.turn.bonus_after_consecutive.is_none(),
            game.turn
                .bonus_after_consecutive
                .map_or(RuleValue::Unset, |b| RuleValue::Streak {
                    count: b.count,
                    award: b.award,
                }),
        ),
    ]
}

fn mode_key(mode: ScoringMode) -> &'static str {
    match mode {
        ScoringMode::Flat => "flat",
        ScoringMode::Difficulty => "difficulty",
        ScoringMode::LockSpeed => "lock_speed",
    }
}

fn base_key(base: LockSpeedBase) -> &'static str {
    match base {
        LockSpeedBase::Flat => "flat",
        LockSpeedBase::Difficulty => "difficulty",
    }
}

fn resolve_timer(
    game: &GameSettings,
    board: &PreviewBoard,
    cascade: &TimerCascade,
) -> TimerResolution {
    let enabled = cascade.enabled();
    let duration_ms = cascade.resolve(None);
    let source = match (enabled, game.timer.duration_ms, duration_ms) {
        (false, _, _) | (_, _, None) => TimerSource::OperatorPace,
        (true, Some(_), Some(_)) => TimerSource::Recipe,
        (true, None, Some(_)) => TimerSource::Globals,
    };
    TimerResolution {
        enabled,
        duration_ms,
        source,
        per_question: board
            .domains
            .iter()
            .flat_map(|d| &d.questions)
            .filter(|q| q.duration_ms.is_some())
            .count() as u32,
        speed_window_ms: duration_ms.map(|d| game.scoring.speed_window.resolve(d)),
    }
}

/// The lock times the matrix samples. At operator pace there is one column,
/// because there is nothing for a second one to differ by.
fn columns_for(duration_ms: Option<u32>) -> Vec<PreviewColumn> {
    let Some(duration) = duration_ms else {
        return vec![PreviewColumn {
            lock: LockSample::OperatorPace,
            remaining_ms: None,
        }];
    };
    let quarter = duration / 4;
    let mut out = vec![PreviewColumn {
        lock: LockSample::Instant,
        remaining_ms: Some(duration),
    }];
    for left in [3u8, 2, 1] {
        out.push(PreviewColumn {
            lock: LockSample::Quarters { left },
            remaining_ms: Some(quarter * u32::from(left)),
        });
    }
    out.push(PreviewColumn {
        lock: LockSample::Buzzer,
        remaining_ms: Some(0),
    });
    out.push(PreviewColumn {
        lock: LockSample::NeverLocked,
        remaining_ms: None,
    });
    out
}

/// The distinct difficulties on the board, sampled to [`MAX_ROWS`] with both
/// ends kept — or the fallback ladder when there is no board.
fn sample_difficulties(board: &PreviewBoard) -> Vec<u8> {
    let distinct: BTreeSet<u8> = board
        .domains
        .iter()
        .flat_map(|d| &d.questions)
        .map(|q| q.difficulty)
        .collect();
    if distinct.is_empty() {
        return FALLBACK_DIFFICULTIES.to_vec();
    }
    let all: Vec<u8> = distinct.into_iter().collect();
    if all.len() <= MAX_ROWS {
        return all;
    }
    let last = all.len() - 1;
    let mut picked: BTreeSet<u8> = BTreeSet::new();
    for step in 0..MAX_ROWS {
        let index = (step * last) / (MAX_ROWS - 1);
        picked.insert(all[index]);
    }
    picked.into_iter().collect()
}

fn row_for(
    game: &GameSettings,
    board: &PreviewBoard,
    columns: &[PreviewColumn],
    difficulty: u8,
) -> PreviewRow {
    let scoring = &game.scoring;
    let judging = &game.judging;
    let duration = columns.iter().find_map(|c| {
        matches!(c.lock, LockSample::Instant)
            .then_some(c.remaining_ms)
            .flatten()
    });

    let at = |judgement: &Judgement| -> Vec<AwardBreakdown> {
        columns
            .iter()
            .map(|column| {
                explain::explain(
                    scoring,
                    judging,
                    difficulty,
                    judgement,
                    column.remaining_ms,
                    duration,
                )
            })
            .collect()
    };

    let mut domains: Vec<String> = Vec::new();
    let mut question_count = 0u32;
    for domain in &board.domains {
        let count = domain
            .questions
            .iter()
            .filter(|q| q.difficulty == difficulty)
            .count() as u32;
        if count > 0 {
            question_count += count;
            domains.push(domain.name.clone());
        }
    }

    let base_from = explain::base_source(scoring, difficulty);
    let correct = at(&Judgement::correct());
    PreviewRow {
        difficulty,
        question_count,
        domains,
        base: correct.first().map(|b| b.base).unwrap_or(0),
        base_from,
        // Two of three right on a three-option answer: the shape §4.4's share
        // is written for.
        partial: judging.partial_credit.then(|| {
            at(&Judgement {
                verdict: Verdict::Partial,
                correct_locked: 2,
                incorrect_locked: 0,
                correct_total: 3,
            })
        }),
        correct,
        incorrect: 0,
    }
}

// ------------------------------------------------------------------ the shape

fn board_shape(game: &GameSettings, board: &PreviewBoard) -> BoardShape {
    let domains: Vec<DomainLadder> = board
        .domains
        .iter()
        .map(|domain| ladder_for(game, domain))
        .collect();
    if domains.is_empty() || domains.iter().all(|d| d.questions == 0) {
        return BoardShape::Empty;
    }
    let counts: BTreeSet<u32> = domains.iter().map(|d| d.questions).collect();
    let (min, max) = (
        *counts.iter().next().expect("non-empty"),
        *counts.iter().next_back().expect("non-empty"),
    );
    if min != max {
        return BoardShape::Ragged { min, max, domains };
    }
    let first = domains[0].ladder.clone();
    if domains.iter().all(|d| d.ladder == first) {
        // Every domain walks the same rungs, so one table says everything
        // there is to say about the board.
        let rungs = first
            .iter()
            .enumerate()
            .map(|(index, difficulty)| Rung {
                index: index as u32 + 1,
                difficulty: *difficulty,
                base: explain::explain(
                    &game.scoring,
                    &game.judging,
                    *difficulty,
                    &Judgement::correct(),
                    None,
                    None,
                )
                .base,
            })
            .collect();
        return BoardShape::Aligned {
            per_domain: max,
            rungs,
            domains,
        };
    }
    BoardShape::Uniform {
        per_domain: max,
        domains,
    }
}

fn ladder_for(game: &GameSettings, domain: &PreviewDomain) -> DomainLadder {
    // Walk order is easy→hard with ties broken by id, which is the order
    // `snapshot::queue` issues them in. The ladder has to match, or the rung
    // table would describe a walk the Play never takes.
    let mut ordered: Vec<&PreviewQuestion> = domain.questions.iter().collect();
    ordered.sort_by(|a, b| {
        a.difficulty
            .cmp(&b.difficulty)
            .then_with(|| a.id.cmp(&b.id))
    });
    let ladder: Vec<u8> = ordered.iter().map(|q| q.difficulty).collect();
    let points_available = ladder
        .iter()
        .map(|d| {
            explain::explain(
                &game.scoring,
                &game.judging,
                *d,
                &Judgement::correct(),
                None,
                None,
            )
            .points
        })
        .sum();
    DomainLadder {
        id: domain.id.clone(),
        name: domain.name.clone(),
        questions: ladder.len() as u32,
        min_difficulty: ladder.first().copied().unwrap_or(0),
        max_difficulty: ladder.last().copied().unwrap_or(0),
        ladder,
        points_available,
    }
}

// --------------------------------------------------------------- the warnings

fn warnings_for(
    game: &GameSettings,
    board: &PreviewBoard,
    timer: &TimerResolution,
    shape: &BoardShape,
) -> Vec<PreviewWarning> {
    let mut out: Vec<PreviewWarning> = Vec::new();

    // §2.32 — as severe as a duplicate difficulty: Load refuses this board.
    let incomplete: u32 = board.domains.iter().map(|d| d.incomplete).sum();
    if incomplete > 0 {
        out.push(PreviewWarning::IncompleteQuestions {
            questions: incomplete,
        });
    }

    // P11.13, and the most severe thing this function can say: a domain that
    // selects two questions at one difficulty cannot start a Play at all.
    // `recipe_upsert` refuses to write such a board, so reaching here means an
    // older build's row, or a library re-grade that reached in from outside —
    // and the operator should hear it before pressing Load, not from Load.
    for domain in &board.domains {
        let pairs: Vec<_> = domain
            .questions
            .iter()
            .map(|q| (q.id.clone(), q.difficulty))
            .collect();
        if let Some(clash) = crate::board::check(game.board.allow_repeated_difficulty, &pairs) {
            out.push(PreviewWarning::DuplicateDifficulty {
                difficulty: clash.difficulty,
                questions: clash.question_ids.len() as u32,
            });
            break;
        }
    }

    let scoring = &game.scoring;

    // A per-question duration changes the denominator, so a one-second answer
    // is worth different amounts on different questions — unless the window is
    // absolute, which is exactly what `SpeedWindow::Ms` is for.
    let absolute = matches!(scoring.speed_window, crate::settings::SpeedWindow::Ms(_));
    if scoring.uses_lock_speed() && timer.per_question > 0 && !absolute {
        out.push(PreviewWarning::MixedDurations {
            questions: timer.per_question,
        });
    }
    if scoring.uses_lock_speed() && scoring.speed_weight > 0.0 && !timer.enabled {
        out.push(PreviewWarning::SpeedWithoutTimer);
    }

    if scoring.uses_difficulty_base()
        && let DifficultyMap::Bands { .. } = &scoring.difficulty_map
    {
        let spans = scoring.difficulty_map.spans();
        for pair in spans.windows(2) {
            if pair[1].points < pair[0].points {
                out.push(PreviewWarning::BandsNotMonotonic {
                    index: pair[1].index,
                });
                break;
            }
        }
        if let Some(dead) = spans.iter().find(|s| !s.reachable) {
            out.push(PreviewWarning::UnreachableBand {
                index: dead.index,
                up_to: dead.up_to,
            });
        }
        // "Above the last band" is about the last band that can actually pay.
        if let Some(last) = spans.iter().rev().find(|s| s.reachable) {
            let over = board
                .domains
                .iter()
                .flat_map(|d| &d.questions)
                .filter(|q| q.difficulty > last.up_to)
                .count() as u32;
            if over > 0 {
                out.push(PreviewWarning::AboveLastBand {
                    questions: over,
                    up_to: last.up_to,
                });
            }
        }
    }

    if let (Some(bonus), Some(cap)) = (
        game.turn.bonus_after_consecutive,
        game.turn.max_consecutive_correct,
    ) && bonus.count > cap
    {
        out.push(PreviewWarning::BonusUnreachable {
            count: bonus.count,
            cap,
        });
    }

    if let BoardShape::Ragged { min, max, .. } = shape {
        out.push(PreviewWarning::RaggedBoard {
            min: *min,
            max: *max,
        });
    }

    // A difficulty base over a board with one difficulty is a flat base that
    // looks like it is doing something.
    if scoring.uses_difficulty_base() {
        let distinct: BTreeMap<u8, ()> = board
            .domains
            .iter()
            .flat_map(|d| &d.questions)
            .map(|q| (q.difficulty, ()))
            .collect();
        if distinct.len() == 1
            && let Some((difficulty, _)) = distinct.into_iter().next()
        {
            out.push(PreviewWarning::FlatBoard { difficulty });
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::{DifficultyBand, ScoringMode, ScoringSettings, TimerLevel, TurnSettings};

    fn question(id: &str, difficulty: u8) -> PreviewQuestion {
        PreviewQuestion {
            id: QuestionId::from(id),
            stem: id.to_owned(),
            difficulty,
            duration_ms: None,
            correct_count: 1,
        }
    }

    fn domain(id: &str, difficulties: &[u8]) -> PreviewDomain {
        PreviewDomain {
            id: DomainId::from(id),
            name: id.to_owned(),
            questions: difficulties
                .iter()
                .enumerate()
                .map(|(i, d)| question(&format!("{id}-{i}"), *d))
                .collect(),
            incomplete: 0,
        }
    }

    fn game() -> GameSettings {
        GameSettings {
            scoring: ScoringSettings {
                mode: ScoringMode::Difficulty,
                difficulty_map: DifficultyMap::Linear { factor: 10.0 },
                ..ScoringSettings::default()
            },
            turn: TurnSettings::default(),
            ..GameSettings::default()
        }
    }

    /// A preview built the way the app crate builds one — with the §4.2
    /// interlocks actually computed. Handing `build` an empty `effects` was
    /// how the `Disabled` half of `rules` went untested: every state came out
    /// `Active` or `Off`, which is exactly the shape of the bug this module
    /// grew `RuleState` for.
    fn preview(game: &GameSettings, board: &PreviewBoard) -> RulesPreview {
        let globals_timer = TimerLevel::new(true, 30_000);
        let flags = crate::flags::FlagService::new(crate::flags::GlobalSettings {
            timer: globals_timer,
            ..Default::default()
        });
        let effects = flags.interlocks_for(game, false);
        build(game, board, globals_timer, effects)
    }

    #[test]
    fn a_domain_holding_one_difficulty_twice_is_a_warning_naming_it() {
        let board = PreviewBoard {
            domains: vec![domain("d1", &[10, 10, 30])],
        };
        let p = preview(&game(), &board);
        assert!(
            p.warnings.contains(&PreviewWarning::DuplicateDifficulty {
                difficulty: 10,
                questions: 2
            }),
            "got {:?}",
            p.warnings
        );
    }

    #[test]
    fn incomplete_questions_left_out_of_the_numbers_are_a_warning() {
        let mut d = domain("d1", &[10, 20]);
        d.incomplete = 2;
        let p = preview(&game(), &PreviewBoard { domains: vec![d] });
        assert!(
            p.warnings
                .contains(&PreviewWarning::IncompleteQuestions { questions: 2 }),
            "got {:?}",
            p.warnings
        );
    }

    #[test]
    fn a_repeated_difficulty_the_game_allows_is_not_a_warning() {
        let board = PreviewBoard {
            domains: vec![domain("d1", &[10, 10, 30])],
        };
        let mut allowed = game();
        allowed.board.allow_repeated_difficulty = true;
        let p = preview(&allowed, &board);
        assert!(
            !p.warnings
                .iter()
                .any(|w| matches!(w, PreviewWarning::DuplicateDifficulty { .. })),
            "got {:?}",
            p.warnings
        );
    }

    #[test]
    fn the_same_difficulty_in_two_domains_is_not_a_duplicate() {
        let board = PreviewBoard {
            domains: vec![domain("d1", &[10, 20, 30]), domain("d2", &[10, 20, 30])],
        };
        let p = preview(&game(), &board);
        assert!(
            !p.warnings
                .iter()
                .any(|w| matches!(w, PreviewWarning::DuplicateDifficulty { .. })),
            "got {:?}",
            p.warnings
        );
    }

    #[test]
    fn the_same_ladder_everywhere_is_one_rung_table() {
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50, 80]), domain("his", &[20, 50, 80])],
        };
        let p = preview(&game(), &board);
        let BoardShape::Aligned {
            per_domain, rungs, ..
        } = p.board
        else {
            panic!("expected Aligned, got {:?}", p.board);
        };
        assert_eq!(per_domain, 3);
        assert_eq!(
            rungs
                .iter()
                .map(|r| (r.index, r.difficulty, r.base))
                .collect::<Vec<_>>(),
            vec![(1, 20, 200), (2, 50, 500), (3, 80, 800)],
        );
    }

    #[test]
    fn the_same_count_with_different_ladders_is_uniform() {
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50, 80]), domain("his", &[10, 40, 90])],
        };
        assert!(matches!(
            preview(&game(), &board).board,
            BoardShape::Uniform { per_domain: 3, .. }
        ));
    }

    #[test]
    fn different_counts_are_ragged_and_say_so() {
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50, 80]), domain("his", &[10])],
        };
        let p = preview(&game(), &board);
        assert!(matches!(p.board, BoardShape::Ragged { min: 1, max: 3, .. }));
        assert!(
            p.warnings
                .contains(&PreviewWarning::RaggedBoard { min: 1, max: 3 })
        );
    }

    #[test]
    fn a_domains_ceiling_is_every_question_answered_right() {
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50, 80])],
        };
        let BoardShape::Aligned { domains, .. } = preview(&game(), &board).board else {
            panic!("expected Aligned");
        };
        assert_eq!(domains[0].points_available, 200 + 500 + 800);
        assert_eq!(
            (domains[0].min_difficulty, domains[0].max_difficulty),
            (20, 80)
        );
    }

    #[test]
    fn rows_come_from_the_board_and_name_the_domains() {
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50]), domain("his", &[50])],
        };
        let p = preview(&game(), &board);
        assert_eq!(
            p.rows.iter().map(|r| r.difficulty).collect::<Vec<_>>(),
            vec![20, 50]
        );
        let fifty = p.rows.iter().find(|r| r.difficulty == 50).expect("row");
        assert_eq!(fifty.question_count, 2);
        assert_eq!(fifty.domains, vec!["tec".to_owned(), "his".to_owned()]);
        assert_eq!(fifty.base, 500);
    }

    #[test]
    fn an_empty_board_falls_back_to_a_ladder_rather_than_nothing() {
        let p = preview(&game(), &PreviewBoard::default());
        assert_eq!(
            p.rows.iter().map(|r| r.difficulty).collect::<Vec<_>>(),
            FALLBACK_DIFFICULTIES.to_vec(),
        );
        assert!(matches!(p.board, BoardShape::Empty));
    }

    #[test]
    fn more_than_eight_difficulties_sample_both_ends() {
        let all: Vec<u8> = (1..=20).map(|i| i * 5).collect();
        let board = PreviewBoard {
            domains: vec![domain("tec", &all)],
        };
        let rows = preview(&game(), &board).rows;
        assert_eq!(rows.len(), MAX_ROWS);
        assert_eq!(rows.first().expect("row").difficulty, 5);
        assert_eq!(rows.last().expect("row").difficulty, 100);
    }

    #[test]
    fn a_per_question_duration_warns_that_speed_is_not_comparable() {
        let mut g = game();
        g.scoring.lock_speed_enabled = true;
        g.scoring.speed_weight = 1.0;
        let mut board = PreviewBoard {
            domains: vec![domain("tec", &[20, 50])],
        };
        board.domains[0].questions[0].duration_ms = Some(10_000);
        let p = preview(&g, &board);
        assert!(
            p.warnings
                .contains(&PreviewWarning::MixedDurations { questions: 1 })
        );

        // An absolute window is exactly the answer to that, so it stops warning.
        g.scoring.speed_window = crate::settings::SpeedWindow::Ms(8_000);
        assert!(
            !preview(&g, &board)
                .warnings
                .iter()
                .any(|w| matches!(w, PreviewWarning::MixedDurations { .. }))
        );
    }

    #[test]
    fn bands_that_fall_as_difficulty_rises_are_flagged() {
        let mut g = game();
        g.scoring.difficulty_map = DifficultyMap::Bands {
            bands: vec![
                DifficultyBand {
                    up_to: 50,
                    points: 30,
                },
                DifficultyBand {
                    up_to: 100,
                    points: 10,
                },
            ],
        };
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 80])],
        };
        assert!(
            preview(&g, &board)
                .warnings
                .iter()
                .any(|w| matches!(w, PreviewWarning::BandsNotMonotonic { .. }))
        );
    }

    #[test]
    fn a_band_an_earlier_one_already_covers_is_marked_dead() {
        let mut g = game();
        g.scoring.difficulty_map = DifficultyMap::Bands {
            bands: vec![
                DifficultyBand {
                    up_to: 50,
                    points: 10,
                },
                // Same ceiling: the lookup takes the first match, so this one
                // can never pay, and a ladder drawing it as a range would be
                // drawing an overlap.
                DifficultyBand {
                    up_to: 50,
                    points: 99,
                },
            ],
        };
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20])],
        };
        let p = preview(&g, &board);
        assert!(!p.bands[1].reachable);
        assert!(p.warnings.contains(&PreviewWarning::UnreachableBand {
            index: 1,
            up_to: 50
        }));
        // And it does not pay: difficulty 20 takes the first band.
        assert_eq!(p.rows[0].base, 10);
    }

    #[test]
    fn a_difficulty_above_the_last_band_is_reported_with_its_count() {
        let mut g = game();
        g.scoring.difficulty_map = DifficultyMap::Bands {
            bands: vec![DifficultyBand {
                up_to: 50,
                points: 30,
            }],
        };
        let board = PreviewBoard {
            domains: vec![domain("tec", &[20, 80, 90])],
        };
        assert!(
            preview(&g, &board)
                .warnings
                .contains(&PreviewWarning::AboveLastBand {
                    questions: 2,
                    up_to: 50
                })
        );
    }

    #[test]
    fn operator_pace_collapses_the_matrix_to_one_column() {
        let mut g = game();
        g.timer = TimerLevel {
            enabled: Some(false),
            duration_ms: None,
        };
        let p = build(
            &g,
            &PreviewBoard::default(),
            TimerLevel::new(true, 30_000),
            Vec::new(),
        );
        assert_eq!(p.columns.len(), 1);
        assert_eq!(p.columns[0].lock, LockSample::OperatorPace);
        assert_eq!(p.timer.source, TimerSource::OperatorPace);
    }

    #[test]
    fn the_cascade_says_which_level_answered() {
        let g = game();
        assert_eq!(
            build(
                &g,
                &PreviewBoard::default(),
                TimerLevel::new(true, 30_000),
                Vec::new()
            )
            .timer
            .source,
            TimerSource::Globals,
        );
        let mut own = game();
        own.timer = TimerLevel {
            enabled: None,
            duration_ms: Some(12_000),
        };
        let p = build(
            &own,
            &PreviewBoard::default(),
            TimerLevel::new(true, 30_000),
            Vec::new(),
        );
        assert_eq!(p.timer.source, TimerSource::Recipe);
        assert_eq!(p.timer.duration_ms, Some(12_000));
    }

    /// The 2026-09-10 report: Rules said partial credit was *in use* while
    /// the switch right above it was off. The table asked only "is this key
    /// disabled", and a usable-but-off switch has no interlock entry.
    #[test]
    fn a_switch_that_is_off_reads_as_off_not_as_in_use() {
        let mut g = game();
        g.judging.partial_credit = false;
        g.scoring.lock_speed_enabled = false;
        let p = preview(&g, &PreviewBoard::default());
        let state = |key: &str| p.rules.iter().find(|r| r.key == key).map(|r| r.state);

        assert_eq!(state("judging.partial_credit"), Some(RuleState::Off));
        assert_eq!(state("judging.order_matters"), Some(RuleState::Off));
        // And the switch whose own "off" is what disables the three speed
        // keys under it must not claim to be in use either.
        assert_eq!(state("scoring.lock_speed.enabled"), Some(RuleState::Off));

        // Turned on, the same keys are active.
        g.judging.partial_credit = true;
        let on = preview(&g, &PreviewBoard::default());
        assert_eq!(
            on.rules
                .iter()
                .find(|r| r.key == "judging.partial_credit")
                .map(|r| r.state),
            Some(RuleState::Active),
        );
    }

    /// `Off` and `Disabled` are different answers to different questions, and
    /// an interlock wins: a key a sibling has neutralised says so, rather than
    /// reporting its own value as merely switched off.
    #[test]
    fn an_interlock_outranks_an_off_value() {
        let mut g = game();
        // Lock-speed off makes the weight inert *and* the weight is 0.
        g.scoring.lock_speed_enabled = false;
        g.scoring.speed_weight = 0.0;
        let p = preview(&g, &PreviewBoard::default());
        let weight = p
            .rules
            .iter()
            .find(|r| r.key == "scoring.speed_weight")
            .expect("key");
        assert!(
            matches!(weight.state, RuleState::Disabled { .. }),
            "{:?}",
            weight.state
        );

        // Lock-speed on with a weight of 0 is legal and kept (§4.2): usable,
        // contributing nothing.
        g.scoring.lock_speed_enabled = true;
        let kept = preview(&g, &PreviewBoard::default());
        let weight = kept
            .rules
            .iter()
            .find(|r| r.key == "scoring.speed_weight")
            .expect("key");
        assert_eq!(weight.state, RuleState::Off);
        assert_eq!(weight.value, RuleValue::Number(0.0));
    }

    /// Every key carries what it is set to, so the table never has to infer a
    /// value from an absence — which is how the bug above happened.
    #[test]
    fn every_key_reports_its_current_value() {
        let mut g = game();
        g.turn.bonus_after_consecutive = Some(crate::settings::ConsecutiveBonus {
            count: 3,
            award: 50,
        });
        g.turn.max_consecutive_correct = Some(4);
        let p = preview(&g, &PreviewBoard::default());
        let value = |key: &str| p.rules.iter().find(|r| r.key == key).map(|r| r.value);

        assert_eq!(value("scoring.mode"), Some(RuleValue::Choice("difficulty")));
        assert_eq!(
            value("scoring.difficulty_map"),
            Some(RuleValue::Linear(10.0))
        );
        assert_eq!(
            value("judging.partial_credit"),
            Some(RuleValue::Flag(false))
        );
        assert_eq!(
            value("turn.max_consecutive_correct"),
            Some(RuleValue::Number(4.0))
        );
        assert_eq!(
            value("turn.bonus_after_consecutive"),
            Some(RuleValue::Streak {
                count: 3,
                award: 50
            }),
        );
        //  unset at the recipe level reports what the globals
        // decided, not a blank.
        assert_eq!(value("timer.enabled"), Some(RuleValue::Inherited(true)));
    }

    /// The wire shape Studio's `RuleEffect` type mirrors. `state` is flattened
    /// beside `key` and `value`, and a disabled entry carries the same
    /// `reason`/`detail` pair `settings_get.disabled` already sends, so
    /// `disabledReasonText` reads it unchanged.
    #[test]
    fn a_rule_serialises_the_way_studio_reads_it() {
        let mut g = game();
        g.judging.partial_credit = false;
        let p = preview(&g, &PreviewBoard::default());
        let json = serde_json::to_value(&p).expect("serialises");
        let rules = json["rules"].as_array().expect("an array");
        assert_eq!(rules.len(), AWARD_KEYS.len());

        let find = |key: &str| {
            rules
                .iter()
                .find(|r| r["key"] == key)
                .unwrap_or_else(|| panic!("no {key}"))
                .clone()
        };

        let partial = find("judging.partial_credit");
        assert_eq!(partial["state"], "off");
        assert_eq!(partial["value"]["kind"], "flag");
        assert_eq!(partial["value"]["value"], false);

        let mode = find("scoring.mode");
        assert_eq!(mode["state"], "active");
        assert_eq!(mode["value"]["kind"], "choice");
        assert_eq!(mode["value"]["value"], "difficulty");

        let flat = find("scoring.flat_points");
        assert_eq!(flat["state"], "disabled");
        assert_eq!(flat["reason"], "inert");
        assert!(
            flat["detail"].is_string(),
            "a disabled entry names the sibling"
        );
    }

    #[test]
    fn every_award_key_is_listed_so_the_table_cannot_omit_one() {
        let p = preview(&game(), &PreviewBoard::default());
        let keys: Vec<&str> = p.rules.iter().map(|r| r.key).collect();
        assert_eq!(
            keys,
            AWARD_KEYS.to_vec(),
            "rules must follow AWARD_KEYS exactly"
        );
        // `board.*` decides what a board may hold, not what an answer pays: the
        // Board section says it (P12.7), the award table has nothing to add.
        for key in crate::flags::GAME_AFFECTING_KEYS
            .iter()
            .filter(|key| !key.starts_with("board."))
        {
            assert!(
                keys.contains(key),
                "{key} freezes at play_start but is not explained",
            );
        }
    }
}
