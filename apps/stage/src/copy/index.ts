/**
 * Stage copy — every audience-readable string that is NOT derived from the
 * Play, in one place.
 *
 * Two kinds of text reach Stage:
 *   - derived from the game: team names, domain names, difficulty, stems,
 *     options, points, ranks, clocks. These arrive in `play-state` and are
 *     never written here.
 *   - authored: HUD labels, delimiters, verdict wording, the idle tagline.
 *     These are here, so an operator-editable copy table (Screens tab, a
 *     later phase) has exactly one thing to override.
 *
 * Components import from this module; they never carry a string literal that
 * an operator might want to change. Keep values in the design system's voice:
 * HUD-terse, `//` as the category/value delimiter, no emoji.
 */

import type { OutcomeVerdict, StageScreen } from '@questiongame/contract'

export const STAGE_COPY = {
  /** The `//` pair that separates a category from its value. */
  delimiter: '//',

  /** Brackets around a running clock: `[ 00:12:20 ]`. */
  clockOpen: '[ ',
  clockClose: ' ]',

  /** Header: `<brand> | <partner>` on the left, the Play clock on the right. */
  headerBrand: 'HOPE CHALLENGE',
  headerPartner: 'AMiCUS',

  /** HUD labels. */
  domainLabel: 'DOMAIN',
  sessionLabel: 'SESSION',
  /** Authored per tournament; the Figma sample reads `2026 - 2027`. */
  sessionValue: '2026 - 2027',

  /** Per-screen body title, `<title> // <subject>`. Empty means no title. */
  screenTitle: {
    idle: '',
    teamOrder: 'PLAYING SEQUENCE',
    chooseDomain: 'SELECT CATEGORY',
    question: '',
    scoreboard: 'CURRENT STANDINGS',
    finalLeaderboard: 'TOURNAMENT CHAMPION',
    currentTeam: 'CURRENT TEAM',
  } satisfies Record<StageScreen, string>,

  /** Idle screen. Everything but the wordmark is authored. */
  idleEyebrow: 'HOPE CHALLENGE X AMiCUS',
  idleTagline: 'Choose your domain!',
  idleStatus: 'AWAITING_GAME_START...',

  /** Play clock: how long the game has been running. */
  playClockLabel: 'TIMER',
  playClockValue: 'ELAPSED',

  /** Question countdown. */
  timerLabel: 'TIMER',
  timerValue: 'REMAINING',

  /** Question: the timer turns urgent below this many seconds. */
  timerUrgentSeconds: 5,

  /** Result widget. */
  resultLabel: 'RESULT',
  verdict: {
    correct: 'ALL CORRECT',
    incorrect: 'INCORRECT',
    partial: 'EXTRA SELECTION',
  } satisfies Record<OutcomeVerdict, string>,
  bonusLabel: 'BONUS',

  /** Points unit, after the figure: `+500 PTS`. */
  pointsUnit: 'PTS',

  /** Tag pills. */
  selectedTag: 'SELECTED',
  leaderTag: 'LEADER',
  currentTag: 'CURRENT',
  exhaustedTag: 'EMPTY',

  /** Sequence rows: `01`, `02`, … Prefix and zero-padding are authored, the number derived. */
  sequencePrefix: '',
  sequenceDigits: 2,

  /** Standings: `2,400 PTS` grouping, and the place card label `PLACE_01`. */
  thousandsSeparator: ',',
  placePrefix: 'PLACE_',
  placeDigits: 2,
  /** Joins the names when the lead is shared: `TEAM ALPHA & TEAM BETA`. */
  championJoiner: ' & ',

  /** Team rows: the label over the team's catalog detail, and over its score. */
  teamDetailLabel: 'REGION',
  teamPointsLabel: 'CURRENT POINTS',

  /** Domain cards show the next question's difficulty as a number (Figma) or as a band word. */
  difficultyDisplay: 'number' as 'number' | 'band',

  /** Domain cards: the difficulty line, e.g. `DIFFICULTY // EASY`. */
  difficultyLabel: 'DIFFICULTY',
} as const

export type StageCopy = typeof STAGE_COPY

/**
 * The copy a page renders. Today this is the authored defaults; when the
 * operator-editable copy table lands (Studio, later phase) its overrides are
 * merged here and nowhere else.
 */
export function resolveCopy(overrides: Partial<StageCopy> = {}): StageCopy {
  return { ...STAGE_COPY, ...overrides }
}

/**
 * Difficulty is 1–100 in the contract. Stage shows a word, not a number, so
 * the bands are authored here. Ordered ascending; the first band whose `max`
 * is >= the value wins.
 */
export const DIFFICULTY_BANDS: readonly { readonly max: number; readonly label: string }[] = [
  { max: 33, label: 'EASY' },
  { max: 66, label: 'MEDIUM' },
  { max: 100, label: 'HARD' },
]

/** Answer letters, in option order. Beyond the alphabet falls back to the index. */
export const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
