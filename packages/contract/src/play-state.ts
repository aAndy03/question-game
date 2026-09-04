/**
 * `PlayStateForStage` — everything the Stage webview receives, and nothing
 * else.
 *
 * The host emits the full snapshot to `main` and this stripped shape to
 * `stage` (spec §13, §5.7). Stage never receives operator chrome, Viewer hit
 * targets, catalog rows, settings documents, or anything about other recipes:
 * a leak here becomes a leak on camera.
 *
 * Only organisms and pages may import this type. Atoms and molecules take
 * props — enforced in eslint.config.js.
 */

import type { StageScreen } from './screens'
import type { OverlayRequest, RevealChannel, RevealMode } from './reveal'

/**
 * Bumped when a field is removed or its meaning changes; additive fields do
 * not bump it. Stage compares this against its own build so a host/webview
 * mismatch surfaces as a notice instead of a blank screen.
 */
export const CONTRACT_VERSION = 1

/** Spec §5.1. */
export type PlayStatus =
  | 'loaded'
  | 'playing'
  | 'paused'
  | 'completed'
  | 'abandoned'
  | 'restarted'

/**
 * A team as Stage draws it. Display fields only — these are snapshot copies
 * taken at Play start (spec §4.3), so a catalog rename mid-Play does not move
 * them.
 */
export interface StageTeam {
  readonly id: string
  readonly name: string
  /** Short code for tight layouts, e.g. `ALPHA`. */
  readonly shortCode: string
  /** Team mark colour. A token name where possible, otherwise a literal. */
  readonly color: string
  /** Resolved asset URL, or null when the recipe sets no logo. */
  readonly logoUrl: string | null
  readonly score: number
  /** Competition rank, ties share a rank: 1, 1, 3 (spec §4.4). */
  readonly rank: number
  /** Tokens received this Play. The round invariant reads these (spec §5.4). */
  readonly turnsTaken: number
  /** False once a team is out; the ring skips it and Stage dims it. */
  readonly active: boolean
}

/** Whose turn it is, and how far through the round. */
export interface StageRing {
  /** Playing sequence, recipe order with any operator reordering applied. */
  readonly order: readonly string[]
  /** Null between a resolve and the next token. */
  readonly currentTeamId: string | null
  /** 1-based. Every active team receives one token per round (spec §5.4). */
  readonly roundIndex: number
}

/** A domain on the ChooseDomain board. */
export interface StageDomain {
  readonly id: string
  readonly name: string
  /** Part-number style code from the design system, e.g. `TEC_881`. */
  readonly code: string
  /** Unconsumed questions left in this Play. */
  readonly remaining: number
  /** True when `remaining === 0`; the card renders dimmed and unpickable. */
  readonly exhausted: boolean
}

export interface StageOption {
  readonly id: string
  readonly text: string
}

/**
 * Presentational verdict. Distinct from points: the design system has three
 * result frames (`ALL CORRECT`, `INCORRECT`, `EXTRA SELECTION`), and with
 * partial credit off the last still scores zero.
 */
export type OutcomeVerdict = 'correct' | 'incorrect' | 'partial'

export interface StageOutcome {
  readonly verdict: OutcomeVerdict
  readonly pointsAwarded: number
  /** Revealed at outcome so Stage can mark the right cards. */
  readonly correctOptionIds: readonly string[]
  /** Present when a consecutive-correct bonus applied (spec §2.3). */
  readonly bonusAwarded: number | null
}

/**
 * Null at operator pace (`timer.enabled = false`), which hides the Stage clock
 * entirely (spec §2.4).
 */
export interface StageTimer {
  readonly durationMs: number
  /** Host-authoritative, emitted every 100ms. Stage may interpolate between
   * ticks but must never run past zero on its own. */
  readonly remainingMs: number
  readonly running: boolean
  /** Frozen at lock; feeds lock-speed scoring. */
  readonly remainingMsAtLock: number | null
  /** Hit zero with nothing selected and nothing locked (spec §2.4). */
  readonly expiredOpen: boolean
}

/**
 * What has been revealed so far.
 *
 * This lives on the Play, not in component state: it must survive undo and be
 * identical in Stage and the Viewer. Options are listed by id in reveal order,
 * not counted, so the operator may reveal out of order and a re-render cannot
 * lose which card is showing.
 */
export interface StageReveals {
  readonly stem: boolean
  readonly optionIds: readonly string[]
  readonly outcome: boolean
  /** Ranks revealed on FinalLeaderboard, lowest first (spec §5.5). */
  readonly leaderboardRanks: readonly number[]
}

/** The issued question. Null when no question is in play. */
export interface StageSession {
  readonly questionId: string
  readonly domainId: string
  readonly stem: string
  readonly options: readonly StageOption[]
  readonly answerMode: 'single' | 'multiple'
  /** 1-100. Shown on the question header in some layouts. */
  readonly difficulty: number
  /** Working choice. Does not stop the timer and is not scored (spec §2.4). */
  readonly selectedOptionIds: readonly string[]
  /** Frozen choice. Null until lock. */
  readonly lockedOptionIds: readonly string[] | null
  /** Null until reveal — the only point that scores and consumes. */
  readonly outcome: StageOutcome | null
  readonly timer: StageTimer | null
  readonly reveals: StageReveals
}

/**
 * Overlay queue state. At most one animation runs and at most one waits; a
 * newer pending replaces the older (spec §2.6).
 */
export interface StageOverlay {
  readonly busy: boolean
  readonly active: OverlayRequest | null
  readonly pending: OverlayRequest | null
  /** False disables the queue entirely; the token still updates (spec §5.6). */
  readonly enabled: boolean
}

export interface PlayStateForStage {
  readonly contractVersion: number
  /** Identifies the Play so Stage can detect a Restart rather than a redraw. */
  readonly playId: string
  readonly status: PlayStatus

  readonly teams: readonly StageTeam[]
  readonly ring: StageRing
  readonly domains: readonly StageDomain[]
  readonly session: StageSession | null

  /** What the operator has chosen to show. Independent of game truth. */
  readonly currentScreen: StageScreen
  readonly overlay: StageOverlay

  /**
   * Live reveal modes. Stage needs them because auto mode makes Stage drive the
   * next beat itself once `anim-complete` fires.
   */
  readonly revealModes: Readonly<Record<RevealChannel, RevealMode>>
}

/** Teams in finishing order: score descending, then the recipe's ring order. */
export function leaderboard(state: PlayStateForStage): readonly StageTeam[] {
  return [...state.teams].sort(
    (a, b) => b.score - a.score || state.ring.order.indexOf(a.id) - state.ring.order.indexOf(b.id),
  )
}

export function teamById(
  state: PlayStateForStage,
  id: string,
): StageTeam | undefined {
  return state.teams.find((t) => t.id === id)
}

/** The team currently holding the token, if any. */
export function currentTeam(state: PlayStateForStage): StageTeam | null {
  const id = state.ring.currentTeamId
  return id === null ? null : (teamById(state, id) ?? null)
}

/**
 * The round invariant, as a predicate (spec §5.4). Exported so the Viewer and
 * tests can assert it against any snapshot without reimplementing it.
 * Holds for any team count, including a one-team rehearsal Play.
 */
export function roundInvariantHolds(state: PlayStateForStage): boolean {
  const turns = state.teams.filter((t) => t.active).map((t) => t.turnsTaken)
  if (turns.length === 0) return true
  return Math.max(...turns) - Math.min(...turns) <= 1
}
