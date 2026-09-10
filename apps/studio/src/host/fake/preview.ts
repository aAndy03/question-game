import type { AwardBreakdown, RulesPreview, TurnAward } from '../types'

/**
 * A canned `rules_preview` and a canned award ledger for the in-memory host
 * (P11.12).
 *
 * **These are fixtures, not a second rules engine.** The arithmetic belongs to
 * `crates/host/src/explain.rs` and is tested there over the whole compound
 * space; what a Studio test — or `?fake` shell work — needs is *an* answer of
 * the right shape, with numbers that look like real ones so a layout can be
 * judged. They do not change when the settings do. If you are reading a number
 * here as if it were the rules, you are reading the wrong file.
 *
 * The document behind them: award by difficulty, linear ×10, lock-speed on at
 * weight 1.0 over the whole 30 s clock.
 */

const WEIGHT = 1
const DURATION = 30_000

function breakdown(difficulty: number, remainingMs: number | null): AwardBreakdown {
  const base = difficulty * 10
  const progress = remainingMs === null ? 0 : remainingMs / DURATION
  const on = progress > 0
  const multiplier = on ? 1 + WEIGHT * progress : 1
  const scaled = Math.floor(base * multiplier)
  return {
    judgement: { verdict: 'correct', correctLocked: 1, incorrectLocked: 0, correctTotal: 1 },
    base,
    baseFrom: { kind: 'linear', factor: 10, difficulty },
    speed: on
      ? {
          state: 'on',
          weight: WEIGHT,
          durationMs: DURATION,
          windowMs: DURATION,
          elapsedMs: DURATION - (remainingMs ?? 0),
          remainingMs: remainingMs ?? 0,
          steps: null,
          progress,
          multiplier,
        }
      : { state: 'off', reason: remainingMs === null ? 'never_locked' : 'outside_window' },
    scaled,
    share: null,
    points: scaled,
    bonus: null,
    total: scaled,
  }
}

const COLUMNS: RulesPreview['columns'] = [
  { lock: { kind: 'instant' }, remainingMs: DURATION },
  { lock: { kind: 'quarters', left: 3 }, remainingMs: 22_500 },
  { lock: { kind: 'quarters', left: 2 }, remainingMs: 15_000 },
  { lock: { kind: 'quarters', left: 1 }, remainingMs: 7_500 },
  { lock: { kind: 'buzzer' }, remainingMs: 0 },
  { lock: { kind: 'neverLocked' }, remainingMs: null },
]

function row(difficulty: number, questionCount: number, domains: string[]): RulesPreview['rows'][number] {
  return {
    difficulty,
    questionCount,
    domains,
    base: difficulty * 10,
    baseFrom: { kind: 'linear', factor: 10, difficulty },
    correct: COLUMNS.map((column) => breakdown(difficulty, column.remainingMs)),
    partial: null,
    incorrect: 0,
  }
}

/**
 * The demo board as `devFake` actually seeds it: History 20 / 45 / 70 (q-h3
 * carries a per-game overlay) and Technology 15 / 60. Ragged on purpose — the
 * fixture describes the recipe it is shown under, and the ragged branch is the
 * one worth being able to look at while building the panel.
 */
