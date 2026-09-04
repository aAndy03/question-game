/**
 * Decor: per-screen manifests → seeded, settled placements.
 *
 * Adding decor to a screen is one manifest file plus one entry in
 * DECOR_BY_SCREEN. The organism (`DecorField`) and the atom (`DecorShape`)
 * never know which screen they are drawing.
 */

import type { StageScreen } from '@questiongame/contract'
import { IDLE_DECOR } from './manifests/idle'
import { settle } from './settle'
import type { PlacedBody, ScreenDecorSpec } from './types'

export const DECOR_BY_SCREEN: Partial<Record<StageScreen, ScreenDecorSpec>> = {
  idle: IDLE_DECOR,
}

/** The static layout for a screen and a seed; empty for a screen with no decor. */
export function layoutDecor(screen: StageScreen, seed: number): readonly PlacedBody[] {
  const spec = DECOR_BY_SCREEN[screen]
  return spec ? settle(spec, seed) : []
}

export { settle } from './settle'
export { seedFromPlay, hashString, rng } from './seed'
export { decorAsset, DECOR_ASSET_IDS, type DecorAsset, type DecorAssetId } from './assets'
export type * from './types'
