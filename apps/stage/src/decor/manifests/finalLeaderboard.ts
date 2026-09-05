import type { ScreenDecorSpec } from '../types'

/**
 * FinalLeaderboard: W I N N E R from the export, big, with a `+` burst and
 * three coral bars. The reference lets them sprawl over the top of the
 * screen; here the champion line and the cards are measured solids, so the
 * letters take whatever the content leaves - the right column and the strip
 * above the cards - and bleed past the canvas edges.
 */
export const FINAL_LEADERBOARD_DECOR: ScreenDecorSpec = {
  screen: 'finalLeaderboard',
  anchor: { x: 0.82, y: 0.55 },
  bodies: [
    { kind: 'svg', asset: 'leader-W', height: { min: 300, max: 340 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.64, max: 0.78 }, y: { min: 0.12, max: 0.25 } } },
    { kind: 'svg', asset: 'leader-I', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.12, max: 0.25 } } },
    { kind: 'svg', asset: 'leader-N', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.64, max: 0.78 }, y: { min: 0.38, max: 0.5 } } },
    { kind: 'svg', asset: 'leader-N-1', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.38, max: 0.5 } } },
    { kind: 'svg', asset: 'leader-E', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.64, max: 0.78 }, y: { min: 0.64, max: 0.76 } } },
    { kind: 'svg', asset: 'leader-R', height: { min: 280, max: 320 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.64, max: 0.76 } } },
    { kind: 'svg', asset: 'leader-I-1', height: { min: 260, max: 300 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.7, max: 0.9 }, y: { min: 0.84, max: 0.96 } } },
    { kind: 'svg', asset: 'plus', height: { min: 260, max: 300 }, color: 'correct', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.26, max: 0.36 } } },
    { kind: 'svg', asset: 'minus', height: { min: 170, max: 200 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.64, max: 0.76 }, y: { min: 0.52, max: 0.6 } } },
    { kind: 'svg', asset: 'minus', height: { min: 170, max: 200 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.52, max: 0.6 } } },
    { kind: 'svg', asset: 'minus', height: { min: 150, max: 180 }, color: 'incorrect', opacity: 1, rotation: { min: -15, max: 15 }, region: { x: { min: 0.62, max: 0.72 }, y: { min: 0.86, max: 0.96 } } },
  ],
}
