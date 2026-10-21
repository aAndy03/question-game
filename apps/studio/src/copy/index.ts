/**
 * Studio copy — every operator-readable string that is not a catalog value,
 * in one place, in the vocabulary `docs/v1/03_CONTEXT.md` fixes.
 *
 * Components import from here and never carry a literal an operator might
 * read. Keep the voice plain and short: this is chrome, not a show.
 */

import type { Tab } from '@/chrome/nav'
import type { ImportCounts, ImportIgnored, QuestionGap } from '@/host/types'

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
  healthOk: 'All good',
  healthWarn: 'Something needs attention',
  healthError: 'Something is wrong',
  mute: 'Mute Stage audio',
  unmute: 'Unmute Stage audio',
  loadDemo: 'Load the Demo game',
  loadDemoRo: 'Load the Demo game (Română)',
  displays: (n: number) => (n === 1 ? '1 display' : `${n} displays`),
  notices: 'Notices',
  openCollector: 'Open notices',
  noNotices: 'No notices',
  /**
   * The collector's line for notices that are addressed to a field and render
   * there instead (`surfaceOf` → `inline`). Without it the status dot could go
   * amber over a finding the operator had no way to reach: the dot reads the
   * health status, the collector renders only `collector` notices, and an
   * inline health item appeared in neither (P11.8).
   */
  elsewhere: (n: number) => (n === 1 ? '1 item needs attention elsewhere' : `${n} items need attention elsewhere`),
  elsewhereGo: 'Show',
  /** A Game section an addressed notice renders in (P12.8). */
  elsewhereGame: (section: string) => `Game ▸ ${section}`,
  /** Beside a Game rail item whose section holds an unresolved error (P12.8). */
  needsAttention: 'needs attention',
  /** Where an inline notice's `targetPath` lives, for that line. */
  elsewhereAt: {
    'audio.cues': 'Settings ▸ Audio',
    'stage.monitor_id': 'Settings ▸ Monitors',
    recipe: 'Games',
  } as const,
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
  /** The opened row's Close below 1280 px (1.1.1). */
  closeDetail: 'Close',
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
  // Stable 1.1: filters, sort, headers and pages.
  filters: 'Filters',
  clearAll: 'Clear all',
  clearFilters: 'Clear filters',
  bestMatch: 'Best match',
  sortBy: 'Sort by',
  order: 'Order',
  sortByColumn: (label: string, dir: 'ascending' | 'descending' | null) => (dir ? `Sort by ${label}, ${dir}` : `Sort by ${label}`),
  ascending: 'Ascending',
  descending: 'Descending',
  group: 'Group',
  groupNone: 'None',
  changed: 'Changed',
  changedWindow: { any: 'Any time', today: 'Today', '7d': 'Last 7 days', '30d': 'Last 30 days' } as const,
  status: 'Status',
  all: 'All',
  rowsPerPage: 'Rows per page',
  pageSizeAll: 'All',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  pages: 'Pages',
  page: (n: number) => `Page ${n}`,
  selectAllN: (n: number) => `Select all ${n.toLocaleString('en-US')}`,
  selectedOnPage: (n: number, m: number) => `${n.toLocaleString('en-US')} selected (${m.toLocaleString('en-US')} on this page)`,
  archiveN: (n: number) => `Archive ${n.toLocaleString('en-US')}`,
  restoreN: (n: number) => `Restore ${n.toLocaleString('en-US')}`,
  groupHeader: (label: string, count: number) => `${label} · ${count.toLocaleString('en-US')}`,
  continued: '(continued)',
  showGroup: (label: string) => `Show ${label}`,
  hideGroup: (label: string) => `Hide ${label}`,
  alsoIn: (names: readonly string[]) => `also in ${names.join(', ')}`,
  removeFilter: (label: string) => `Remove ${label}`,
  range: (min: number, max: number) => `${min}–${max}`,
} as const

/** What each library tab filters, sorts and groups by (stable 1.1, §20). */
export const VIEWS = {
  name: 'Name',
  text: 'Question',
  changed: 'Changed',
  created: 'Created',
  difficulty: 'Difficulty',
  band: 'Difficulty band',
  answer: 'Answer type',
  completeness: 'Completeness',
  incomplete: 'Incomplete',
  complete: 'Complete',
  domain: 'Domain',
  domains: 'Domains',
  noDomain: 'No domain',
  notSet: 'Not set',
  origin: 'Origin',
  sample: 'Sample',
  mine: 'Mine',
  incompleteHint: (n: number) => (n === 1 ? '1 question is incomplete' : `${n.toLocaleString('en-US')} questions are incomplete`),
  played: 'Played',
  never: 'Never played',
  atLeastOnce: 'Played at least once',
  plays: 'Plays',
  lastPlayed: 'Last played',
  folder: 'Folder',
  noFolder: 'No folder',
  tag: 'Tag',
  playingNow: 'Playing now',
  teams: 'Teams',
  questions: 'Questions',
  status: 'Status',
  playing: 'Playing',
  ready: 'Ready',
  archived: 'Archived',
  hasPin: 'Has a PIN',
  activeOperator: 'Active operator',
  playsRun: 'Plays run',
  lastActive: 'Last active',
} as const

