/**
 * Studio copy — every operator-readable string that is not a catalog value,
 * in one place, in the vocabulary `docs/v1/03_CONTEXT.md` fixes.
 *
 * Components import from here and never carry a literal an operator might
 * read. Keep the voice plain and short: this is chrome, not a show.
 */

import type { Tab } from '@/chrome/nav'

export const APP = {
  name: 'questiongame',
  studio: 'Studio',
  noHost: 'No host',
  noHostBody: 'Run the desktop app with npm run dev:app. This dev server on its own has no Rust behind it.',
} as const

export const TABS: Readonly<Record<Tab, { label: string; hint: string }>> = {
  teams: { label: 'Teams', hint: 'Who competes' },
  library: { label: 'Domains & Questions', hint: 'What gets asked' },
  games: { label: 'Games', hint: 'Recipes: roster, board, rules' },
  operators: { label: 'Operators', hint: 'Who runs the studio' },
  control: { label: 'Control', hint: 'Run a Play' },
  screens: { label: 'Screens', hint: 'Stage layout per recipe' },
  statistics: { label: 'Statistics', hint: 'Results and history' },
  settings: { label: 'Settings', hint: 'Displays, defaults, shortcuts' },
}

export const PLAY_STATUS = {
  none: 'No recipe loaded',
  loaded: 'Loaded',
  playing: 'Playing',
  paused: 'Paused',
  completed: 'Completed',
  abandoned: 'Abandoned',
  restarted: 'Restarted',
} as const

export const CHROME = {
  sidebarExpand: 'Expand sidebar',
  sidebarCollapse: 'Collapse sidebar',
  sidebarHide: 'Hide sidebar',
  sidebarShow: 'Show sidebar',
  theme: 'Theme',
  themeSystem: 'Follow system',
  themeLight: 'Light',
  themeDark: 'Dark',
  operator: 'Operator',
  noOperator: 'No operator',
  switchOperator: 'Switch operator',
  manageOperators: 'Manage operators…',
  back: 'Back',
  forward: 'Forward',
  health: 'Health',
  healthUnknown: 'No health data yet',
  displays: (n: number) => (n === 1 ? '1 display' : `${n} displays`),
  notices: 'Notices',
  openCollector: 'Open notices',
  noNotices: 'No notices',
  timer: 'Timer',
  dirty: 'Unsaved changes',
} as const

export const LIST = {
  search: 'Search',
  searchPlaceholder: (what: string) => `Search ${what}…`,
  clearSearch: 'Clear search',
  grid: 'Grid',
  table: 'Table',
  view: 'View',
  active: 'Active',
  archived: 'Archived',
  archive: 'Archive',
  restore: 'Restore',
  open: 'Open',
  edit: 'Edit',
  duplicate: 'Duplicate',
  new: (what: string) => `New ${what}`,
  selected: (n: number) => (n === 1 ? '1 selected' : `${n} selected`),
  clearSelection: 'Clear',
  selectAll: 'Select all',
  sort: 'Sort',
  sortName: 'Name',
  sortUpdated: 'Last updated',
  sortCreated: 'Created',
  sortDifficulty: 'Difficulty',
  loading: 'Loading…',
  retry: 'Retry',
  updated: 'Updated',
  created: 'Created',
  never: 'Never',
} as const

export const EMPTY = {
  empty: (what: string) => ({ title: `No ${what} yet`, body: `Create the first one and it appears here.` }),
  noResults: { title: 'Nothing matches', body: 'Try another search or clear it.' },
  archivedEmpty: (what: string) => ({ title: `Nothing archived`, body: `Archived ${what} are restorable from here.` }),
  error: { title: 'Could not load', body: 'The host refused the read.' },
} as const

export const CONFIRM = {
  cancel: 'Cancel',
  confirm: 'Confirm',
  areYouSure: 'Are you sure?',
  archiveOne: (what: string) => `Archive this ${what}?`,
  archiveMany: (n: number, what: string) => `Archive ${n} ${what}?`,
  restoreMany: (n: number, what: string) => `Restore ${n} ${what}?`,
  archiveBody: 'Archived rows leave the active lists and stay restorable. Nothing is deleted.',
  referencedBy: (by: string) => `Still used by a ${by}. It stays in that ${by}; only the library row is archived.`,
  arm: 'Archive',
  armed: 'Confirm archive',
  dirtyTitle: 'Unsaved changes',
  dirtyBody: 'Save them, or discard and leave?',
  save: 'Save',
  discard: 'Discard',
  keepEditing: 'Keep editing',
  scopeTitle: 'Apply where?',
  scopeBody: 'This edit can stay on this game only, or change the library original.',
  thisGame: 'This game only',
  original: 'Apply to original',
} as const

