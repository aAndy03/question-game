import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { DifficultyChip, difficultyLabel } from './DifficultyChip'

/** P20: one difficulty pill, the band's word and the number, on every tab. */
describe('DifficultyChip', () => {
  it('says the band and the number, at each band', () => {
    expect([10, 45, 80].map((d) => difficultyLabel(d))).toEqual(['Easy · 10', 'Medium · 45', 'Hard · 80'])
  })

  it('says Not set for no difficulty, or what the place asks for', () => {
    expect(difficultyLabel(null)).toBe('Not set')
    render(<DifficultyChip difficulty={null} unset="Difficulty · Not set" />)
    expect(screen.getByText('Difficulty · Not set')).toBeTruthy()
  })
})