export const EMPTY = {
  empty: (what: string) => ({ title: `No ${what} yet`, body: `Create the first one and it appears here.` }),
  noResults: { title: 'Nothing matches', body: 'Try another search or clear it.' },
  allComplete: { title: 'No incomplete questions here', body: 'Every question in this view is ready for a board.' },
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
  referencedBy: (by: string) => `Still used by ${by}. It stays there; only the library row is archived.`,
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
  scopeDifficulty: 'Change it for this game only, or in the library itself.',
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
  themeColour: 'Theme colour',
  colorCode: 'Colour code',
  colorPlaceholder: '#RRGGBB',
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
  incompleteCount: (n: number) => (n === 1 ? '1 incomplete question' : `${n} incomplete questions`),
} as const

/** §2.32 — what a question still lacks before a board can hold it. */
const QUESTION_GAP = {
  stem: 'No question text',
  options: 'Fewer than two options',
  correct: 'No correct answer',
  difficulty: 'No difficulty',
  domain: 'In no domain',
} as const satisfies Record<QuestionGap, string>

export const QUESTION = {
  difficultyRange: 'A whole number from 1 to 100',
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
  gap: QUESTION_GAP,
  /** The mark's tooltip and accessible name. */
  incompleteLabel: (gaps: readonly QuestionGap[]) => `Incomplete — ${gaps.map((g) => QUESTION_GAP[g]).join(' · ')}`,
  incompleteTitle: 'Incomplete — a game cannot use this question yet',
  filterLabel: 'Question filter',
  filterAll: 'All',
  filterIncomplete: (n: number) => `Incomplete · ${n}`,
  difficultyUnset: 'Not set',
  /** Stands in for the title of a question that has options but no text yet. */
  noStem: '(no question text)',
} as const

export const IMPORT = {
  open: 'Import',
  title: 'Import questions',
  hint: 'A JSON file in the editor’s shape. Every question with text or at least one option comes in; anything missing is marked incomplete and can be finished in the editor.',
  choose: 'Choose a .json file',
  paste: 'Or paste the file',
  pasteHint: 'The preview follows what is in the box.',
  copyTemplate: 'Copy template',
  templateCopied: 'Template copied',
  defaultDomain: 'Questions without a domain go to',
  noDomain: 'No domain',
  empty: 'Choose a file or paste one to see what it holds.',
  summary: (c: ImportCounts, newDomains: number): string =>
    [
      `${c.complete} complete`,
      c.incomplete ? `${c.incomplete} incomplete` : null,
      c.duplicate ? `${c.duplicate} ${c.duplicate === 1 ? 'duplicate' : 'duplicates'}` : null,
      c.rejected ? `${c.rejected} rejected` : null,
      newDomains ? `${newDomains} new ${newDomains === 1 ? 'domain' : 'domains'}` : null,
    ]
      .filter(Boolean)
      .join(' · '),
  status: { complete: 'Complete', incomplete: 'Incomplete', duplicate: 'Already in the library', rejected: 'Rejected' },
  reason: { not_an_object: 'Rejected: not a question', no_content: 'Rejected: no question and no options' },
  ignored: (i: ImportIgnored): string =>
    `${i.field}: ${{ unknown: 'unknown field, ignored', wrong_type: 'wrong type, ignored', out_of_range: 'outside 1–100, ignored', empty: 'empty, ignored' }[i.why]}`,
  newDomains: (names: readonly string[]) => `New domains: ${names.join(', ')}`,
  submit: (n: number) => (n === 1 ? 'Import 1 question' : `Import ${n} questions`),
  done: (c: ImportCounts) => {
    const n = c.complete + c.incomplete
    return `Imported ${n} ${n === 1 ? 'question' : 'questions'}${c.incomplete ? ` · ${c.incomplete} incomplete` : ''}`
  },
  /** The document 05_STUDIO_DESIGN.md §17.2 describes, ready to fill in. */
  template: `{
  "format": "questiongame.questions",
  "version": 1,
  "questions": [
    {
      "question": "Care este capitala Australiei?",
      "options": [
        { "text": "Canberra", "correct": true },
        { "text": "Sydney" },
        "Melbourne",
        "Perth"
      ],
      "difficulty": 50,
      "domains": ["Geografie"],
      "explanation": "Optional."
    }
  ]
}
`,
} as const

