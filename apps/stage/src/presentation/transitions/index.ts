/**
 * The transition registry. Every ordered pair of screens resolves to a
 * timeline: a bespoke pair by key, every other pair to the composition of
 * the outgoing screen's exit, the decor handover and the incoming screen's
 * enter (`screens.ts`). `screenPairs()` from the contract enumerates the set
 * and a test asserts each one resolves, so adding a screen can never leave
 * a jump unanimated.
 *
 * Header show/hide is not a pair's business: the runner adds it for any pair
 * that crosses between a screen with a header and one without.
 */

import gsap from 'gsap'
import { screenPairs, type StageScreen } from '@questiongame/contract'
import { decorSwap } from '../beats'
import { SCREEN_MOTION } from '../screens'
import { pairKey, type PairKey, type TransitionFactory } from '../types'

/** When the incoming screen's parts start arriving, relative to the exit. */
const ENTER_AT = 0.3

/** exit(from) → decor handover → enter(to). */
export const composed: TransitionFactory = (ctx) => {
  const tl = gsap.timeline()
  if (ctx.outgoing) SCREEN_MOTION[ctx.from].exit(tl, ctx.outgoing, 0)
  decorSwap(tl, ctx.decor, ctx.swapDecor, 0)
  // The incoming layer is visible from the start; its parts arrive.
  gsap.set(ctx.incoming, { autoAlpha: 1 })
  SCREEN_MOTION[ctx.to].enter(tl, ctx.incoming, ENTER_AT)
  return tl
}

/** Bespoke pairs, when the composition is not the right shape. None yet. */
export const AUTHORED: Partial<Record<PairKey, TransitionFactory>> = {}

export function transitionFor(from: StageScreen, to: StageScreen): TransitionFactory {
  return AUTHORED[pairKey(from, to)] ?? composed
}

export function isBespoke(from: StageScreen, to: StageScreen): boolean {
  return pairKey(from, to) in AUTHORED
}

/** Every pair with how it resolves — the exhaustiveness surface for tests and the roadmap. */
export function allTransitions(): readonly { from: StageScreen; to: StageScreen; bespoke: boolean }[] {
  return screenPairs().map(([from, to]) => ({ from, to, bespoke: isBespoke(from, to) }))
}
