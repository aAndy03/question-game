import type { ScreenDecorSpec } from '../types'

/**
 * Question: the `+` burst and the `-` bar in the lower right, under the side
 * panel. Both carry a role, so once the outcome shows only the matching one
 * stays at full opacity (see `mood.ts`). The stem block, side panel, rule
 * and answer board are measured solids.
 */
export const QUESTION_DECOR: ScreenDecorSpec = {
  screen: 'question',
  anchor: { x: 0.84, y: 0.75 },
  bodies: [
    { kind: 'svg', asset: 'plus', role: 'correct', height: { min: 320, max: 380 }, color: 'correct', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.7, max: 0.88 }, y: { min: 0.72, max: 0.92 } } },
    { kind: 'svg', asset: 'minus', role: 'incorrect', height: { min: 210, max: 250 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.8, max: 0.96 }, y: { min: 0.52, max: 0.68 } } },
  ],
}
