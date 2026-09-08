/**
 * Control tab copy (P8). Vocabulary from docs/v1/03_CONTEXT.md: token, ring,
 * round, session, Select → Lock → Reveal, operator pace.
 */

import type { OverlayKind, StageScreen } from '@questiongame/contract'

export const CONTROL = {
  title: 'Control',
  noRecipe: 'Nothing in Control',
  noRecipeBody: 'Open a game and press Load into Control. The Stage window opens with it.',
  goToGames: 'Go to Games',
  panels: {
    viewer: 'Viewer',
    game: 'Game',
    action: 'Action Panel',
    strips: 'Strips',
    timeline: 'Timeline',
  },
  resetLayout: 'Reset layout',
  density: { comfortable: 'Comfortable', compact: 'Compact', dense: 'Dense' },
  stageDisplay: 'Stage display',
  statsDisplay: 'Statistics display',
  primaryDisplay: 'Primary display',
  openStage: 'Open Stage',
  settings: 'Settings',
  settingsGlobal: 'Global',
  settingsCurrentGame: 'Current game',
  settingsNoGame: 'No recipe in Control.',
  hitTargets: 'Viewer hit targets',
  viewerLoading: 'Stage is loading…',
  viewerNoHost: 'The Viewer embeds the Stage window; it needs the desktop app.',
} as const

export const TRANSPORT = {
  start: 'Start Play',
  pause: 'Pause',
  resume: 'Resume',
  restart: 'Restart',
  restartSame: 'Same questions',
  restartDifferent: 'Different questions',
  restartTitle: 'Restart this Play?',
  restartBody: 'The current Play closes and a new one opens now, from the same recipe. Scores reset.',
  abandon: 'Abandon',
  abandonTitle: 'Abandon this Play?',
  abandonBody: 'The Play ends as abandoned. Its events stay on record. This cannot be undone from Control.',
  undo: 'Undo turn',
  redo: 'Redo turn',
  waitOverlay: 'Wait for the overlay to finish',
  ended: 'The Play has ended',
  notStarted: 'Press Start Play first',
} as const

/** Taking the recipe back out of Control (§5.1). */
export const UNLOAD = {
  action: 'Unload game',
  hint: 'Take this recipe out of Control. Stage goes back to Idle and stays where it is.',
  title: 'Unload the game?',
  /** An open Play is abandoned on the way out — say so before it happens. */
  bodyOpen: 'This Play is still open. Unloading abandons it.',
  bodyClosed: 'Stage returns to Idle. The recipe stays in the library.',
  /** The record question. Keeping is the answer that needs no thought. */
  keep: 'Keep the record',
  keepHint: 'The Play, its Timeline and its numbers stay under this game.',
  discard: 'Discard it',
  discardHint: 'Delete this Play and its Timeline. It leaves Statistics too. This cannot be undone.',
  confirm: 'Unload',
  confirmDiscard: 'Unload and discard',
  done: 'Game unloaded',
  doneDiscarded: 'Game unloaded, Play discarded',
  /** Nothing was played, so there is nothing to keep or discard. */
  neverStarted: 'Nothing was played, so no record is kept.',
} as const

export const TIMER = {
  start: 'Start timer',
  pause: 'Pause timer',
  operatorPace: 'Operator pace',
  expired: 'Expired',
  locked: 'Locked',
} as const

export const SESSION = {
  noSession: 'No question issued',
  chooseDomainHint: 'Pick a domain below, on the Viewer, or with 1-9.',
  nextQuestion: 'Next question',
  nextQuestionHint: 'The same team keeps the token until it answers wrong.',
  domainDifficulty: (n: number) => `D${n}`,
  revealFirstToContinue: 'Reveal the outcome first',
  revealStem: 'Reveal question',
  revealOption: 'Reveal next answer',
  revealOutcome: 'Reveal outcome',
  lock: 'Lock',
  lockHint: 'Freezes the choice and stops the timer. Nothing is scored until reveal.',
  selection: 'Selection',
  noSelection: 'Nothing selected',
  giveToken: 'Give token',
  giveTokenNow: 'Give the token',
  placesRevealed: (shown: number, total: number) => `${shown} of ${total} places revealed`,
  giveTokenTo: (name: string) => `Give token to ${name}`,
  revealAndPass: 'Reveal & pass',
  revealFirst: 'Reveal first',
  armed: 'Press again to confirm',
  noTargets: 'No legal target',
  round: (n: number) => `Round ${n}`,
  question: (n: number) => `Question ${n}`,
  difficulty: (n: number) => `Difficulty ${n}`,
  answersMode: { single: 'Single answer', multiple: 'Multiple answers' },
  verdict: { correct: 'Correct', incorrect: 'Incorrect', partial: 'Partial' },
  points: (n: number) => `+${n}`,
  bonus: (n: number) => `bonus +${n}`,
  streak: (n: number) => (n === 1 ? '1 in a row' : `${n} in a row`),
  rehearsal: 'Rehearsal: one team',
  domainsLeft: (n: number) => (n === 1 ? '1 question left' : `${n} questions left`),
  exhausted: 'Exhausted',
  leaderboardNext: 'Reveal next place',
  leaderboardDone: 'All places revealed',
} as const

