import type { PlayStateForStage } from '@questiongame/contract'
import type { DecorBodySpec, ScreenDecorSpec } from '../types'

/**
 * Idle: the right half of the canvas is the scatter. The reference shows a
 * giant `?`, loose digits, a mint `+` burst, a coral `-` bar and two
 * diamond outlines, all bleeding off the top and right edges.
 *
 * The digits are one per team in the Play (the export carries 1-5); a Play
 * with more teams shows the first five, a Play with none shows no digit.
 * Everything else is fixed.
 */

const DIGIT_ASSETS = ['digit-1', 'digit-2', 'digit-3', 'digit-4', 'digit-5'] as const

const FIXED: readonly DecorBodySpec[] = [
  {
    kind: 'svg',
    asset: 'question',
    height: { min: 720, max: 800 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -8, max: 8 },
    region: { x: { min: 0, max: 0.35 }, y: { min: 0.15, max: 0.45 } },
  },
  {
    kind: 'svg',
    asset: 'plus',
    height: { min: 300, max: 350 },
    color: 'correct',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.2, max: 0.55 }, y: { min: 0.6, max: 0.95 } },
  },
  {
    kind: 'svg',
    asset: 'minus',
    height: { min: 200, max: 240 },
    color: 'incorrect',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.55, max: 0.95 }, y: { min: 0.35, max: 0.6 } },
  },
  {
    kind: 'svg',
    asset: 'board-union',
    height: { min: 200, max: 240 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.7, max: 1 }, y: { min: 0, max: 0.2 } },
  },
  {
    kind: 'svg',
    asset: 'board-union-1',
    height: { min: 200, max: 240 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.75, max: 1 }, y: { min: 0.8, max: 1 } },
  },
]

function digit(asset: (typeof DIGIT_ASSETS)[number], i: number, n: number): DecorBodySpec {
  // Spread the digits along the right edge, top to bottom, in team order.
  const t = n <= 1 ? 0.5 : i / (n - 1)
  return {
    kind: 'svg',
    asset,
    height: { min: 200, max: 250 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -30, max: 30 },
    region: { x: { min: 0.45, max: 1 }, y: { min: Math.max(0, t - 0.15), max: Math.min(1, t + 0.15) } },
  }
}

export function idleDecor(state: Pick<PlayStateForStage, 'teams'>): ScreenDecorSpec {
  const n = Math.min(state.teams.length, DIGIT_ASSETS.length)
  const digits = DIGIT_ASSETS.slice(0, n).map((asset, i) => digit(asset, i, n))
  return {
    screen: 'idle',
    // Wider than the canvas on the right and top so the crowd has room to
    // move; shapes clip past the edge as in the reference.
    boundary: { x: 900, y: -160, width: 1140, height: 1400 },
    anchor: { x: 0.45, y: 0.5 },
    bodies: [...FIXED, ...digits],
  }
}
