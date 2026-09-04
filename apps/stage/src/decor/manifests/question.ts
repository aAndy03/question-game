import type { ScreenDecorSpec } from '../types'

/**
 * Question: the `+` burst and the `−` bar in the lower right, under the side
 * panel. Both carry a role, so once the outcome shows only the matching one
 * stays at full opacity (see `mood.ts`).
 */
export const QUESTION_DECOR: ScreenDecorSpec = {
  screen: 'question',
  boundary: { x: 1330, y: 460, width: 630, height: 700 },
  anchor: { x: 0.5, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'plus', role: 'correct', height: { min: 330, max: 400 }, color: 'correct', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0, max: 0.6 }, y: { min: 0.4, max: 1 } } },
    { kind: 'svg', asset: 'minus', role: 'incorrect', height: { min: 220, max: 270 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.4, max: 1 }, y: { min: 0, max: 0.5 } } },
  ],
}
