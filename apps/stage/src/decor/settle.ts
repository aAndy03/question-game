/**
 * The frame-zero layout of a screen's decor: what the world looks like the
 * instant it goes live. Kept as a pure function for tests, the Viewer's
 * static preview, and anything that needs a layout without a running loop.
 */

import { DEFAULT_DECOR_SETTINGS, type StageDecorSettings } from '@questiongame/contract'
import { createDecorWorld } from './world'
import type { PlacedBody, ScreenDecorSpec } from './types'

export function settle(
  spec: ScreenDecorSpec,
  seed: number,
  settings: StageDecorSettings = DEFAULT_DECOR_SETTINGS,
): readonly PlacedBody[] {
  const world = createDecorWorld(spec, seed, settings)
  const placed = world.read()
  world.destroy()
  return placed
}

export { bodySize } from './world'
