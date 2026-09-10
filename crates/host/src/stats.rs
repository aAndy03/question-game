//! Statistics (§11.K, P11) — the fold from Play logs to numbers.
//!
//! Statistics is a **projector**: it reads the log and writes nothing. There
//! is no `StatsService`, because there is no state to own — this module is a
//! pure function of the events it is handed, and `CatalogService::stats_query`
//! is the thin thing that fetches those events. That keeps SQL in
//! `catalog/store.rs` and keeps the domain arithmetic testable with a literal
//! log.
//!
//! ```text
//! events ──facts()──▶ [TurnFact]  ──aggregate(query)──▶ StatsResult
//! ```
//!
//! **A turn is the unit.** One resolved question — issued, answered, revealed
//! — is one [`TurnFact`], carrying everything any view needs: who, what,
//! which domain, how hard, how fast, what it was worth. Every metric in §11.K
//! is a fold over that row set, which is why one command feeds the Live view,
//! the All-data table, the entity cards and every chart.
//!
//! **An undone turn is not a fact.** `TurnInverted` takes a span out of the
//! projection (§2.7), and it takes the same span out of statistics — the
//! numbers here match the scoreboard on Stage because both fold the same log
//! the same way.
//!
//! **Labels come from the snapshot.** A Play's log is self-contained, so a
//! Play whose team was archived afterwards still reports that team's name.
//! The caller may overwrite a label with the current catalog row (§12,
//! "rename team → Statistics"); nothing here needs the catalog to work.

use std::collections::BTreeMap;

use serde::{Deserialize, Serialize};

use crate::event::{Event, EventKind, active_inversions, is_inverted};
use crate::explain::{self, AwardBreakdown};
use crate::ids::{DomainId, OperatorId, OptionId, PlayId, QuestionId, RecipeId, TeamId};
use crate::rules::{Verdict, judge};

// ------------------------------------------------------------------- the fact

/// One resolved turn, flattened. Everything a view can ask about a Play is
/// either a field here or a fold over these rows.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnFact {
    pub play_id: PlayId,
    pub recipe_id: RecipeId,
    /// When the turn *resolved* — the moment it counted.
    pub at_ms: u64,
    pub team_id: TeamId,
    pub team_name: String,
    pub domain_id: DomainId,
    pub domain_name: String,
    pub question_id: QuestionId,
    pub question_stem: String,
    /// 1–100, as frozen in the snapshot.
    pub difficulty: u8,
    pub verdict: Verdict,
    pub points: u32,
    pub bonus: u32,
    /// `None` under operator pace, or when the timer ran out with nothing locked.
    pub remaining_ms_at_lock: Option<u32>,
    /// The §2.18 cascade's answer at issue. `None` = operator pace.
    pub timer_duration_ms: Option<u32>,
    /// The T=0 table locked it, not the operator.
    pub auto_locked: bool,
    /// Consecutive correct answers on this token including this one, `0` when
    /// this answer was not correct. What decides the streak bonus (§4.4).
    pub streak: u32,
    /// The token moved on after this turn — a wrong answer, or the cap.
    pub token_ends: bool,
    /// Who was at the desk when it resolved (§2.26).
    pub operator_id: Option<OperatorId>,
    /// One active team: a rehearsal, excluded from All data unless asked for.
    pub rehearsal: bool,
}

impl TurnFact {
    /// How long the team took to lock, when both ends of the subtraction exist.
    pub fn lock_ms(&self) -> Option<u32> {
        match (self.timer_duration_ms, self.remaining_ms_at_lock) {
            (Some(duration), Some(remaining)) => Some(duration.saturating_sub(remaining)),
            _ => None,
        }
    }
}

/// One resolved turn with its award taken apart (P11.12).
///
/// The breakdown is recomputed from the Play's **frozen** settings and the
/// options the team actually locked, through [`crate::explain`] — the same
/// arithmetic `reveal_outcome` paid it with. Recomputing rather than recording
/// means the ledger works on logs written before this existed, and a rules
/// edit today can never rewrite what a Play paid yesterday.
/// **`fact.points + fact.bonus` is the truth; `award.total` is the working.**
/// They agree — `tests/demo_scenarios.rs` replays whole Plays and asserts it,
/// and `tests/award_compound.rs` holds the arithmetic down over the generated
/// compound space. But a log written by an older build is still a record of
/// what that Play paid, so the ledger displays the recorded number and uses
/// the breakdown to explain it. A recomputation can never rewrite a score.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TurnAward {
    #[serde(flatten)]
    pub fact: TurnFact,
    pub award: AwardBreakdown,
}

