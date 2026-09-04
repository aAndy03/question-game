import type { ScreenDecorSpec } from '../types'

/**
 * FinalLeaderboard: W I N N E R from the export, big, with a `+` burst and
 * three coral bars. The reference lets them sprawl over the top of the
 * screen; the box here keeps them off the champion line and the cards
 * (right of the content column, top to bottom) while still bleeding past
 * the canvas edges.
 */
export const FINAL_LEADERBOARD_DECOR: ScreenDecorSpec = {
  screen: 'finalLeaderboard',
  boundary: { x: 1300, y: -80, width: 700, height: 1240 },
  anchor: { x: 0.5, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'leader-W', height: { min: 330, max: 380 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.5 }, y: { min: 0, max: 0.2 } } },
    { kind: 'svg', asset: 'leader-I', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.5, max: 1 }, y: { min: 0, max: 0.2 } } },
    { kind: 'svg', asset: 'leader-N', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.5 }, y: { min: 0.3, max: 0.5 } } },
    { kind: 'svg', asset: 'leader-N-1', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.5, max: 1 }, y: { min: 0.3, max: 0.5 } } },
    { kind: 'svg', asset: 'leader-E', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.5 }, y: { min: 0.6, max: 0.8 } } },
    { kind: 'svg', asset: 'leader-R', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.5, max: 1 }, y: { min: 0.6, max: 0.8 } } },
    { kind: 'svg', asset: 'leader-I-1', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.2, max: 0.8 }, y: { min: 0.8, max: 1 } } },
    { kind: 'svg', asset: 'plus', height: { min: 330, max: 380 }, color: 'correct', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.5, max: 1 }, y: { min: 0.1, max: 0.4 } } },
    { kind: 'svg', asset: 'minus', height: { min: 180, max: 220 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0, max: 0.5 }, y: { min: 0.4, max: 0.6 } } },
    { kind: 'svg', asset: 'minus', height: { min: 180, max: 220 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.5, max: 1 }, y: { min: 0.5, max: 0.7 } } },
    { kind: 'svg', asset: 'minus', height: { min: 160, max: 200 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0, max: 0.4 }, y: { min: 0.8, max: 1 } } },
  ],
}
