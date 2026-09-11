/**
 * Stage copy — every audience-readable string that is NOT derived from the
 * Play, in one place, in every language Stage speaks.
 *
 * Two kinds of text reach Stage:
 *   - derived from the game: team names, domain names, difficulty, stems,
 *     options, points, ranks, clocks. These arrive in `play-state` and are
 *     never written here, and they are never translated: the author writes
 *     them in whichever language the show is in.
 *   - authored: HUD labels, delimiters, verdict wording, the idle tagline.
 *     These are here, one table per language, so an operator-editable copy
 *     table (Screens tab, a later phase) has exactly one thing to override.
 *
 * `play-state.language` (`stage.language`, a Game-tab key) picks the table;
 * `resolveCopy` is the only place that pick is read. Components reach the
 * resolved table through `useCopy()` and never import a table directly, so a
 * language switch mid-Play redraws every label on the next emission.
 *
 * Keep values in the design system's voice: HUD-terse, `//` as the
 * category/value delimiter, capitals, no emoji. Romanian keeps its diacritics
 * — Space Grotesk and Space Mono both carry them.
 */

import type { OutcomeVerdict, StageLanguage, StageScreen } from '@questiongame/contract'

/** One authored band of the 1–100 difficulty scale, shown as a word. */
export interface DifficultyBand {
  readonly max: number
  readonly label: string
}

/** The shape every language table fills. Same keys, same kinds, no gaps. */
export interface StageCopy {
  /** The `//` pair that separates a category from its value. */
  readonly delimiter: string

  /** Brackets around a running clock: `[ 00:12:20 ]`. */
  readonly clockOpen: string
  readonly clockClose: string

  /** HUD labels. */
  readonly domainLabel: string
  readonly sessionLabel: string
  /** Authored per tournament. */
  readonly sessionValue: string

  /** Per-screen body title, `<title> // <subject>`. Empty means no title. */
  readonly screenTitle: Readonly<Record<StageScreen, string>>

  /**
   * Idle screen. Everything but the wordmark is authored, and the eyebrow is
   * also what every other screen's header carries — one line, the show's
   * name, written once.
   */
  readonly idleEyebrow: string
  readonly idleTagline: string
  readonly idleStatus: string

  /** Play clock: how long the game has been running. */
  readonly playClockLabel: string
  readonly playClockValue: string

  /** Question countdown. */
  readonly timerLabel: string
  readonly timerValue: string
  /** Question: the timer turns urgent below this many seconds. */
  readonly timerUrgentSeconds: number

  /** Interstitials and overlays. */
  readonly questionLabel: string
  readonly nowPlayingLabel: string
  readonly multipleAnswersWord: string
  readonly roundAdvanceLabel: string
  /** The verdict word on the half-screen outcome overlay. */
  readonly outcomeWord: Readonly<Record<OutcomeVerdict, string>>

  /** Result widget. */
  readonly resultLabel: string
  readonly verdict: Readonly<Record<OutcomeVerdict, string>>
  readonly bonusLabel: string

  /** Points unit, after the figure: `+500 PTS`. */
  readonly pointsUnit: string

  /** Tag pills. */
  readonly selectedTag: string
  readonly leaderTag: string
  readonly currentTag: string
  readonly exhaustedTag: string

  /** Sequence rows: `01`, `02`, … Prefix and zero-padding are authored, the number derived. */
  readonly sequencePrefix: string
  readonly sequenceDigits: number

  /** Standings: `2,400 PTS` grouping, and the place card label `PLACE_01`. */
  readonly thousandsSeparator: string
  readonly placePrefix: string
  readonly placeDigits: number
  /** Joins the names when the lead is shared: `TEAM ALPHA & TEAM BETA`. */
  readonly championJoiner: string

  /** Team rows: the label over the team's catalog detail, and over its score. */
  readonly teamDetailLabel: string
  readonly teamPointsLabel: string

  /** Domain cards show the next question's difficulty as a number (Figma) or as a band word. */
  readonly difficultyDisplay: 'number' | 'band'
  /** Domain cards: the difficulty line, e.g. `DIFFICULTY // EASY`. */
  readonly difficultyLabel: string
  /**
   * Difficulty is 1–100 in the contract; as words, these are the bands.
   * Ordered ascending; the first band whose `max` is >= the value wins.
   */
  readonly difficultyBands: readonly DifficultyBand[]
}