export const FAKE_PREVIEW: RulesPreview = {
  timer: {
    enabled: true,
    durationMs: DURATION,
    source: 'globals',
    perQuestion: 0,
    speedWindowMs: DURATION,
  },
  bands: [],
  columns: COLUMNS,
  rows: [
    row(15, 1, ['Technology']),
    row(20, 1, ['History']),
    row(45, 1, ['History']),
    row(60, 1, ['Technology']),
    row(70, 1, ['History']),
  ],
  board: {
    kind: 'ragged',
    min: 2,
    max: 3,
    domains: [
      {
        id: 'dom-history',
        name: 'History',
        questions: 3,
        minDifficulty: 20,
        maxDifficulty: 70,
        ladder: [20, 45, 70],
        pointsAvailable: 200 + 450 + 700,
      },
      {
        id: 'dom-tech',
        name: 'Technology',
        questions: 2,
        minDifficulty: 15,
        maxDifficulty: 60,
        ladder: [15, 60],
        pointsAvailable: 150 + 600,
      },
    ],
  },
  // Deliberately mixed: an active key, a switched-off one and a disabled one,
  // so shell work can see all three states of the "Right now" column at once.
  rules: [
    { key: 'scoring.mode', state: 'active', value: { kind: 'choice', value: 'difficulty' } },
    { key: 'scoring.flat_points', state: 'disabled', reason: 'inert', detail: 'no scoring path uses the flat base', value: { kind: 'points', value: 10 } },
    { key: 'scoring.difficulty_map', state: 'active', value: { kind: 'linear', value: 10 } },
    { key: 'scoring.lock_speed.enabled', state: 'active', value: { kind: 'flag', value: true } },
    { key: 'scoring.lock_speed_base', state: 'disabled', reason: 'inert', detail: 'scoring.mode is not lock_speed', value: { kind: 'choice', value: 'difficulty' } },
    { key: 'scoring.speed_weight', state: 'active', value: { kind: 'number', value: 1 } },
    { key: 'scoring.speed_window', state: 'active', value: { kind: 'fraction', value: 1 } },
    { key: 'scoring.speed_steps', state: 'off', value: { kind: 'unset' } },
    { key: 'timer.enabled', state: 'active', value: { kind: 'inherited', value: true } },
    { key: 'timer.duration_ms', state: 'active', value: { kind: 'ms', value: DURATION } },
    { key: 'judging.partial_credit', state: 'off', value: { kind: 'flag', value: false } },
    { key: 'judging.order_matters', state: 'off', value: { kind: 'flag', value: false } },
    { key: 'turn.max_consecutive_correct', state: 'off', value: { kind: 'unset' } },
    { key: 'turn.bonus_after_consecutive', state: 'off', value: { kind: 'unset' } },
  ],
  effects: [
    { key: 'scoring.flat_points', reason: 'inert', detail: 'no scoring path uses the flat base' },
    { key: 'scoring.lock_speed_base', reason: 'inert', detail: 'scoring.mode is not lock_speed' },
  ],
  warnings: [{ code: 'raggedBoard', min: 2, max: 3 }],
}

/** Four turns of a Play, each with its award taken apart. */
export const FAKE_LEDGER: readonly TurnAward[] = [
  turn('q-t2', 'Technology', 'dom-tech', 'Beta', 'team-beta', 60, 'correct', 2, 18_000, 4_000),
  turn('q-t1', 'Technology', 'dom-tech', 'Beta', 'team-beta', 15, 'correct', 1, 24_000, 3_000),
  turn('q-h2', 'History', 'dom-history', 'Alpha', 'team-alpha', 45, 'incorrect', 0, 9_000, 2_000),
  turn('q-h1', 'History', 'dom-history', 'Alpha', 'team-alpha', 20, 'correct', 1, 27_000, 1_000),
]

function turn(
  questionId: string,
  domainName: string,
  domainId: string,
  teamName: string,
  teamId: string,
  difficulty: number,
  verdict: TurnAward['verdict'],
  streak: number,
  remainingMs: number,
  atMs: number,
): TurnAward {
  const award = breakdown(difficulty, remainingMs)
  const scored = verdict === 'correct'
  return {
    playId: 'fake-play',
    recipeId: 'recipe-demo',
    atMs,
    teamId,
    teamName,
    domainId,
    domainName,
    questionId,
    questionStem: `${domainName} question`,
    difficulty,
    verdict,
    points: scored ? award.points : 0,
    bonus: 0,
    remainingMsAtLock: remainingMs,
    timerDurationMs: DURATION,
    autoLocked: false,
    streak,
    tokenEnds: verdict !== 'correct',
    operatorId: null,
    rehearsal: false,
    award: scored
      ? award
      : {
          ...award,
          judgement: { verdict: 'incorrect', correctLocked: 0, incorrectLocked: 1, correctTotal: 1 },
          points: 0,
          total: 0,
        },
  }
}