/// Fold one Play's log into its resolved turns, newest last.
///
/// The log is self-contained: `PlayLoaded` carries the snapshot, so the names
/// and difficulties come out of the same array the Play was played from. A
/// turn that is currently undone is not here at all.
pub fn facts(events: &[Event]) -> Vec<TurnFact> {
    awards(events).into_iter().map(|a| a.fact).collect()
}

/// The same fold, keeping each turn's award breakdown.
pub fn awards(events: &[Event]) -> Vec<TurnAward> {
    let Some(Event {
        kind: EventKind::PlayLoaded { snapshot },
        ..
    }) = events.first()
    else {
        return Vec::new();
    };

    let spans = active_inversions(events);
    let rehearsal = snapshot.teams.len() == 1;
    let mut operator: Option<OperatorId> = None;
    let mut open: Option<OpenTurn> = None;
    let mut consecutive: u32 = 0;
    let mut out: Vec<TurnAward> = Vec::new();

    for event in events {
        if is_inverted(&spans, event.seq) {
            // An inverted span may still carry the operator switch that
            // outlives it; everything else in it never happened.
            if let EventKind::OperatorSwitched { operator_id } = &event.kind {
                operator = Some(operator_id.clone());
            }
            continue;
        }
        match &event.kind {
            EventKind::OperatorSwitched { operator_id } => operator = Some(operator_id.clone()),
            // The streak is per token, so it resets exactly where `play.rs`
            // resets it — a new token, and the end of the last one.
            EventKind::TokenGiven { .. } => consecutive = 0,
            EventKind::QuestionIssued {
                domain,
                question,
                team,
                timer_duration_ms,
            } => {
                open = Some(OpenTurn {
                    domain: domain.clone(),
                    question: question.clone(),
                    team: team.clone(),
                    timer_duration_ms: *timer_duration_ms,
                    remaining_ms_at_lock: None,
                    auto_locked: false,
                    locked: None,
                })
            }
            EventKind::SelectionLocked {
                options,
                remaining_ms_at_lock,
                auto,
            } => {
                if let Some(turn) = open.as_mut() {
                    turn.remaining_ms_at_lock = *remaining_ms_at_lock;
                    turn.auto_locked = *auto;
                    turn.locked = Some(options.clone());
                }
            }
            EventKind::TurnResolved {
                verdict,
                points_awarded,
                bonus_awarded,
                token_ends,
            } => {
                let Some(turn) = open.take() else { continue };
                let (domain_name, question) = match snapshot.question(&turn.question) {
                    Some((domain, question)) => (domain.name.clone(), Some(question)),
                    None => (String::new(), None),
                };
                let difficulty = question.map(|q| q.difficulty).unwrap_or(0);
                consecutive = if *verdict == Verdict::Correct {
                    consecutive + 1
                } else {
                    0
                };
                let streak = consecutive;
                if *token_ends {
                    consecutive = 0;
                }

                // Re-judge from the frozen settings and the options actually
                // locked, then explain the award through the same function
                // that paid it. A question the snapshot no longer names can
                // still be explained down to "no question, so no options".
                let settings = &snapshot.settings;
                let judgement = judge(
                    turn.locked.as_deref(),
                    question.map(|q| q.correct_option_ids.as_slice()).unwrap_or(&[]),
                    &settings.judging,
                );
                let award = explain::explain(
                    &settings.scoring,
                    &settings.judging,
                    difficulty,
                    &judgement,
                    turn.remaining_ms_at_lock,
                    turn.timer_duration_ms,
                )
                .with_bonus(explain::bonus_for(
                    settings.turn.bonus_after_consecutive,
                    *verdict,
                    streak,
                ));

                let fact = TurnFact {
                    play_id: snapshot.play_id.clone(),
                    recipe_id: snapshot.recipe_id.clone(),
                    at_ms: event.at_ms,
                    team_name: snapshot
                        .team(&turn.team)
                        .map(|t| t.name.clone())
                        .unwrap_or_default(),
                    team_id: turn.team,
                    domain_id: turn.domain,
                    domain_name,
                    question_stem: question.map(|q| q.stem.clone()).unwrap_or_default(),
                    difficulty,
                    question_id: turn.question,
                    verdict: *verdict,
                    points: *points_awarded,
                    bonus: bonus_awarded.unwrap_or(0),
                    remaining_ms_at_lock: turn.remaining_ms_at_lock,
                    timer_duration_ms: turn.timer_duration_ms,
                    auto_locked: turn.auto_locked,
                    streak,
                    token_ends: *token_ends,
                    operator_id: operator.clone(),
                    rehearsal,
                };
                out.push(TurnAward { fact, award });
            }
            _ => {}
        }
    }
    out
}