export const FIELD = {
  required: 'Required',
  optional: 'Optional',
  frozen: 'Frozen while a Play is open',
  inert: (why: string) => `Has no effect: ${why}`,
  featureOff: (feature: string) => `Off: ${feature} is disabled`,
} as const

export const TEAM = {
  one: 'team',
  many: 'teams',
  name: 'Name',
  shortCode: 'Short code',
  shortCodeHint: 'Shown where space is tight, e.g. ALPHA.',
  color: 'Colour',
  colorHint: 'The team mark on Stage.',
  notes: 'Notes',
  playCount: 'Plays',
  playOne: 'play',
  playMany: 'plays',
  lastPlay: 'Last play',
  logo: 'Logo',
  noLogo: 'No logo',
} as const

export const DOMAIN = {
  one: 'domain',
  many: 'domains',
  heading: 'Domains',
  name: 'Name',
  code: 'Code',
  codeHint: 'Part-number style, shown on the Stage card, e.g. TEC_881.',
  description: 'Description',
  questions: 'Questions',
  questionCount: (n: number) => (n === 1 ? '1 question' : `${n} questions`),
  add: 'Add domain',
  all: 'All questions',
  pick: 'Domains',
  pickHint: 'A question may sit in several domains.',
  create: 'Create domain…',
  sortByDifficulty: 'Sort by difficulty',
} as const

export const QUESTION = {
  one: 'question',
  many: 'questions',
  stem: 'Question',
  stemHint: 'What the moderator reads and Stage shows.',
  options: 'Options',
  optionsHint: 'At least two. Tick every correct one; two ticks make it multiple-answer.',
  option: (i: number) => `Option ${String.fromCharCode(65 + i)}`,
  addOption: 'Add option',
  removeOption: 'Remove option',
  correct: 'Correct',
  lastCorrect: 'The last correct mark cannot be removed.',
  difficulty: 'Difficulty',
  difficultyHint: '1 (easy) to 100 (hard). Difficulty walks easy to hard inside a domain.',
  explanation: 'Explanation',
  explanationHint: 'Optional. Not shown on Stage.',
  single: 'Single answer',
  multiple: 'Multiple answers',
  band: { easy: 'Easy', medium: 'Medium', hard: 'Hard' },
  inDomains: 'In domains',
  noDomains: 'In no domain yet',
} as const

export const OPERATOR = {
  one: 'operator',
  many: 'operators',
  displayName: 'Display name',
  pinned: 'Pin set',
  notPinned: 'No pin',
  pinHint: 'Pins are set in P10. Switching is free until then.',
  playsRun: 'Plays run',
  runOne: 'play run',
  runMany: 'plays run',
  lastActive: 'Last active',
  makeActive: 'Make active',
  active: 'Active',
} as const

export const GAME = {
  one: 'game',
  many: 'games',
  name: 'Name',
  folder: 'Folder',
  tags: 'Tags',
  tagsHint: 'Comma-separated.',
  sections: { roster: 'Roster', board: 'Board', rules: 'Rules', plays: 'Plays' },
  roster: 'Roster',
  rosterHint: 'Play order is the opening ring. Every active team gets one token per round.',
  rosterEmpty: 'No teams on this game yet.',
  addTeam: 'Add team',
  removeTeam: 'Remove from roster',
  moveUp: 'Move up',
  moveDown: 'Move down',
  board: 'Board',
  boardHint: 'Pick domains for this show, then the questions from each. Consumed questions never return in a Play.',
  boardEmpty: 'No domains on the board yet.',
  addDomain: 'Add domain',
  removeDomain: 'Remove from board',
  questionsOn: (n: number, of: number) => `${n} of ${of} questions`,
  shape: 'Shape',
  shapeHint: 'Shape enforcement and the Shape manager arrive with Control (P8).',
  rules: 'Rules',
  rulesHint: 'Award, judging, cap and bonus, the timer. Frozen at Play start.',
  plays: 'Plays',
  playsHint: 'Every Play of this recipe. Read-only.',
  playsEmpty: 'No Plays yet.',
  loadIntoControl: 'Load into Control',
  loadedInControl: 'In Control',
  frozen: 'Frozen',
  frozenBanner: 'This game is playing. Its recipe is frozen until the Play ends.',
  goToControl: 'Go to Control',
  overridden: 'Overridden',
  reset: 'Reset to original',
  teamsCount: (n: number) => (n === 1 ? '1 team' : `${n} teams`),
  domainsCount: (n: number) => (n === 1 ? '1 domain' : `${n} domains`),
  questionsCount: (n: number) => (n === 1 ? '1 question' : `${n} questions`),
  lastPlay: 'Last play',
  rev: 'rev',
} as const