/** English — the default table, and what `stage.language` reads as when unset. */
export const STAGE_COPY: StageCopy = {
  delimiter: '//',
  clockOpen: '[ ',
  clockClose: ' ]',

  domainLabel: 'DOMAIN',
  sessionLabel: 'SESSION',
  sessionValue: '2026 - 2027',

  screenTitle: {
    idle: '',
    teamOrder: 'PLAYING SEQUENCE',
    chooseDomain: 'SELECT CATEGORY',
    question: '',
    scoreboard: 'CURRENT STANDINGS',
    finalLeaderboard: 'TOURNAMENT CHAMPION',
    currentTeam: 'CURRENT TEAM',
  },

  idleEyebrow: 'YOUR TEXT GOES HERE',
  idleTagline: 'Write your tagline',
  idleStatus: 'AWAITING_GAME_START...',

  playClockLabel: 'TIMER',
  playClockValue: 'ELAPSED',

  timerLabel: 'TIMER',
  timerValue: 'REMAINING',
  timerUrgentSeconds: 5,

  questionLabel: 'QUESTION',
  nowPlayingLabel: 'NOW PLAYING',
  multipleAnswersWord: 'MULTIPLE ANSWERS',
  roundAdvanceLabel: 'ROUND',
  outcomeWord: {
    correct: 'CORRECT',
    incorrect: 'INCORRECT',
    partial: 'EXTRA SELECTION',
  },

  resultLabel: 'RESULT',
  verdict: {
    correct: 'ALL CORRECT',
    incorrect: 'INCORRECT',
    partial: 'EXTRA SELECTION',
  },
  bonusLabel: 'BONUS',

  pointsUnit: 'PTS',

  selectedTag: 'SELECTED',
  leaderTag: 'LEADER',
  currentTag: 'CURRENT',
  exhaustedTag: 'EMPTY',

  sequencePrefix: '',
  sequenceDigits: 2,

  thousandsSeparator: ',',
  placePrefix: 'PLACE_',
  placeDigits: 2,
  championJoiner: ' & ',

  teamDetailLabel: 'REGION',
  teamPointsLabel: 'CURRENT POINTS',

  difficultyDisplay: 'number',
  difficultyLabel: 'DIFFICULTY',
  difficultyBands: [
    { max: 33, label: 'EASY' },
    { max: 66, label: 'MEDIUM' },
    { max: 100, label: 'HARD' },
  ],
}

/**
 * Română. Formatting keys (delimiter, brackets, digits, joiners) are shared
 * with English on purpose: they are the design system's, not the language's.
 * The thousands separator is the one departure — Romanian groups with `.`.
 */
export const STAGE_COPY_RO: StageCopy = {
  ...STAGE_COPY,

  domainLabel: 'DOMENIU',
  sessionLabel: 'SESIUNE',

  screenTitle: {
    idle: '',
    teamOrder: 'ORDINEA DE JOC',
    chooseDomain: 'ALEGE CATEGORIA',
    question: '',
    scoreboard: 'CLASAMENT ACTUAL',
    finalLeaderboard: 'CAMPIONUL TURNEULUI',
    currentTeam: 'ECHIPA CURENTĂ',
  },

  idleEyebrow: 'TEXTUL TĂU AICI',
  idleTagline: 'Scrie-ți sloganul',
  idleStatus: 'ÎN_AȘTEPTAREA_JOCULUI...',

  playClockLabel: 'CRONOMETRU',
  playClockValue: 'SCURS',

  timerLabel: 'CRONOMETRU',
  timerValue: 'RĂMAS',

  questionLabel: 'ÎNTREBAREA',
  nowPlayingLabel: 'ACUM JOACĂ',
  multipleAnswersWord: 'RĂSPUNSURI MULTIPLE',
  roundAdvanceLabel: 'RUNDA',
  outcomeWord: {
    correct: 'CORECT',
    incorrect: 'GREȘIT',
    partial: 'SELECȚIE ÎN PLUS',
  },

  resultLabel: 'REZULTAT',
  verdict: {
    correct: 'TOATE CORECTE',
    incorrect: 'GREȘIT',
    partial: 'SELECȚIE ÎN PLUS',
  },
  bonusLabel: 'BONUS',

  pointsUnit: 'PCT',

  selectedTag: 'SELECTAT',
  leaderTag: 'LIDER',
  currentTag: 'CURENT',
  exhaustedTag: 'EPUIZAT',

  thousandsSeparator: '.',
  placePrefix: 'LOCUL_',

  teamDetailLabel: 'REGIUNE',
  teamPointsLabel: 'PUNCTE ACTUALE',

  difficultyLabel: 'DIFICULTATE',
  difficultyBands: [
    { max: 33, label: 'UȘOR' },
    { max: 66, label: 'MEDIU' },
    { max: 100, label: 'GREU' },
  ],
}

/** Every table Stage can draw from, by the contract's language code. */
export const COPY_TABLES: Readonly<Record<StageLanguage, StageCopy>> = {
  en: STAGE_COPY,
  ro: STAGE_COPY_RO,
}

/**
 * The copy a page renders: the language's table, then the operator's
 * overrides on top. When the operator-editable copy table lands (Screens
 * tab, later phase) its per-language overrides are merged here and nowhere
 * else.
 */
export function resolveCopy(language: StageLanguage = 'en', overrides: Partial<StageCopy> = {}): StageCopy {
  return { ...COPY_TABLES[language], ...overrides }
}

/** Answer letters, in option order. Not translated. Beyond the alphabet falls back to the index. */
export const OPTION_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