struct OpenTurn {
    domain: DomainId,
    question: QuestionId,
    team: TeamId,
    timer_duration_ms: Option<u32>,
    remaining_ms_at_lock: Option<u32>,
    auto_locked: bool,
    /// What the team locked, kept so the ledger can re-judge the answer and
    /// say *why* it was worth what it was worth.
    locked: Option<Vec<OptionId>>,
}

// ------------------------------------------------------------------ the query

/// What to count, sliced how. One document, because §11.K's "compound filters
/// (all variables + time)" is one question asked many ways, not many commands.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatsQuery {
    pub filter: StatsFilter,
    pub group_by: StatsDimension,
    /// The columns, in order. Empty means [`StatsMetric::DEFAULTS`].
    pub metrics: Vec<StatsMetric>,
    /// Rows to return after ordering. `None` = all of them.
    pub limit: Option<u32>,
    /// How many individual turns to return alongside the rows, newest first —
    /// the award ledger (P11.12). `0`, the default, returns none, so every
    /// existing caller pays nothing for a view it does not draw. One command,
    /// one document (§13.1): the ledger is a *detail level* of the same
    /// question, not a second stats verb.
    pub detail: u32,
}

/// Every variable §11.K offers, and time. An empty list does not filter;
/// a listed value is kept. Filters intersect.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct StatsFilter {
    /// Resolved at or after this instant.
    pub from_ms: Option<u64>,
    /// Resolved at or before this instant.
    pub to_ms: Option<u64>,
    pub play_ids: Vec<PlayId>,
    pub recipe_ids: Vec<RecipeId>,
    pub operator_ids: Vec<OperatorId>,
    pub team_ids: Vec<TeamId>,
    pub domain_ids: Vec<DomainId>,
    pub question_ids: Vec<QuestionId>,
    pub verdicts: Vec<Verdict>,
    /// Inclusive difficulty band, 1–100.
    pub min_difficulty: Option<u8>,
    pub max_difficulty: Option<u8>,
    /// A one-team Play is legal (§4.3) and skews an average; off by default.
    pub include_rehearsal: bool,
}

impl StatsFilter {
    /// Every Play this filter could possibly touch, or `None` for "any Play".
    /// `CatalogService` uses it to avoid reading logs it would only discard.
    pub fn play_scope(&self) -> Option<&[PlayId]> {
        if self.play_ids.is_empty() {
            None
        } else {
            Some(&self.play_ids)
        }
    }

    pub fn keeps(&self, fact: &TurnFact) -> bool {
        if !self.include_rehearsal && fact.rehearsal {
            return false;
        }
        if self.from_ms.is_some_and(|from| fact.at_ms < from) {
            return false;
        }
        if self.to_ms.is_some_and(|to| fact.at_ms > to) {
            return false;
        }
        if self.min_difficulty.is_some_and(|min| fact.difficulty < min) {
            return false;
        }
        if self.max_difficulty.is_some_and(|max| fact.difficulty > max) {
            return false;
        }
        listed(&self.play_ids, &fact.play_id)
            && listed(&self.recipe_ids, &fact.recipe_id)
            && listed(&self.team_ids, &fact.team_id)
            && listed(&self.domain_ids, &fact.domain_id)
            && listed(&self.question_ids, &fact.question_id)
            && (self.verdicts.is_empty() || self.verdicts.contains(&fact.verdict))
            && (self.operator_ids.is_empty()
                || fact
                    .operator_id
                    .as_ref()
                    .is_some_and(|id| self.operator_ids.contains(id)))
    }
}

