import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { StatsResult } from '@/host/types'
import { StatsCards } from './StatsCards'

/** P20 (Task 10): the card view of a long answer is capped like the table. */

function result(n: number): StatsResult {
  return {
    groupBy: 'team',
    metrics: ['turns', 'correct'],
    rows: Array.from({ length: n }, (_, i) => ({ key: `team-${i}`, label: `Team ${i}`, values: [n - i, i], turns: n - i, plays: 1 })),
    totals: { key: '', label: '', values: [n, 0], turns: n, plays: 1 },
    playCount: 1,
    turnCount: n,
  }
}

describe('StatsCards', () => {
  it('T10-C5 cards cap at 50 with “Show all N” too', () => {
    const { unmount } = render(<StatsCards result={result(120)} />)
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(50)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 120' }))
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(120)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    unmount()

    render(<StatsCards result={result(12)} />)
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(12)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('T10-C5b “Show all” belongs to the answer it was pressed on: a different answer starts capped again', () => {
    const { rerender } = render(<StatsCards result={result(120)} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 120' }))
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(120)

    // The same answer as a new object stays shown in full.
    rerender(<StatsCards result={result(120)} />)
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(120)

    // Another filter: the same 120 teams, other numbers.
    const same = result(120)
    const other: StatsResult = { ...same, rows: same.rows.map((row, i) => ({ ...row, values: [i, i] })) }
    rerender(<StatsCards result={other} />)
    expect(document.querySelectorAll('[data-stats-row]')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Show all 120' })).toBeTruthy()
  })
})
