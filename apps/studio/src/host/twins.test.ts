import { describe, expect, it } from 'vitest'
import { isTwin } from './twins'

describe('isTwin (beta.3)', () => {
  it('folds case and spaces, and an empty name is no twin', () => {
    expect(isTwin('  history ', [{ name: 'History' }])).toBe(true)
    expect(isTwin('Club  2026', [{ name: 'club 2026' }])).toBe(true)
    expect(isTwin('Science', [{ name: 'History' }])).toBe(false)
    expect(isTwin('  ', [{ name: '' }])).toBe(false)
  })
})
