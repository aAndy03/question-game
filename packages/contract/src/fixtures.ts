/**
 * `play-state` fixtures.
 *
 * These drive Stage through P2 and P3 while no host exists, and become
 * integration assertions at P6: every fixture must be reproducible as a real
 * host emission (roadmap P6 exit criteria).
 *
 * Authored in TypeScript rather than raw JSON so they typecheck against
 * `PlayStateForStage` at build time. `npm run fixtures` writes them to
 * `fixtures/*.json` for the Rust side.
 *
 * Content follows the design system's sample tournament so screens can be
 * compared against the Figma frames directly.
 */

import type {
  PlayStateForStage,
  StageSession,
  StageTeam,
} from './play-state'
import { CONTRACT_VERSION, DEFAULT_DECOR_SETTINGS } from './play-state'

const PLAY_ID = 'play-fixture-1'

function team(
  id: string,
  name: string,
  shortCode: string,
  color: string,
  score: number,
  rank: number,
  turnsTaken: number,
  detail: string,
): StageTeam {
  return { id, name, shortCode, color, logoUrl: null, detail, score, rank, turnsTaken, active: true }
}

/** Four teams, mid-round: two have played this round, two have not. */
const TEAMS: readonly StageTeam[] = [
  team('team-alpha', 'TEAM ALPHA', 'ALPHA', 'var(--state-info)', 500, 1, 2, 'Moldova'),
  team('team-beta', 'TEAM BETA', 'BETA', 'var(--state-correct)', 250, 2, 2, 'Muntenia'),
  team('team-gamma', 'TEAM GAMMA', 'GAMMA', 'var(--state-leader)', 250, 2, 1, 'Ardeal'),
  team('team-delta', 'TEAM DELTA', 'DELTA', 'var(--state-accent)', 0, 4, 1, 'Oltenia'),
]

const DOMAINS = [
  { id: 'dom-sci', name: 'Science', code: 'SCI_204', remaining: 2, exhausted: false, nextDifficulty: 20 },
  { id: 'dom-hst', name: 'History', code: 'HST_102', remaining: 3, exhausted: false, nextDifficulty: 10 },
  { id: 'dom-art', name: 'Arts', code: 'ART_980', remaining: 1, exhausted: false, nextDifficulty: 30 },
  { id: 'dom-tec', name: 'Technology', code: 'TEC_881', remaining: 2, exhausted: false, nextDifficulty: 20 },
  { id: 'dom-geo', name: 'Geography', code: 'GEO_105', remaining: 0, exhausted: true, nextDifficulty: null },
  { id: 'dom-spt', name: 'Sports', code: 'SPT_512', remaining: 2, exhausted: false, nextDifficulty: 60 },
] as const

const OPTIONS = [
  { id: 'opt-a', text: 'Olympus Mons' },
  { id: 'opt-b', text: 'Mount Everest' },
  { id: 'opt-c', text: 'Mauna Kea' },
  { id: 'opt-d', text: 'Maxwell Montes' },
] as const

/** A Play with no question issued. */
function base(overrides: Partial<PlayStateForStage> = {}): PlayStateForStage {
  return {
    contractVersion: CONTRACT_VERSION,
    playId: PLAY_ID,
    status: 'playing',
    teams: TEAMS,
    ring: {
      order: ['team-alpha', 'team-beta', 'team-gamma', 'team-delta'],
      currentTeamId: 'team-gamma',
      roundIndex: 2,
    },
    domains: DOMAINS,
    session: null,
    clock: { elapsedMs: 740_000, running: true },
    leaderboardRevealedRanks: [],
    decor: DEFAULT_DECOR_SETTINGS,
    currentScreen: 'idle',
    overlay: { busy: false, active: null, pending: null, enabled: true },
    revealModes: {
      question: 'operator',
      answers: 'operator',
      outcome: 'operator',
      leaderboard: 'operator',
    },
    ...overrides,
  }
}

function session(overrides: Partial<StageSession> = {}): StageSession {
  return {
    questionId: 'q-sci-2',
    domainId: 'dom-sci',
    stem: 'What is the highest peak in the Solar System?',
    options: OPTIONS,
    answerMode: 'single',
    difficulty: 20,
    selectedOptionIds: [],
    lockedOptionIds: null,
    outcome: null,
    timer: {
      durationMs: 30_000,
      remainingMs: 30_000,
      running: false,
      remainingMsAtLock: null,
      expiredOpen: false,
    },
    reveals: { stem: false, optionIds: [], outcome: false },
    ...overrides,
  }
}

const allRevealed = {
  stem: true,
  optionIds: OPTIONS.map((o) => o.id),
  outcome: false,
}

