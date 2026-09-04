import { describe, expect, it } from 'vitest'
import {
  BORDER,
  COLOR,
  LAYOUT,
  RADIUS,
  TOKEN_GROUPS,
  TYPE,
  WEIGHT,
  tokenName,
} from './index'

describe('Stage design tokens', () => {
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

  it('holds no literal values — every token is a reference into CSS', () => {
    for (const [group, tokens] of Object.entries(TOKEN_GROUPS)) {
      for (const [key, value] of Object.entries(tokens)) {
        expect(
          value,
          `${group}.${key} must reference a custom property, not hardcode a value`,
        ).toMatch(/^var\(--[a-z0-9-]+\)$/)
      }
    }
  })

  it('keeps the Stage canvas in CSS so there is one place to change it', () => {
    expect(tokenName(LAYOUT.width)).toBe('--stage-width')
    expect(tokenName(LAYOUT.height)).toBe('--stage-height')
    expect(tokenName(LAYOUT.padding)).toBe('--stage-padding')
  })

  it('names type by role and weight by name', () => {
    expect(tokenName(TYPE.mega)).toBe('--text-mega')
    expect(tokenName(WEIGHT.bold)).toBe('--weight-bold')
  })

  it('rejects a value that is not a token reference', () => {
    expect(() => tokenName('64px')).toThrow(/not a token reference/)
  })
})
