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

const DIGIT_ASSETS = ['1', '2', '3', '4', '5'] as const

const FIXED: readonly DecorBodySpec[] = [
  {
    kind: 'svg',
    asset: 'question',
    height: { min: 720, max: 800 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -8, max: 8 },
    region: { x: { min: 0.5, max: 0.62 }, y: { min: 0.15, max: 0.4 } },
  },
  {
    kind: 'svg',
    asset: 'plus',
    height: { min: 300, max: 350 },
    color: 'correct',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.6, max: 0.75 }, y: { min: 0.6, max: 0.85 } },
  },
  {
    kind: 'svg',
    asset: 'minus',
    height: { min: 200, max: 240 },
    color: 'incorrect',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.78, max: 0.94 }, y: { min: 0.4, max: 0.58 } },
  },
  {
    kind: 'svg',
    asset: 'board-union',
    height: { min: 200, max: 240 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.05, max: 0.2 } },
  },
  {
    kind: 'svg',
    asset: 'board-union-1',
    height: { min: 200, max: 240 },
    color: 'ink',
    opacity: 1,
    rotation: { min: -15, max: 15 },
    region: { x: { min: 0.84, max: 0.96 }, y: { min: 0.8, max: 0.94 } },
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
    region: { x: { min: 0.7, max: 0.94 }, y: { min: Math.max(0.05, t * 0.9 - 0.1), max: Math.min(0.95, t * 0.9 + 0.1) } },
  }
}

export function idleDecor(state: Pick<PlayStateForStage, 'teams'>): ScreenDecorSpec {
  const n = Math.min(state.teams.length, DIGIT_ASSETS.length)
  const digits = DIGIT_ASSETS.slice(0, n).map((asset, i) => digit(asset, i, n))
  return {
    screen: 'idle',
    anchor: { x: 0.72, y: 0.5 },
    bodies: [...FIXED, ...digits],
  }
}