export const FIXTURES = {
  /** Nothing playing. The only screen legal before `play_start`. */
  idle: base({
    status: 'loaded',
    currentScreen: 'idle',
    ring: { order: [], currentTeamId: null, roundIndex: 1 },
    clock: { elapsedMs: 0, running: false },
  }),

  'team-order': base({ currentScreen: 'teamOrder' }),

  'choose-domain': base({ currentScreen: 'chooseDomain' }),

  /** Handoff interstitial as a full screen. */
  'current-team': base({ currentScreen: 'currentTeam' }),

  /** Question issued, nothing revealed yet. */
  'question-issued': base({ currentScreen: 'question', session: session() }),

  /** Stem revealed, options still hidden. */
  'question-stem-revealed': base({
    currentScreen: 'question',
    session: session({
      reveals: { stem: true, optionIds: [], outcome: false },
      timer: {
        durationMs: 30_000,
        remainingMs: 30_000,
        running: true,
        remainingMsAtLock: null,
        expiredOpen: false,
      },
    }),
  }),

  /** Two of four options revealed — the case that must survive an overlay. */
  'question-options-partial': base({
    currentScreen: 'question',
    session: session({
      reveals: {
        stem: true,
        optionIds: ['opt-a', 'opt-b'],
        outcome: false
      },
      timer: {
        durationMs: 30_000,
        remainingMs: 18_400,
        running: true,
        remainingMsAtLock: null,
        expiredOpen: false,
      },
    }),
  }),

  /** Locked: timer stopped, lock time stored, not yet scored. */
  'question-locked': base({
    currentScreen: 'question',
    session: session({
      selectedOptionIds: ['opt-a'],
      lockedOptionIds: ['opt-a'],
      reveals: allRevealed,
      timer: {
        durationMs: 30_000,
        remainingMs: 12_000,
        running: false,
        remainingMsAtLock: 12_000,
        expiredOpen: false,
      },
    }),
  }),

  /** Timer hit zero with nothing selected. Still selectable, not auto-wrong. */
  'question-timer-expired-open': base({
    currentScreen: 'question',
    session: session({
      reveals: allRevealed,
      timer: {
        durationMs: 30_000,
        remainingMs: 0,
        running: false,
        remainingMsAtLock: null,
        expiredOpen: true,
      },
    }),
  }),

  'question-outcome-correct': base({
    currentScreen: 'question',
    session: session({
      selectedOptionIds: ['opt-a'],
      lockedOptionIds: ['opt-a'],
      outcome: {
        verdict: 'correct',
        pointsAwarded: 500,
        correctOptionIds: ['opt-a'],
        bonusAwarded: null,
      },
      reveals: { ...allRevealed, outcome: true },
      timer: {
        durationMs: 30_000,
        remainingMs: 12_000,
        running: false,
        remainingMsAtLock: 12_000,
        expiredOpen: false,
      },
    }),
  }),

  'question-outcome-incorrect': base({
    currentScreen: 'question',
    session: session({
      selectedOptionIds: ['opt-b'],
      lockedOptionIds: ['opt-b'],
      outcome: {
        verdict: 'incorrect',
        pointsAwarded: 0,
        correctOptionIds: ['opt-a'],
        bonusAwarded: null,
      },
      reveals: { ...allRevealed, outcome: true },
      timer: {
        durationMs: 30_000,
        remainingMs: 9_100,
        running: false,
        remainingMsAtLock: 9_100,
        expiredOpen: false,
      },
    }),
  }),

  /** Extra selection: a correct pick plus a wrong one. Zero with partial off. */
  'question-outcome-partial': base({
    currentScreen: 'question',
    session: session({
      answerMode: 'multiple',
      selectedOptionIds: ['opt-a', 'opt-d'],
      lockedOptionIds: ['opt-a', 'opt-d'],
      outcome: {
        verdict: 'partial',
        pointsAwarded: 0,
        correctOptionIds: ['opt-a'],
        bonusAwarded: null,
      },
      reveals: { ...allRevealed, outcome: true },
      timer: {
        durationMs: 30_000,
        remainingMs: 4_300,
        running: false,
        remainingMsAtLock: 4_300,
        expiredOpen: false,
      },
    }),
  }),

  scoreboard: base({ currentScreen: 'scoreboard' }),

  /** Two of four ranks revealed, lowest first: 4 then 3. */
  'final-leaderboard-partial': base({
    status: 'completed',
    currentScreen: 'finalLeaderboard',
    ring: {
      order: ['team-alpha', 'team-beta', 'team-gamma', 'team-delta'],
      currentTeamId: null,
      roundIndex: 3,
    },
    session: null,
    domains: DOMAINS.map((d) => ({ ...d, remaining: 0, exhausted: true, nextDifficulty: null })),
    clock: { elapsedMs: 2_900_000, running: false },
    leaderboardRevealedRanks: [4, 2],
  }),

  /** An overlay running over a question with reveals already showing. The
   * P3 regression case: none of these nodes may unmount. */
  'overlay-over-question': base({
    currentScreen: 'question',
    session: session({
      reveals: {
        stem: true,
        optionIds: ['opt-a', 'opt-b'],
        outcome: false
      },
    }),
    overlay: {
      busy: true,
      active: { kind: 'token-handoff', fromTeamId: 'team-beta', toTeamId: 'team-gamma' },
      pending: null,
      enabled: true,
    },
  }),

  /** Single-team rehearsal Play (spec §4.3 allows it with a warning). */
  'rehearsal-solo': base({
    teams: [team('team-alpha', 'TEAM ALPHA', 'ALPHA', 'var(--state-info)', 0, 1, 1, 'Solo')],
    ring: { order: ['team-alpha'], currentTeamId: 'team-alpha', roundIndex: 1 },
    currentScreen: 'teamOrder',
  }),

  /** Operator pace: no timer anywhere, Stage clock hidden. */
  'operator-pace': base({
    currentScreen: 'question',
    session: session({ timer: null, reveals: { ...allRevealed, outcome: false } }),
  }),

  paused: base({
    status: 'paused',
    currentScreen: 'question',
    session: session({ reveals: allRevealed }),
    clock: { elapsedMs: 740_000, running: false },
  }),
} as const satisfies Record<string, PlayStateForStage>

export type FixtureName = keyof typeof FIXTURES

export const FIXTURE_NAMES = Object.keys(FIXTURES) as readonly FixtureName[]
