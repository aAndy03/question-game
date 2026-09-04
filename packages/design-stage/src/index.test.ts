import { describe, expect, it } from 'vitest'
import { BORDER, COLOR, RADIUS, STAGE_PADDING, STAGE_SIZE } from './index'

describe('Stage design tokens', () => {
  it('fixes the Stage canvas at 1920x1080 with 64px padding', () => {
    expect(STAGE_SIZE).toEqual({ width: 1920, height: 1080 })
    expect(STAGE_PADDING).toBe(64)
  })

  it('exposes exactly the three radii the design system allows', () => {
    expect(Object.keys(RADIUS)).toEqual(['none', 'sm', 'md'])
  })

  it('exposes the five signal colours', () => {
    for (const k of ['correct', 'incorrect', 'info', 'leader', 'accent'] as const) {
      expect(COLOR[k]).toMatch(/^var\(--state-/)
    }
  })

  it('offers border weights, not shadow tokens', () => {
    expect(Object.keys(BORDER)).toEqual(['thin', 'thick', 'heavy'])
  })
})