fn listed<T: PartialEq>(allowed: &[T], value: &T) -> bool {
    allowed.is_empty() || allowed.contains(value)
}

/// What one row of the result stands for.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatsDimension {
    #[default]
    Team,
    Domain,
    Question,
    /// The 1–100 band, in tens: `10` is 1–10, `20` is 11–20.
    Difficulty,
    Operator,
    Recipe,
    Play,
    /// UTC day, `YYYY-MM-DD`, for the time series.
    Day,
}

/// A number a row carries. The unit is the metric's, not the caller's, so a
/// table and a chart format the same value the same way.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatsMetric {
    /// Resolved turns.
    Turns,
    Correct,
    Incorrect,
    Partial,
    /// `correct / turns`, 0–1.
    Accuracy,
    /// Points awarded, bonus included — the scoreboard's number.
    Points,
    Bonus,
    /// `points / turns`.
    AvgPoints,
    /// Mean time from issue to lock, in ms. Skips operator-pace turns.
    AvgLockMs,
    /// The quickest lock in the group, in ms.
    FastestLockMs,
    /// Distinct Plays behind the row.
    Plays,
}

impl StatsMetric {
    /// What the table shows when the caller names no columns.
    pub const DEFAULTS: &'static [StatsMetric] = &[
        StatsMetric::Turns,
        StatsMetric::Correct,
        StatsMetric::Accuracy,
        StatsMetric::Points,
    ];

    /// How to render it. The frontend switches on this and never on the name.
    pub fn unit(self) -> StatsUnit {
        match self {
            StatsMetric::Accuracy => StatsUnit::Ratio,
            StatsMetric::Points | StatsMetric::Bonus | StatsMetric::AvgPoints => StatsUnit::Points,
            StatsMetric::AvgLockMs | StatsMetric::FastestLockMs => StatsUnit::Milliseconds,
            _ => StatsUnit::Count,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum StatsUnit {
    Count,
    Points,
    Ratio,
    Milliseconds,
}

// ------------------------------------------------------------------ the result

/// One group: its key, its label, and the metrics in the order asked for.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsRow {
    /// The id of the thing grouped, or the bucket (`"30"`, `"2026-09-06"`).
    pub key: String,
    /// The name as the Play knew it. The caller may replace it with the
    /// catalog's current name (§12); it is never blank for a live row.
    pub label: String,
    /// One value per requested metric, same order. A metric with nothing to
    /// average is `None`, which is not the same as `0`.
    pub values: Vec<Option<f64>>,
    pub turns: u32,
    pub plays: u32,
}

/// One answer, whatever asked. The Live view is this with a `play_ids` of one.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsResult {
    pub group_by: StatsDimension,
    pub metrics: Vec<StatsMetric>,
    /// Ordered by the first metric, descending, then by label.
    pub rows: Vec<StatsRow>,
    /// The same metrics over every kept fact, ungrouped.
    pub totals: StatsRow,
    /// Distinct Plays and resolved turns behind the whole answer.
    pub play_count: u32,
    pub turn_count: u32,
    /// The most recent `query.detail` turns that passed the filter, newest
    /// first, each with its award taken apart. Empty unless asked for.
    #[serde(default)]
    pub turns: Vec<TurnAward>,
}

/// Aggregate facts into rows. Pure: the same facts and the same query always
/// give the same answer, which is what makes the Live view refreshable on an
/// event count rather than a clock.
pub fn aggregate(facts: &[TurnFact], query: &StatsQuery) -> StatsResult {
    let refs: Vec<&TurnFact> = facts.iter().collect();
    fold(&refs, query, &[])
}

/// The same, keeping the award breakdowns so `query.detail` can return the
/// ledger. `CatalogService::stats_query` calls this one; `aggregate` stays for
/// callers that only want numbers.
pub fn aggregate_awards(awards: &[TurnAward], query: &StatsQuery) -> StatsResult {
    let refs: Vec<&TurnFact> = awards.iter().map(|a| &a.fact).collect();
    fold(&refs, query, awards)
}

