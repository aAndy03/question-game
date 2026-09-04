import { describe, expect, it } from 'vitest'
import { TEXT_VARIANTS, variantTokens } from './index'

describe('Text module', () => {
  it('resolves every variant to a token pair, never a raw size', () => {
    for (const v of TEXT_VARIANTS) {
      const { size, family } = variantTokens(v)
      expect(size).toMatch(/^var\(--/)
      expect(family).toMatch(/^var\(--/)
    }
  })

  it('separates the Stage and Studio type scales', () => {
    expect(TEXT_VARIANTS.filter((v) => v.startsWith('stage-')).length).toBeGreaterThan(0)
    expect(TEXT_VARIANTS.filter((v) => v.startsWith('studio-')).length).toBeGreaterThan(0)
  })
})
