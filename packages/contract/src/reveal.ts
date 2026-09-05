/**
 * Reveal keys and animation keys.
 *
 * `PresentationService` addresses reveals by key, and every GSAP timeline
 * reports completion with an animation key. Screens must not invent their own
 * strings for either — the auto-reveal path waits on `anim-complete` carrying
 * exactly these values (spec §11.G).
 */

import type { StageScreen } from './screens'

/** What can be revealed, one beat at a time, by the operator or by auto mode. */
export type RevealKey =
  | 'stem'
  | `option:${string}`
  | 'outcome'
  | `leader:${number}`

export const revealKey = {
  stem: (): RevealKey => 'stem',
  option: (optionId: string): RevealKey => `option:${optionId}`,
  outcome: (): RevealKey => 'outcome',
  leader: (rank: number): RevealKey => `leader:${rank}`,
} as const

export function parseRevealKey(
  key: string,
):
  | { kind: 'stem' }
  | { kind: 'option'; optionId: string }
  | { kind: 'outcome' }
  | { kind: 'leader'; rank: number }
  | null {
  if (key === 'stem') return { kind: 'stem' }
  if (key === 'outcome') return { kind: 'outcome' }
  if (key.startsWith('option:')) {
    const optionId = key.slice('option:'.length)
    return optionId === '' ? null : { kind: 'option', optionId }
  }
  if (key.startsWith('leader:')) {
    const rank = Number(key.slice('leader:'.length))
    return Number.isInteger(rank) && rank > 0 ? { kind: 'leader', rank } : null
  }
  return null
}

/**
 * The four reveal channels, each independently `operator` or `auto`
 * (spec §4.2). `answers` covers every option; there is no per-option mode.
 */
export const REVEAL_CHANNELS = ['question', 'answers', 'outcome', 'leaderboard'] as const
export type RevealChannel = (typeof REVEAL_CHANNELS)[number]
export type RevealMode = 'operator' | 'auto'

/** Which channel governs a given reveal key. */
export function channelForRevealKey(key: RevealKey): RevealChannel | null {
  const parsed = parseRevealKey(key)
  if (parsed === null) return null
  switch (parsed.kind) {
    case 'stem':
      return 'question'
    case 'option':
      return 'answers'
    case 'outcome':
      return 'outcome'
    case 'leader':
      return 'leaderboard'
  }
}

/**
 * Overlay animations: drawn over the live screen, never remounting it
 * (spec §2.6). A discriminated union, so a new overlay is one member here
 * plus one component and one timeline, not a new event shape.
 *
 *   token-handoff     full screen: the token passes from one team to the next
 *                     (`TEAM ALPHA → TEAM BETA`, "NOW PLAYING")
 *   round-advance     full screen: a new round begins
 *   multiple-answers  full screen: the issued question takes several answers
 *   outcome           half screen: the verdict word over the bottom half on a
 *                     transparent sheet, the question staying visible
 *   current-team      full screen: the current-team block over any screen
 *
 * Every kind is enqueued automatically by the host when its cause occurs,
 * and may also be called by the operator at any time with `show_overlay`.
 */
export type OverlayRequest =
  | {
      readonly kind: 'token-handoff'
      /** Null when there was no previous holder (first token of the Play). */
      readonly fromTeamId: string | null
      readonly toTeamId: string
    }
  | { readonly kind: 'round-advance'; readonly roundIndex: number }
  | { readonly kind: 'multiple-answers'; readonly optionIds: readonly string[] }
  | { readonly kind: 'outcome'; readonly verdict: 'correct' | 'incorrect' | 'partial' }
  | { readonly kind: 'current-team'; readonly teamId: string | null }

export type OverlayKind = OverlayRequest['kind']

export const OVERLAY_KINDS = ['token-handoff', 'round-advance', 'multiple-answers', 'outcome', 'current-team'] as const satisfies readonly OverlayKind[]

/** Full-screen overlays hide the screen; half-screen ones leave it visible. */
export const OVERLAY_COVERAGE: Record<OverlayKind, 'full' | 'half'> = {
  'token-handoff': 'full',
  'round-advance': 'full',
  'multiple-answers': 'full',
  outcome: 'half',
  'current-team': 'full',
}

/**
 * Anything that can report completion. Stage emits `anim-complete { key }` with
 * one of these, and nothing else.
 */
export type AnimKey =
  | `transition:${StageScreen}>${StageScreen}`
  | `overlay:${OverlayKind}`
  | `reveal:${RevealKey}`

export const animKey = {
  transition: (from: StageScreen, to: StageScreen): AnimKey =>
    `transition:${from}>${to}`,
  overlay: (kind: OverlayKind): AnimKey => `overlay:${kind}`,
  reveal: (key: RevealKey): AnimKey => `reveal:${key}`,
} as const
