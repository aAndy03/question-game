/**
 * The Stage screen registry.
 *
 * Adding a screen is one entry here plus one page component. Nothing else in
 * the codebase may hold its own list of screens — the transition matrix, the
 * Strips panel, the Screens canvas and the node-id validator all derive from
 * this.
 */

export interface ScreenSpec {
  /** Why this screen exists, in one line. */
  readonly purpose: string
  /**
   * Whether the screen reads the current question session. A screen that does
   * not (Idle, Scoreboard) must render correctly with `session: null`.
   */
  readonly usesSession: boolean
  /**
   * Whether the operator may show this screen before a Play has started.
   * Everything else requires `status !== 'loaded'`.
   */
  readonly availableBeforePlay: boolean
}

export const SCREENS = {
  idle: {
    purpose: 'Nothing playing yet. The wordmark holds the audience.',
    usesSession: false,
    availableBeforePlay: true,
  },
  teamOrder: {
    purpose: 'The playing sequence and whose turn it is.',
    usesSession: false,
    availableBeforePlay: false,
  },
  chooseDomain: {
    purpose: 'The domains still holding questions, for the team on token.',
    usesSession: false,
    availableBeforePlay: false,
  },
  question: {
    purpose: 'One issued question: stem, options, timer, outcome.',
    usesSession: true,
    availableBeforePlay: false,
  },
  scoreboard: {
    purpose: 'Standings mid-show.',
    usesSession: false,
    availableBeforePlay: false,
  },
  finalLeaderboard: {
    purpose: 'Final standings, revealed lowest rank first.',
    usesSession: false,
    availableBeforePlay: false,
  },
  currentTeam: {
    purpose:
      'Handoff interstitial. Present in the Figma source as a full screen as well as an overlay.',
    usesSession: false,
    availableBeforePlay: false,
  },
} as const satisfies Record<string, ScreenSpec>

export type StageScreen = keyof typeof SCREENS

export const STAGE_SCREENS = Object.keys(SCREENS) as readonly StageScreen[]

export function isStageScreen(value: string): value is StageScreen {
  return value in SCREENS
}

/**
 * Every ordered pair of distinct screens. Spec §5.6 requires a base transition
 * for each one, because the operator may jump anywhere. Deriving the list means
 * a new screen automatically demands its transitions rather than quietly
 * shipping without them.
 */
export function screenPairs(): readonly (readonly [StageScreen, StageScreen])[] {
  const pairs: (readonly [StageScreen, StageScreen])[] = []
  for (const from of STAGE_SCREENS) {
    for (const to of STAGE_SCREENS) {
      if (from !== to) pairs.push([from, to])
    }
  }
  return pairs
}