export const OPERATOR = {
  one: 'operator',
  many: 'operators',
  displayName: 'Display name',
  pinned: 'Pin set',
  notPinned: 'No pin',
  pinHint: 'Optional. Asked when switching to this operator and before wiping data. Never shown anywhere.',
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
  boardHint:
    'Pick domains for this show, then the questions from each. One question per difficulty in each domain unless repeats are allowed; consumed questions never return in a Play.',
  allowRepeats: 'Allow repeated difficulties',
  allowRepeatsHint:
    'Several questions at one difficulty in a domain, asked one after the other. They pay the same, and teams cannot tell them apart when they choose.',
  boardEmpty: 'No domains on the board yet.',
  addDomain: 'Add domain',
  editDifficulty: (stem: string, now: string) => `Difficulty of ${stem}: ${now}`,
  play: (n: number) => `Play ${n}`,
  removeDomain: 'Remove from board',
  questionsOn: (n: number, of: number) => `${n} of ${of} questions`,
  shape: 'Shape',
  shapeHint:
    'A domain can hold many questions at one difficulty — a game plays one of them, unless it allows repeated difficulties. Untick the one on the board to free the others.',
  difficultyTaken: (difficulty: number) =>
    `Difficulty ${difficulty} is already taken by another question in this domain. Untick that one, or allow repeated difficulties.`,
  incomplete: (gaps: readonly QuestionGap[]) =>
    `Incomplete — ${gaps.map((g) => QUESTION_GAP[g].toLowerCase()).join(', ')}. Finish it in the library to use it here.`,
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
  difficultyMapHint: 'Linear pays difficulty × a factor. Bands pay a flat amount per difficulty range — the first band a question fits wins, and anything above the last band takes the last band’s award.',
  linear: 'Linear',
  linearFactor: 'Points per difficulty point',
  bands: 'Bands',
  lockSpeedEnabled: 'Add lock-speed bonus',
  lockSpeedEnabledHint: 'Faster locks earn more, on top of the base.',
  lockSpeedBase: 'Base for lock speed',
  speedWeight: 'Speed weight',
  speedWeightHint: 'An instant answer pays base × (1 + weight). Slower answers pay less, down to the plain base at the end of the window.',
  speedWindow: 'Speed bonus lasts',
  speedWindowHint: 'How long a fast answer is worth extra. A share of that question’s clock, or a fixed number of seconds — the fixed one makes the same answer time worth the same on every question.',
  speedWindowFraction: 'Share of the clock',
  speedWindowMs: 'Fixed seconds',
  speedWindowWhole: 'Whole clock',
  speedSteps: 'Round the bonus into steps',
  speedStepsHint: 'Every answer inside a step is worth exactly the same. Off is a smooth slope.',
  speedStepsOff: 'Smooth',
  speedStepsOn: (n: number) => `${n} steps`,
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
  language: 'Stage language',
  languageHint: 'The labels and titles Stage shows. Team names, domains and questions stay as written.',
  languageName: { en: 'English', ro: 'Română' },
} as const

export const STUB = {
  statistics: { title: 'Statistics', body: 'Live and all-data views arrive with P11.' },
  settings: { title: 'Settings', body: 'Monitors, grouped globals and keyboard shortcuts arrive with P10.' },
} as const

/**
 * Copy for every notice code in the project (05_STUDIO_DESIGN.md §12.4). The
 * host emits ids and `detail`; titles interpolate `{key}` from `detail`, and
 * `actions` maps action ids to labels. `dismiss` copy may appear here without
 * counting as an action — the three-action cap is on solve actions, and
 * `copy/notices.test.ts` walks this table to hold it.
 */
