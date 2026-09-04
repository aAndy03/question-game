/**
 * Decor: per-screen manifests → seeded, settled placements.
 *
 * Adding decor to a screen is one manifest file plus one entry in
 * DECOR_BY_SCREEN. The organism (`DecorField`) and the atom (`DecorShape`)
 * never know which screen they are drawing.
 */

import type { StageDecorSettings, StageScreen } from '@questiongame/contract'
import { IDLE_DECOR } from './manifests/idle'
import { TEAM_ORDER_DECOR } from './manifests/teamOrder'
import { CHOOSE_DOMAIN_DECOR } from './manifests/chooseDomain'
import { QUESTION_DECOR } from './manifests/question'
import { SCOREBOARD_DECOR } from './manifests/scoreboard'
import { FINAL_LEADERBOARD_DECOR } from './manifests/finalLeaderboard'
import { settle } from './settle'
import type { PlacedBody, ScreenDecorSpec } from './types'

export const DECOR_BY_SCREEN: Partial<Record<StageScreen, ScreenDecorSpec>> = {
  idle: IDLE_DECOR,
  teamOrder: TEAM_ORDER_DECOR,
  chooseDomain: CHOOSE_DOMAIN_DECOR,
  question: QUESTION_DECOR,
  scoreboard: SCOREBOARD_DECOR,
  finalLeaderboard: FINAL_LEADERBOARD_DECOR,
}

/** Frame-zero layout for a screen and a seed; empty for a screen with no decor. */
export function layoutDecor(screen: StageScreen, seed: number, settings?: StageDecorSettings): readonly PlacedBody[] {
  const spec = DECOR_BY_SCREEN[screen]
  return spec ? settle(spec, seed, settings) : []
}

/** Where a placed body sits: one transform string, shared by render and the live loop. */
export function decorTransform(p: Pick<PlacedBody, 'x' | 'y' | 'width' | 'height' | 'angle'>): string {
  return `translate3d(${p.x - p.width / 2}px, ${p.y - p.height / 2}px, 0) rotate(${p.angle}deg)`
}

export { settle } from './settle'
export { decorOpacity, type DecorMood } from './mood'
export { createDecorWorld, anchorPhase, STEP_MS, type DecorWorld } from './world'
export { seedFromPlay, hashString, rng } from './seed'
export { decorAsset, DECOR_ASSET_IDS, type DecorAsset, type DecorAssetId } from './assets'
export type * from './types'