/**
 * The Action Panel's phase headings (`host/session.ts`'s `ControlPhase`). One
 * block is shown at a time: what the host would accept now, and nothing else.
 */
export const PHASE = {
  ready: { title: 'Not started', hint: 'Press Start Play to begin.' },
  resolved: { title: 'Question resolved', hint: null },
  handover: { title: 'The token is free', hint: 'Give it to a team to continue.' },
  standings: { title: 'Final standings', hint: 'Every question is used. Reveal the places, lowest first.' },
  ended: { title: 'Play abandoned', hint: 'Restart the recipe to play it again.' },
  showLeaderboard: 'Show final leaderboard',
  onLeaderboard: 'Showing on Stage',
} as const

/**
 * One line per `RingRole` (`host/ring.ts`). The row says what it is, so the
 * operator never has to infer legality from a border colour.
 */
export const RING_ROLE = {
  holder: 'Has the token',
  next: 'Next in order',
  override: 'Out of order',
  'reveal-first': 'Reveal the outcome first',
  served: 'Played this round',
  inactive: 'Not in this Play',
  solo: 'The only team',
  closed: 'The Play has ended',
} as const

export const RING = {
  title: 'Ring',
  history: 'Played this round',
  current: 'Holding the token',
  future: 'Up next',
  dropIllegal: 'Only the future ring can be reordered',
  overlooked: 'Not yet served this round',
  overrideArmed: 'Armed: press again',
  overrideBlocked: 'Reveal first',
  rehearsalSolo: 'Rehearsal',
  score: 'Score',
  turns: 'Turns',
  reorder: 'Drag to reorder the future ring',
} as const

export const SCREENS: Readonly<Record<StageScreen, string>> = {
  idle: 'Idle',
  teamOrder: 'Team order',
  chooseDomain: 'Choose domain',
  question: 'Question',
  scoreboard: 'Scoreboard',
  finalLeaderboard: 'Final leaderboard',
  currentTeam: 'Current team',
}

export const OVERLAYS: Readonly<Record<OverlayKind, string>> = {
  'token-handoff': 'Token handoff',
  'round-advance': 'Round advance',
  'multiple-answers': 'Multiple answers',
  outcome: 'Outcome',
  'current-team': 'Current team',
}

export const STRIPS = {
  screens: 'Screens',
  overlays: 'Overlays',
  overlayBusy: 'Overlay playing',
  overlayPending: 'Queued',
  overlaysOff: 'Overlay animations are off',
} as const

export const TIMELINE = {
  title: 'Timeline',
  events: (n: number) => (n === 1 ? '1 event' : `${n} events`),
  expand: 'Expand timeline',
  collapse: 'Collapse timeline',
  empty: 'No events yet',
  rewindWarning: 'Undoing toward the first event? Restart may be cleaner.',
  kinds: {
    play_loaded: 'Play loaded',
    play_started: 'Play started',
    paused: 'Paused',
    resumed: 'Resumed',
    token_given: 'Token given',
    question_issued: 'Question issued',
    stem_revealed: 'Question revealed',
    option_revealed: 'Answer revealed',
    selection_set: 'Selection',
    timer_started: 'Timer started',
    timer_paused: 'Timer paused',
    timer_expired: 'Timer expired',
    selection_locked: 'Locked',
    turn_resolved: 'Outcome revealed',
    ring_reordered: 'Ring reordered',
    leaderboard_rank_revealed: 'Place revealed',
    turn_inverted: 'Undo',
    turn_reapplied: 'Redo',
    play_completed: 'Play completed',
    play_abandoned: 'Play abandoned',
    play_restarted: 'Play restarted',
    settings_live_changed: 'Setting changed',
  } as Readonly<Record<string, string>>,
} as const

export const HOTKEYS = {
  title: 'Keyboard',
  /** Default chords (spec §2.20). P10's Shortcuts tab edits them on the host. */
  defaults: {
    start_timer: 'space',
    lock_selection: 'enter',
    reveal_outcome: 'r',
    reveal_stem: 's',
    reveal_next_option: 'a',
    give_token: 't',
    undo_turn: 'mod+z',
    redo_turn: 'mod+shift+z',
    screen_prev: '[',
    screen_next: ']',
  } as Readonly<Record<string, string>>,
  labels: {
    start_timer: 'Start / pause timer',
    lock_selection: 'Lock',
    reveal_outcome: 'Reveal outcome',
    reveal_stem: 'Reveal question',
    reveal_next_option: 'Reveal next answer',
    give_token: 'Give token to the default target',
    undo_turn: 'Undo',
    redo_turn: 'Redo',
    screen_prev: 'Previous screen',
    screen_next: 'Next screen',
    pick: 'Pick domain / answer by position',
  } as Readonly<Record<string, string>>,
} as const
