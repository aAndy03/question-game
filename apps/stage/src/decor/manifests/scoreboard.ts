import type { ScreenDecorSpec } from '../types'

/**
 * Scoreboard: the up/down arrows and the ink bar from the export, right of
 * the standings. Two hairline arrows, one solid bar.
 */
export const SCOREBOARD_DECOR: ScreenDecorSpec = {
  screen: 'scoreboard',
  anchor: { x: 0.82, y: 0.5 },
  bodies: [
    { kind: 'svg', asset: 'board-rectangle-1', height: { min: 460, max: 520 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.78, max: 0.94 }, y: { min: 0.3, max: 0.6 } } },
    { kind: 'svg', asset: 'board-union', height: { min: 220, max: 260 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.68, max: 0.8 }, y: { min: 0.15, max: 0.3 } } },
    { kind: 'svg', asset: 'board-union-1', height: { min: 230, max: 270 }, color: 'ink', opacity: 1, rotation: { min: -10, max: 10 }, region: { x: { min: 0.68, max: 0.82 }, y: { min: 0.7, max: 0.88 } } },
  ],
}
