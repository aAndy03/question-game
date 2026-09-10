/**
 * The Rules preview and the award ledger (P11.12).
 *
 * The host sends **codes**, never sentences: a `PreviewWarning` has a `code`, a
 * `SpeedOff` has a reason name, a `RuleEffect` is a key. Every readable string
 * for them is here, the way `RING_ROLE` and `disabledReasonText` already work.
 */

import type { BaseSource, LockSample, PreviewWarning, RuleValue, SpeedOff, TimerSource, Verdict } from '@/host/types'

const seconds = (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`

/** Enum variants the host sends by their serde name. */
const CHOICE: Record<string, string> = {
  flat: 'Flat',
  difficulty: 'By difficulty',
  lock_speed: 'Lock speed',
}

export const PREVIEW = {
  title: 'What these rules pay',
  hint: 'Computed by the host with the same arithmetic that scores a real answer.',
  loading: 'Working out what this game pays…',

  // ------------------------------------------------------------------ the path
  path: {
    title: 'The award, step by step',
    base: 'Base',
    speed: 'Speed',
    verdict: 'Verdict',
    bonus: 'Bonus',
    total: 'Total',
    dead: 'not in use',
  },

  // ---------------------------------------------------------------- the matrix
  matrix: {
    title: 'Points by difficulty and answer speed',
    difficulty: 'Difficulty',
    questions: (n: number) => (n === 1 ? '1 question' : `${n} questions`),
    noQuestions: 'not on this board',
    baseColumn: 'Base',
    correct: 'Correct answer',
    partial: 'Half-right (2 of 3)',
    incorrect: 'Wrong answer',
    incorrectAlways: 'Always 0, whatever else is set.',
    sampled: (shown: number, total: number) =>
      `Showing ${shown} of ${total} difficulties on this board, evenly spread.`,
    fallback: 'This game has no board yet, so these are sample difficulties.',
  },

  lock: (sample: LockSample): string => {
    switch (sample.kind) {
      case 'instant':
        return 'Instant'
      case 'quarters':
        return sample.left === 2 ? 'Half left' : `${sample.left}⁄4 left`
      case 'buzzer':
        return 'At the buzzer'
      case 'neverLocked':
        return 'Never locked'
      case 'operatorPace':
        return 'Any time'
    }
  },

  // ----------------------------------------------------------- the band ladder
  bands: {
    title: 'Difficulty bands',
    hint: 'Each band names the highest difficulty it covers. The first band a question fits wins; anything above the last band takes the last band’s award.',
    range: (from: number, upTo: number) => (from === upTo ? `${from}` : `${from}–${upTo}`),
    points: 'Pays',
    unreachable: 'Never reached',
    unreachableHint: 'An earlier band already covers this ceiling.',
    aboveLast: (upTo: number) => `Above ${upTo} also pays this.`,
  },

  // ----------------------------------------------------------------- the timer
  timer: {
    title: 'Countdown',
    operatorPace: 'Operator pace — no countdown, so no speed bonus.',
    from: (source: TimerSource): string => {
      switch (source) {
        case 'recipe':
          return 'from this game'
        case 'globals':
          return 'from the all-games default'
        case 'operator_pace':
          return 'operator pace'
      }
    },
    window: (ms: number, duration: number) =>
      ms >= duration
        ? 'The speed bonus is paid across the whole clock.'
        : `The speed bonus is paid over the first ${seconds(ms)} and is nothing after that.`,
    steps: (n: number) => `Banded into ${n} equal steps — every answer inside a step is worth exactly the same.`,
    perQuestion: (n: number) =>
      n === 1 ? '1 question sets its own countdown.' : `${n} questions set their own countdown.`,
  },

  // ----------------------------------------------------------------- the board
  board: {
    title: 'This game’s board',
    aligned: (per: number) => `Every domain holds ${per} questions on the same difficulty ladder.`,
    alignedHint: 'One table describes the whole board: every domain’s nth question is this difficulty.',
    uniform: (per: number) => `Every domain holds ${per} questions, but the ladders differ.`,
    ragged: (min: number, max: number) => `Domains hold between ${min} and ${max} questions.`,
    raggedHint: 'They empty at different rates, and a shorter domain has fewer rungs in its easy→hard walk. It does not change what a question pays.',
    empty: 'No questions on the board yet.',
    rung: 'Question',
    rungIndex: (n: number) => `#${n}`,
    domain: 'Domain',
    count: 'Questions',
    span: 'Difficulty',
    available: 'Points available',
    availableHint: 'Every question answered correctly, with no speed bonus.',
    ladder: 'Walk',
  },

  // --------------------------------------------------------------- the effects
  effects: {
    title: 'What each setting does',
    key: 'Setting',
    state: 'Right now',
    /** Live, and contributing. The value follows it. */
    live: 'In use',
    /**
     * Usable, but set to nothing. **Not the same as disabled** — the operator
     * can turn it on right now, and saying "in use" of a switch that is off is
     * the bug this state exists to prevent.
     */
    off: 'Off',
    notSet: 'Not set',
    noCap: 'No cap',
    operatorPace: 'Operator pace',
  },

  /** What a setting is currently set to, from the host's structured value. */
  value: (value: RuleValue): string => {
    switch (value.kind) {
      case 'unset':
        return PREVIEW.effects.notSet
      case 'flag':
        return value.value ? 'On' : 'Off'
      case 'points':
        return `${value.value} points`
      case 'number':
        return value.value === 0 ? PREVIEW.effects.off : String(value.value)
      case 'ms':
        return seconds(value.value)
      case 'choice':
        return CHOICE[value.value] ?? value.value
      case 'linear':
        return `Linear, ×${value.value} per difficulty point`
      case 'bands':
        return value.value === 1 ? '1 band' : `${value.value} bands`
      case 'fraction':
        return value.value >= 1 ? 'The whole clock' : `${Math.round(value.value * 100)}% of the clock`
      case 'streak':
        return `+${value.value.award} after ${value.value.count} in a row`
      case 'inherited':
        return value.value ? 'On (inherited)' : 'Off (inherited)'
    }
  },

  /** What each award key changes. One line, in the operator's terms. */
  changes: {
    'scoring.mode': 'Chooses the base: a flat number, the question’s difficulty, or lock speed over one of those.',
    'scoring.flat_points': 'The base every correct answer pays, whatever its difficulty.',
    'scoring.difficulty_map': 'Turns a difficulty into a base — a straight line, or bands.',
    'scoring.lock_speed.enabled': 'Adds the speed bonus on top of the flat or difficulty base.',
    'scoring.lock_speed_base': 'Which base the exclusive lock-speed mode multiplies.',
    'scoring.speed_weight': 'How much an instant answer is worth: an instant lock pays base × (1 + weight).',
    'scoring.speed_window': 'How long the speed bonus lasts — a share of the clock, or a fixed number of seconds.',
    'scoring.speed_steps': 'Rounds the speed bonus into equal bands, so close answers pay the same.',
    'timer.enabled': 'Off means operator pace: no countdown, no auto-lock, and no speed bonus.',
    'timer.duration_ms': 'The countdown a question gets, and the denominator the speed bonus divides by.',
    'judging.partial_credit': 'Lets a partly-correct multiple answer take a share instead of nothing.',
    'judging.order_matters': 'Makes position part of the answer, so a right set in the wrong order is wrong.',
    'turn.max_consecutive_correct': 'Ends the token after this many correct answers in a row. That answer still scores.',
    'turn.bonus_after_consecutive': 'A flat extra on the answer that reaches the streak, once per token.',
  } as Record<string, string>,

  // -------------------------------------------------------------- the warnings
  warning: (warning: PreviewWarning): string => {
    switch (warning.code) {
      case 'mixedDurations':
        return `${warning.questions === 1 ? 'One question sets' : `${warning.questions} questions set`} their own countdown, so the same answer time is not worth the same across the board. Set the speed window in seconds to fix that.`
      case 'speedWithoutTimer':
        return 'Lock-speed scoring is on, but this game runs at operator pace — there is no clock to measure, so every answer pays the bare base.'
      case 'bandsNotMonotonic':
        return 'A band pays less than the one below it, so a harder question is worth less.'
      case 'unreachableBand':
        return `Band ${warning.index + 1} can never pay: an earlier band already covers everything up to ${warning.upTo}.`
      case 'aboveLastBand':
        return `${warning.questions === 1 ? 'One question is' : `${warning.questions} questions are`} above the last band’s ceiling of ${warning.upTo}, so they all pay that band.`
      case 'bonusUnreachable':
        return `The streak bonus needs ${warning.count} in a row, but the cap ends the token at ${warning.cap}. It can never be paid.`
      case 'raggedBoard':
        return `Domains hold between ${warning.min} and ${warning.max} questions, so they empty at different rates. What a question pays is unaffected.`
      case 'flatBoard':
        return `Every question on this board is difficulty ${warning.difficulty}, so awarding by difficulty pays the same as a flat award.`
      case 'duplicateDifficulty':
        return `${warning.questions} questions in one domain are difficulty ${warning.difficulty}. A domain plays one question per difficulty, so this game will not start until one of them comes off the board.`
    }
  },

  // ----------------------------------------------------------------- the ledger
  ledger: {
    title: 'What was awarded, and why',
    hint: 'Every resolved turn of this Play, taken apart with the rules it was played under.',
    empty: 'No turns resolved yet.',
    emptyHint: 'A row appears here the moment an answer is revealed.',
    showWorking: 'Show working',
    turn: '#',
    team: 'Team',
    domain: 'Domain',
    question: 'Question',
    difficulty: 'Diff.',
    verdict: 'Result',
    lock: 'Locked',
    base: 'Base',
    speed: '× Speed',
    share: 'Share',
    bonus: 'Bonus',
    total: 'Total',
    none: '—',
    autoLocked: 'auto',
    tokenEnds: 'token ends',
    streak: (n: number) => `${n} in a row`,
    why: 'Why',
  },

  verdict: (verdict: Verdict): string => {
    switch (verdict) {
      case 'correct':
        return 'Correct'
      case 'incorrect':
        return 'Wrong'
      case 'partial':
        return 'Partly right'
    }
  },

  /** The base, in one sentence. */
  base: (source: BaseSource): string => {
    switch (source.kind) {
      case 'flat':
        return `flat award of ${source.points}`
      case 'linear':
        return `difficulty ${source.difficulty} × ${source.factor} per point`
      case 'band':
        return source.aboveLast
          ? `the last band (${source.from}–${source.upTo}), because the difficulty is above its ceiling`
          : `band ${source.index + 1} (${source.from}–${source.upTo})`
      case 'noBands':
        return 'no band table, so nothing'
    }
  },

  /** Why the speed factor did nothing. */
  speedOff: (reason: SpeedOff): string => {
    switch (reason) {
      case 'mode_off':
        return 'lock-speed scoring is off'
      case 'operator_pace':
        return 'the game runs at operator pace'
      case 'never_locked':
        return 'nothing was locked'
      case 'weight_zero':
        return 'the speed weight is 0'
      case 'outside_window':
        return 'the answer landed after the speed window closed'
    }
  },

  seconds,
} as const
