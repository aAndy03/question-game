import type { ScreenDecorSpec } from '../types'

/**
 * Idle: the right half of the canvas is the scatter. The reference shows a
 * giant `?`, three loose digits, a mint `+` burst, a coral `−` bar and two
 * hairline diamond outlines, all bleeding off the top and right edges.
 *
 * The diamonds are the Union assets. The `?` and the digits are glyph
 * stand-ins until exported as paths; swap each to `{ kind: 'svg' }` then.
 */
export const IDLE_DECOR: ScreenDecorSpec = {
  screen: 'idle',
  boundary: { x: 940, y: -120, width: 1040, height: 1280 },
  anchor: { x: 0.45, y: 0.5 },
  bodies: [
    {
      kind: 'glyph',
      glyph: '?',
      height: { min: 800, max: 900 },
      aspect: 0.62,
      color: 'ink',
      opacity: 1,
      rotation: { min: -8, max: 8 },
      region: { x: { min: 0, max: 0.35 }, y: { min: 0.15, max: 0.45 } },
    },
    {
      kind: 'glyph',
      glyph: '1',
      height: { min: 240, max: 300 },
      aspect: 0.55,
      color: 'ink',
      opacity: 1,
      rotation: { min: 10, max: 30 },
      region: { x: { min: 0.35, max: 0.7 }, y: { min: 0, max: 0.25 } },
    },
    {
      kind: 'glyph',
      glyph: '3',
      height: { min: 220, max: 280 },
      aspect: 0.6,
      color: 'ink',
      opacity: 1,
      rotation: { min: 15, max: 35 },
      region: { x: { min: 0.55, max: 0.9 }, y: { min: 0.15, max: 0.4 } },
    },
    {
      kind: 'glyph',
      glyph: '2',
      height: { min: 220, max: 280 },
      aspect: 0.6,
      color: 'ink',
      opacity: 1,
      rotation: { min: -25, max: -5 },
      region: { x: { min: 0.6, max: 1 }, y: { min: 0.55, max: 0.85 } },
    },
    {
      kind: 'svg',
      asset: 'plus',
      height: { min: 330, max: 400 },
      color: 'correct',
      opacity: 1,
      rotation: { min: -15, max: 15 },
      region: { x: { min: 0.2, max: 0.55 }, y: { min: 0.6, max: 0.95 } },
    },
    {
      kind: 'svg',
      asset: 'minus',
      height: { min: 220, max: 270 },
      color: 'incorrect',
      opacity: 1,
      rotation: { min: -15, max: 15 },
      region: { x: { min: 0.55, max: 0.95 }, y: { min: 0.35, max: 0.6 } },
    },
    {
      kind: 'svg',
      asset: 'board-union',
      height: { min: 230, max: 280 },
      color: 'ink',
      opacity: 1,
      rotation: { min: -15, max: 15 },
      region: { x: { min: 0.7, max: 1 }, y: { min: 0, max: 0.2 } },
    },
    {
      kind: 'svg',
      asset: 'board-union-1',
      height: { min: 230, max: 280 },
      color: 'ink',
      opacity: 1,
      rotation: { min: -15, max: 15 },
      region: { x: { min: 0.75, max: 1 }, y: { min: 0.8, max: 1 } },
    },
  ],
}
