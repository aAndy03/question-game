/**
 * The transition registry. Authored pairs live here by key; every other
 * ordered pair of screens resolves to the default crossfade. `screenPairs()`
 * from the contract enumerates the full set, and a test asserts each one
 * resolves, so adding a screen can never leave a jump unanimated.
 */

import { screenPairs, type StageScreen } from '@questiongame/contract'
import { crossfade } from './default'
import { idleToTeamOrder } from './idle-teamOrder'
import { pairKey, type PairKey, type TransitionFactory } from '../types'

export const AUTHORED: Partial<Record<PairKey, TransitionFactory>> = {
  'idle>teamOrder': idleToTeamOrder,
}

export function transitionFor(from: StageScreen, to: StageScreen): TransitionFactory {
  return AUTHORED[pairKey(from, to)] ?? crossfade
}

export function isAuthored(from: StageScreen, to: StageScreen): boolean {
  return pairKey(from, to) in AUTHORED
}

/** Every pair with its factory — the exhaustiveness surface for tests and the roadmap. */
export function allTransitions(): readonly { from: StageScreen; to: StageScreen; authored: boolean }[] {
  return screenPairs().map(([from, to]) => ({ from, to, authored: isAuthored(from, to) }))
}

export { crossfade, idleToTeamOrder }
