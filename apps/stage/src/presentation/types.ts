/**
 * Stage presentation — the GSAP side of `PresentationService`.
 *
 * A screen change is a *transition*: one timeline that plays over two
 * mounted page layers (the outgoing screen underneath, the incoming one on
 * top), the persistent header, and the decor layer. The registry
 * (`transitions/`) resolves every ordered pair of screens to a factory; an
 * authored pair overrides the default crossfade, so no pair is ever
 * unanimated and adding a screen never leaves a hole.
 *
 * Every timeline reports completion once with the contract's `AnimKey`
 * (`transition:<from>><to>`); that handshake is what stops auto-reveal
 * outrunning the animation (spec §11.G).
 *
 * Caller contract: the outgoing layer is still mounted when the factory
 * runs and is unmounted only after the timeline completes; the decor swap
 * happens when the timeline calls `swapDecor`, never before.
 */

import type gsap from 'gsap'
import type { StageScreen } from '@questiongame/contract'

export interface TransitionContext {
  readonly from: StageScreen
  readonly to: StageScreen
  /** The outgoing page layer. Null on the very first paint. */
  readonly outgoing: HTMLElement | null
  /** The incoming page layer. */
  readonly incoming: HTMLElement
  /** The persistent header. */
  readonly header: HTMLElement | null
  /** The persistent decor layer. */
  readonly decor: HTMLElement | null
  /** Rebuilds the decor world for the incoming screen. Call it once, mid-timeline. */
  readonly swapDecor: () => void
}

export type TransitionFactory = (ctx: TransitionContext) => gsap.core.Timeline

/** `${from}>${to}` — the registry key, the same shape the AnimKey uses. */
export type PairKey = `${StageScreen}>${StageScreen}`

export const pairKey = (from: StageScreen, to: StageScreen): PairKey => `${from}>${to}`