export const RULES = {
  scoringMode: 'Award mode',
  scoringModeHint: 'What a correct answer is worth.',
  flat: 'Flat',
  difficulty: 'By difficulty',
  lockSpeed: 'Lock speed',
  flatPoints: 'Points per correct answer',
  difficultyMap: 'Difficulty map',
  linear: 'Linear',
  linearFactor: 'Points per difficulty point',
  bands: 'Bands',
  lockSpeedEnabled: 'Add lock-speed bonus',
  lockSpeedEnabledHint: 'Faster locks earn more, on top of the base.',
  lockSpeedBase: 'Base for lock speed',
  speedWeight: 'Speed weight',
  speedWeightHint: 'points = floor(base × (1 + weight × remaining ÷ duration)).',
  partialCredit: 'Partial credit',
  partialCreditHint: 'Off: a multiple-answer question is correct only when the locked set equals the correct set.',
  orderMatters: 'Option order matters',
  orderMattersHint: 'Off: {A, C} equals {C, A}.',
  maxConsecutive: 'Cap after consecutive correct',
  maxConsecutiveHint: 'The token ends after this many correct answers in a row. Empty means no cap.',
  bonus: 'Bonus after consecutive correct',
  bonusCount: 'After',
  bonusAward: 'Award',
  timerEnabled: 'Timer',
  timerEnabledHint: 'Inherit uses the all-games default. Off means operator pace: no countdown, no auto-lock.',
  timerDuration: 'Duration',
  timerDurationHint: 'Milliseconds. Empty inherits the all-games default.',
  inherit: 'Inherit',
  on: 'On',
  off: 'Off',
  reveal: 'Reveal',
  revealHint: 'Defaults for this game; Control can change them live.',
  revealChannel: { question: 'Question', answers: 'Answers', outcome: 'Outcome', leaderboard: 'Leaderboard' },
  operator: 'Operator',
  auto: 'Auto',
} as const

export const STUB = {
  screens: { title: 'Screens', body: 'The Screens canvas arrives with P9.' },
  statistics: { title: 'Statistics', body: 'Live and all-data views arrive with P11.' },
  settings: { title: 'Settings', body: 'Monitors, grouped globals and keyboard shortcuts arrive with P10.' },
} as const

export const NOTICE_COPY: Readonly<Record<string, { title: string; actions: Readonly<Record<string, string>> }>> = {
  'stage.monitor_lost': {
    title: 'The Stage display was unplugged. Stage is back on the primary display; the Play continues.',
    actions: { pick_monitor: 'Pick a display', dismiss: 'Dismiss' },
  },
  'stage.monitor_returned': {
    title: 'The remembered Stage display is back.',
    actions: { move_stage: 'Move Stage', stay: 'Stay' },
  },
  'stage.contract_mismatch': {
    title: 'Stage was built against another contract version.',
    actions: { dismiss: 'Dismiss' },
  },
  match: { title: 'The host refused the command.', actions: {} },
  catalog: { title: 'The library refused the write.', actions: {} },
  monitor: { title: 'Display problem.', actions: {} },
  window: { title: 'Window problem.', actions: {} },
  no_host: { title: 'No host is connected.', actions: {} },
}

export function noticeTitle(code: string, detail: Readonly<Record<string, string>>): string {
  return NOTICE_COPY[code]?.title ?? detail.message ?? code
}

export function noticeAction(code: string, action: string): string {
  return NOTICE_COPY[code]?.actions[action] ?? action.replace(/_/g, ' ')
}

/** `1 234` style, locale-aware. */
export const fmt = {
  int: (n: number) => new Intl.NumberFormat().format(n),
  /** `1 play`, `3 plays`. */
  count: (n: number, one: string, many: string) => `${new Intl.NumberFormat().format(n)} ${n === 1 ? one : many}`,
  date: (ms: number | null) =>
    ms === null ? LIST.never : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(ms),
  dateShort: (ms: number | null) =>
    ms === null ? LIST.never : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(ms),
  ms: (ms: number) => `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)} s`,
  clock: (ms: number) => {
    const total = Math.max(0, Math.ceil(ms / 1000))
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${String(s).padStart(2, '0')}`
  },
}

export * from './control'