fn fold(facts: &[&TurnFact], query: &StatsQuery, awards: &[TurnAward]) -> StatsResult {
    let metrics: Vec<StatsMetric> = if query.metrics.is_empty() {
        StatsMetric::DEFAULTS.to_vec()
    } else {
        query.metrics.clone()
    };
    let kept: Vec<&TurnFact> = facts
        .iter()
        .copied()
        .filter(|f| query.filter.keeps(f))
        .collect();

    let mut groups: BTreeMap<String, Group> = BTreeMap::new();
    for fact in &kept {
        let (key, label) = group_of(fact, query.group_by);
        groups.entry(key.clone()).or_insert_with(|| Group::new(label)).push(fact);
    }

    let mut rows: Vec<StatsRow> = groups
        .into_iter()
        .map(|(key, group)| group.row(key, &metrics))
        .collect();
    // The first column is what the eye reads first, so it is what orders the
    // table; the label breaks ties so a redraw never shuffles equal rows.
    rows.sort_by(|a, b| {
        b.values
            .first()
            .copied()
            .flatten()
            .unwrap_or(f64::MIN)
            .total_cmp(&a.values.first().copied().flatten().unwrap_or(f64::MIN))
            .then_with(|| a.label.cmp(&b.label))
    });
    if let Some(limit) = query.limit {
        rows.truncate(limit as usize);
    }

    let mut all = Group::new(String::new());
    for fact in &kept {
        all.push(fact);
    }
    let totals = all.row(String::new(), &metrics);
    // The ledger is the tail of the log, so it is taken from the end and
    // reversed: the turn that just resolved is the one the operator is
    // looking for.
    let turns: Vec<TurnAward> = if query.detail == 0 {
        Vec::new()
    } else {
        let mut recent: Vec<TurnAward> = awards
            .iter()
            .filter(|a| query.filter.keeps(&a.fact))
            .rev()
            .take(query.detail as usize)
            .cloned()
            .collect();
        recent.sort_by(|a, b| b.fact.at_ms.cmp(&a.fact.at_ms));
        recent
    };
    StatsResult {
        group_by: query.group_by,
        metrics,
        rows,
        turn_count: totals.turns,
        play_count: totals.plays,
        totals,
        turns,
    }
}

fn group_of(fact: &TurnFact, by: StatsDimension) -> (String, String) {
    match by {
        StatsDimension::Team => (fact.team_id.to_string(), fact.team_name.clone()),
        StatsDimension::Domain => (fact.domain_id.to_string(), fact.domain_name.clone()),
        StatsDimension::Question => (fact.question_id.to_string(), fact.question_stem.clone()),
        StatsDimension::Difficulty => {
            let band = band_of(fact.difficulty);
            (band.to_string(), format!("{}–{}", band.saturating_sub(9), band))
        }
        StatsDimension::Operator => match &fact.operator_id {
            Some(id) => (id.to_string(), id.to_string()),
            None => (String::new(), String::new()),
        },
        StatsDimension::Recipe => (fact.recipe_id.to_string(), fact.recipe_id.to_string()),
        StatsDimension::Play => (fact.play_id.to_string(), fact.play_id.to_string()),
        StatsDimension::Day => {
            let day = day_of(fact.at_ms);
            (day.clone(), day)
        }
    }
}

/// The 1–100 scale in tens: 1–10 → 10, 11–20 → 20, … A difficulty the
/// snapshot did not carry (0) bands as 0 rather than pretending to be easy.
fn band_of(difficulty: u8) -> u8 {
    if difficulty == 0 {
        return 0;
    }
    difficulty.div_ceil(10) * 10
}

/// `YYYY-MM-DD` in UTC, from epoch milliseconds. No `chrono`: the civil-date
/// algorithm is fifteen lines and this is the only place the host needs one.
fn day_of(at_ms: u64) -> String {
    let days = (at_ms / 86_400_000) as i64;
    let (y, m, d) = civil_from_days(days);
    format!("{y:04}-{m:02}-{d:02}")
}