export const NOTICE_COPY: Readonly<Record<string, { title: string; actions: Readonly<Record<string, string>> }>> = {
  'update.available': {
    title: 'questiongame {version} is available.',
    actions: { open_release: 'Open release page', dismiss: 'Not now' },
  },
  'update.stable_available': {
    title: 'questiongame {version} is out.',
    actions: { open_release: 'Open release page', dismiss: 'Not now' },
  },
  'stage.monitor_lost': {
    title: 'The Stage display was unplugged. Stage is back on the primary display; the Play continues.',
    actions: { pick_monitor: 'Pick a display', dismiss: 'Dismiss' },
  },
  'stage.monitor_returned': {
    title: 'The remembered Stage display is back.',
    actions: { move_stage: 'Move Stage', stay: 'Stay' },
  },
  'stats.monitor_lost': {
    title: 'The Statistics display was unplugged. That window is closed; the Play is untouched.',
    actions: { pick_monitor: 'Pick a display', dismiss: 'Dismiss' },
  },
  'stage.contract_mismatch': {
    title: 'Stage was built against another contract version.',
    actions: { reinstall: 'Reinstall', dismiss: 'Dismiss' },
  },
  'play.roster_empty': {
    title: 'The roster is empty. Add at least one team before loading this game into Control.',
    actions: { open_section: 'Open roster' },
  },
  'play.board_empty': {
    title: 'The board has no questions. Add a domain and pick its questions first.',
    actions: { open_section: 'Open board' },
  },
  'shortcuts.conflict': {
    title: '{chord} is already bound to {other}.',
    actions: { keep: 'Keep', reassign: 'Reassign' },
  },
  'operator.pin_required': {
    title: 'This operator has a pin.',
    actions: {},
  },
  'operator.pin_wrong': {
    title: 'Wrong pin.',
    actions: {},
  },
  'data.play_open': {
    title: 'A Play is open. Stop it before touching Play data.',
    actions: { go_to_control: 'Go to Control' },
  },
  'seed.edited_rows': {
    title: '{edited} Demo rows were edited. Overwrite them with the shipped Demo, or keep the edits?',
    actions: { overwrite: 'Overwrite', keep_edits: 'Keep edits' },
  },
  'health.disk_low': {
    title: '{freeMb} MB free on the data volume. Make room or move the data folder.',
    actions: { open_data_folder: 'Open data folder' },
  },
  'health.persist_failed': {
    title: 'The last save failed: {message}. The Play continues in memory until a save succeeds.',
    actions: { open_data_folder: 'Open data folder' },
  },
  'health.search_degraded': {
    title: 'Search is out of step with the library.',
    actions: { rebuild_search: 'Rebuild index' },
  },
  'health.stage_not_ready': {
    title: 'The Stage window has not reported in.',
    actions: { open_stage: 'Open Stage' },
  },
  'health.contract_mismatch': {
    title: 'Stage speaks contract {stage}; the host speaks {host}.',
    actions: { reinstall: 'Reinstall' },
  },
  'health.audio_missing_cue': {
    title: 'The {cue} cue file ({file}) is missing from the cue pack.',
    actions: { open_cue_folder: 'Open cue folder' },
  },
  // Its own message since P11.9: the file is there, and saying it is missing
  // sent the operator looking for something that was never gone.
  'health.display_unused': {
    title: '{display} is connected but Windows is not using it. Extend the desktop onto it (Win+P → Extend) and it appears here.',
    actions: { open_display_settings: 'Open display settings' },
  },
  'health.audio_cue_failed': {
    title: 'The {cue} cue ({file}) is there but would not play. Showing Stage usually settles it.',
    actions: { open_stage: 'Show Stage' },
  },
  match: { title: 'The host refused the command.', actions: {} },
  catalog: { title: 'The library refused the write.', actions: {} },
  monitor: { title: 'Display problem.', actions: {} },
  window: { title: 'Window problem.', actions: {} },
  no_host: { title: 'No host is connected.', actions: {} },
  'screens.blocked': { title: 'Screens is unavailable while a Play is playing or paused.', actions: { go_to_control: 'Go to Control', stop_playing: 'Stop playing', abandon_confirm: 'Stop playing', dismiss: 'Dismiss' } },
}

/**
 * The title for a code, with `{key}` placeholders filled from `detail`. A
 * placeholder `detail` does not carry is left as its key, so a missing value
 * is visible rather than silent.
 */
export function noticeTitle(code: string, detail: Readonly<Record<string, string>>): string {
  const title = NOTICE_COPY[code]?.title
  if (title === undefined) return detail.message ?? code
  return title.replace(/\{(\w+)\}/g, (_, k: string) => detail[k] ?? k)
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
export * from './screens'
export * from './settings'
export * from './firstRun'

/** The close guard (P12.2). */
export const QUIT = {
  title: 'Quit questiongame?',
  playLoaded: 'A game is loaded in Control. The Play is saved as it stands and resumes next time; Stage closes with Studio.',
  quit: 'Quit',
  keepWorking: 'Keep working',
} as const
