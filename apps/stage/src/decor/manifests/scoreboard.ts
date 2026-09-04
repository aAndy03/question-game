import type { ScreenDecorSpec } from '../types'

/**
 * Scoreboard: the up/down arrows and the ink bar from the export, on the
 * right third. Two hairline arrows, one solid bar.
 */
export const SCOREBOARD_DECOR: ScreenDecorSpec = {
  screen: 'scoreboard',
  boundary: { x: 1360, y: 120, width: 600, height: 920 },
  anchor: { x: 0.5, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'board-bar', height: { min: 480, max: 540 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.4, max: 0.8 }, y: { min: 0.2, max: 0.6 } } },
    { kind: 'svg', asset: 'board-union', height: { min: 240, max: 270 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.4 }, y: { min: 0, max: 0.25 } } },
    { kind: 'svg', asset: 'board-union-1', height: { min: 250, max: 280 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0, max: 0.5 }, y: { min: 0.7, max: 1 } } },
  ],
}