/// Howard Hinnant's `civil_from_days`, for days since 1970-01-01.
fn civil_from_days(z: i64) -> (i64, u32, u32) {
    let z = z + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let y = yoe + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

/// The running totals behind one row.
struct Group {
    label: String,
    turns: u32,
    correct: u32,
    incorrect: u32,
    partial: u32,
    points: u64,
    bonus: u64,
    lock_ms_total: u64,
    lock_ms_count: u32,
    fastest_lock_ms: Option<u32>,
    plays: std::collections::BTreeSet<String>,
}

impl Group {
    fn new(label: String) -> Self {
        Group {
            label,
            turns: 0,
            correct: 0,
            incorrect: 0,
            partial: 0,
            points: 0,
            bonus: 0,
            lock_ms_total: 0,
            lock_ms_count: 0,
            fastest_lock_ms: None,
            plays: std::collections::BTreeSet::new(),
        }
    }

    fn push(&mut self, fact: &TurnFact) {
        self.turns += 1;
        match fact.verdict {
            Verdict::Correct => self.correct += 1,
            Verdict::Incorrect => self.incorrect += 1,
            Verdict::Partial => self.partial += 1,
        }
        self.points += u64::from(fact.points) + u64::from(fact.bonus);
        self.bonus += u64::from(fact.bonus);
        if let Some(lock) = fact.lock_ms() {
            self.lock_ms_total += u64::from(lock);
            self.lock_ms_count += 1;
            self.fastest_lock_ms = Some(self.fastest_lock_ms.map_or(lock, |best| best.min(lock)));
        }
        self.plays.insert(fact.play_id.to_string());
        if self.label.is_empty() {
            // A snapshot that lost the row still gets a readable line.
            self.label.clone_from(&fact.team_name);
        }
    }

    fn row(&self, key: String, metrics: &[StatsMetric]) -> StatsRow {
        let turns = f64::from(self.turns);
        let values = metrics
            .iter()
            .map(|metric| match metric {
                StatsMetric::Turns => Some(turns),
                StatsMetric::Correct => Some(f64::from(self.correct)),
                StatsMetric::Incorrect => Some(f64::from(self.incorrect)),
                StatsMetric::Partial => Some(f64::from(self.partial)),
                StatsMetric::Accuracy => (self.turns > 0).then(|| f64::from(self.correct) / turns),
                StatsMetric::Points => Some(self.points as f64),
                StatsMetric::Bonus => Some(self.bonus as f64),
                StatsMetric::AvgPoints => (self.turns > 0).then(|| self.points as f64 / turns),
                StatsMetric::AvgLockMs => (self.lock_ms_count > 0)
                    .then(|| self.lock_ms_total as f64 / f64::from(self.lock_ms_count)),
                StatsMetric::FastestLockMs => self.fastest_lock_ms.map(f64::from),
                StatsMetric::Plays => Some(self.plays.len() as f64),
            })
            .collect();
        StatsRow {
            key,
            label: self.label.clone(),
            values,
            turns: self.turns,
            plays: self.plays.len() as u32,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::settings::FrozenSettings;
    use crate::snapshot::{PlaySnapshot, SnapshotDomain, SnapshotOption, SnapshotQuestion, SnapshotTeam};

    fn question(id: &str, stem: &str, difficulty: u8) -> SnapshotQuestion {
        SnapshotQuestion {
            id: QuestionId::new(id),
            stem: stem.to_owned(),
            options: vec![
                SnapshotOption {
                    id: crate::ids::OptionId::new(format!("{id}-a")),
                    text: "A".to_owned(),
                },
                SnapshotOption {
                    id: crate::ids::OptionId::new(format!("{id}-b")),
                    text: "B".to_owned(),
                },
            ],
            correct_option_ids: vec![crate::ids::OptionId::new(format!("{id}-a"))],
            difficulty,
            duration_ms: None,
        }
    }

    fn snapshot(teams: usize) -> PlaySnapshot {
        let roster: Vec<SnapshotTeam> = ["Red", "Blue"]
            .iter()
            .take(teams)
            .enumerate()
            .map(|(i, name)| SnapshotTeam::new(format!("team-{i}"), *name, *name))
            .collect();
        PlaySnapshot::new(
            "play-1",
            "recipe-1",
            roster,
            vec![SnapshotDomain::new(
                "dom-geo",
                "Geography",
                "GEO_101",
                vec![question("q1", "Largest ocean?", 10), question("q2", "Capital?", 30)],
            )],
            FrozenSettings::default(),
        )
    }

    /// A log: load, start, then `turns` resolved questions, alternating teams.
    fn log(turns: &[(u32, Verdict, u32, Option<u32>)]) -> Vec<Event> {
        let play = PlayId::new("play-1");
        let mut events = vec![
            Event::new(&play, 1, 1_000, EventKind::PlayLoaded { snapshot: Box::new(snapshot(2)) }),
            Event::new(&play, 2, 1_000, EventKind::PlayStarted),
        ];
        let mut seq = 2;
        for (index, (team, verdict, points, remaining)) in turns.iter().enumerate() {
            let at = 2_000 + (index as u64) * 1_000;
            seq += 1;
            events.push(Event::new(
                &play,
                seq,
                at,
                EventKind::QuestionIssued {
                    domain: DomainId::new("dom-geo"),
                    question: QuestionId::new(if index % 2 == 0 { "q1" } else { "q2" }),
                    team: TeamId::new(format!("team-{team}")),
                    timer_duration_ms: Some(30_000),
                },
            ));
            seq += 1;
            events.push(Event::new(
                &play,
                seq,
                at,
                EventKind::SelectionLocked {
                    options: vec![],
                    remaining_ms_at_lock: *remaining,
                    auto: false,
                },
            ));
            seq += 1;
            events.push(Event::new(
                &play,
                seq,
                at,
                EventKind::TurnResolved {
                    verdict: *verdict,
                    points_awarded: *points,
                    bonus_awarded: None,
                    token_ends: matches!(verdict, Verdict::Incorrect),
                },
            ));
        }
        events
    }

    #[test]
    fn a_turn_carries_the_snapshot_s_names_and_difficulty() {
        let facts = facts(&log(&[(0, Verdict::Correct, 20, Some(18_000))]));
        assert_eq!(facts.len(), 1);
        let fact = &facts[0];
        assert_eq!(fact.team_name, "Red");
        assert_eq!(fact.domain_name, "Geography");
        assert_eq!(fact.question_stem, "Largest ocean?");
        assert_eq!(fact.difficulty, 10);
        assert_eq!(fact.points, 20);
        assert_eq!(fact.lock_ms(), Some(12_000), "30s − 18s remaining");
    }

    #[test]
    fn an_undone_turn_is_not_a_fact() {
        let mut events = log(&[(0, Verdict::Correct, 20, None), (1, Verdict::Incorrect, 0, None)]);
        // Invert the second turn, exactly as `undo_turn` does.
        let target = events[events.len() - 1].id.clone();
        let from = events[events.len() - 3].seq;
        let to = events[events.len() - 1].seq;
        let seq = events.len() as u64 + 1;
        events.push(Event::new(
            &PlayId::new("play-1"),
            seq,
            9_000,
            EventKind::TurnInverted { target_event_id: target.clone(), from_seq: from, to_seq: to },
        ));
        assert_eq!(facts(&events).len(), 1, "the undone turn is gone");

        // Redo puts it back, and so do the numbers.
        events.push(Event::new(
            &PlayId::new("play-1"),
            seq + 1,
            9_500,
            EventKind::TurnReapplied { target_event_id: target },
        ));
        assert_eq!(facts(&events).len(), 2);
    }

    #[test]
    fn an_empty_or_headless_log_has_no_facts() {
        assert!(facts(&[]).is_empty());
        let stray = Event::new(&PlayId::new("play-1"), 1, 0, EventKind::PlayStarted);
        assert!(facts(&[stray]).is_empty());
    }

    #[test]
    fn the_default_columns_answer_the_scoreboard() {
        let facts = facts(&log(&[
            (0, Verdict::Correct, 20, Some(20_000)),
            (1, Verdict::Incorrect, 0, Some(10_000)),
            (0, Verdict::Correct, 30, Some(24_000)),
        ]));
        let result = aggregate(&facts, &StatsQuery::default());
        assert_eq!(result.metrics, StatsMetric::DEFAULTS.to_vec());
        assert_eq!(result.turn_count, 3);
        assert_eq!(result.play_count, 1);
        // Ordered by the first column (turns), so Red leads.
        assert_eq!(result.rows[0].label, "Red");
        assert_eq!(result.rows[0].values, vec![Some(2.0), Some(2.0), Some(1.0), Some(50.0)]);
        assert_eq!(result.rows[1].label, "Blue");
        assert_eq!(result.rows[1].values, vec![Some(1.0), Some(0.0), Some(0.0), Some(0.0)]);
        assert_eq!(result.totals.values[3], Some(50.0), "points total");
    }

    #[test]
    fn a_metric_with_nothing_to_average_is_none_not_zero() {
        // Operator pace: no duration, so no lock time exists to average.
        let play = PlayId::new("play-1");
        let mut events = log(&[(0, Verdict::Correct, 20, None)]);
        if let EventKind::QuestionIssued { timer_duration_ms, .. } = &mut events[2].kind {
            *timer_duration_ms = None;
        }
        let result = aggregate(
            &facts(&events),
            &StatsQuery {
                metrics: vec![StatsMetric::AvgLockMs, StatsMetric::FastestLockMs],
                ..StatsQuery::default()
            },
        );
        assert_eq!(result.rows[0].values, vec![None, None]);
        assert_eq!(play.to_string(), "play-1");
    }

    #[test]
    fn filters_intersect_and_time_is_one_of_them() {
        let facts = facts(&log(&[
            (0, Verdict::Correct, 20, None),
            (1, Verdict::Correct, 20, None),
            (0, Verdict::Incorrect, 0, None),
        ]));
        let only_red = StatsFilter {
            team_ids: vec![TeamId::new("team-0")],
            ..StatsFilter::default()
        };
        assert_eq!(facts.iter().filter(|f| only_red.keeps(f)).count(), 2);

        let red_and_correct = StatsFilter {
            verdicts: vec![Verdict::Correct],
            ..only_red.clone()
        };
        assert_eq!(facts.iter().filter(|f| red_and_correct.keeps(f)).count(), 1);

        let after_the_first = StatsFilter {
            from_ms: Some(3_000),
            ..StatsFilter::default()
        };
        assert_eq!(facts.iter().filter(|f| after_the_first.keeps(f)).count(), 2);
    }

    #[test]
    fn a_rehearsal_is_excluded_unless_asked_for() {
        let play = PlayId::new("play-1");
        let mut events = log(&[(0, Verdict::Correct, 20, None)]);
        events[0] = Event::new(&play, 1, 1_000, EventKind::PlayLoaded { snapshot: Box::new(snapshot(1)) });
        let facts = facts(&events);
        assert!(facts[0].rehearsal);
        assert_eq!(aggregate(&facts, &StatsQuery::default()).turn_count, 0);
        let asked = StatsQuery {
            filter: StatsFilter { include_rehearsal: true, ..StatsFilter::default() },
            ..StatsQuery::default()
        };
        assert_eq!(aggregate(&facts, &asked).turn_count, 1);
    }

    #[test]
    fn every_dimension_groups_something() {
        let facts = facts(&log(&[
            (0, Verdict::Correct, 20, Some(20_000)),
            (1, Verdict::Incorrect, 0, Some(10_000)),
        ]));
        for by in [
            StatsDimension::Team,
            StatsDimension::Domain,
            StatsDimension::Question,
            StatsDimension::Difficulty,
            StatsDimension::Operator,
            StatsDimension::Recipe,
            StatsDimension::Play,
            StatsDimension::Day,
        ] {
            let result = aggregate(&facts, &StatsQuery { group_by: by, ..StatsQuery::default() });
            assert!(!result.rows.is_empty(), "{by:?} grouped nothing");
            assert_eq!(result.turn_count, 2, "{by:?} lost a turn");
        }
    }

    #[test]
    fn the_difficulty_bands_are_tens() {
        assert_eq!(band_of(1), 10);
        assert_eq!(band_of(10), 10);
        assert_eq!(band_of(11), 20);
        assert_eq!(band_of(100), 100);
        assert_eq!(band_of(0), 0);
    }

    #[test]
    fn a_day_is_the_utc_date_of_the_instant() {
        assert_eq!(day_of(0), "1970-01-01");
        assert_eq!(day_of(1_757_160_000_000), "2025-09-06");
        assert_eq!(day_of(86_400_000 - 1), "1970-01-01");
        assert_eq!(day_of(86_400_000), "1970-01-02");
    }
}
