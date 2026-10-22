import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { STATS } from '@/copy/stats'
import type { StatsResult, StatsRow } from '@/host/types'
import { StatsTable } from './StatsTable'

/** P20 (Task 10): a long answer shows 50 rows first; a column can be a picture. */

function rows(n: number): StatsRow[] {
  return Array.from({ length: n }, (_, i) => ({ key: `team-${i}`, label: `Team ${i}`, values: [n - i, i], turns: n - i, plays: 1 }))
}

function result(r: StatsRow[]): StatsResult {
  const turns = r.reduce((sum, row) => sum + row.turns, 0)
  return {
    groupBy: 'team',
    metrics: ['turns', 'correct'],
    rows: r,
    totals: { key: '', label: '', values: [turns, 0], turns, plays: 1 },
    playCount: 1,
    turnCount: turns,
  }
}

function body(): HTMLElement {
  const table = screen.getByRole('table', { name: STATS.table.label })
  const tbody = table.querySelector('tbody')
  if (!tbody) throw new Error('no tbody')
  return tbody
}

describe('StatsTable', () => {
  it('T10-C3 the table shows 50 rows, then “Show all N”; the totals row stays', () => {
    const { unmount } = render(<StatsTable result={result(rows(120))} />)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(50)
    expect(document.querySelector('[data-stats-row="__totals"]')).not.toBeNull()
    const showAll = screen.getByRole('button', { name: 'Show all 120' })
    expect(showAll.textContent).toContain(STATS.table.showAll(120))

    fireEvent.click(showAll)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(120)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
    expect(document.querySelector('[data-stats-row="__totals"]')).not.toBeNull()
    unmount()

    render(<StatsTable result={result(rows(50))} />)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(50)
    expect(screen.queryByRole('button', { name: /Show all/ })).toBeNull()
  })

  it('T10-C3b “Show all” belongs to the answer it was pressed on: a different answer starts capped again', () => {
    // All data keeps one table mounted while the query changes underneath it.
    const first = result(rows(120))
    const { rerender } = render(<StatsTable result={first} />)
    fireEvent.click(screen.getByRole('button', { name: 'Show all 120' }))
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(120)

    // The same answer as a new object — what a parent re-render hands down — stays shown in full.
    rerender(<StatsTable result={result(rows(120))} />)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(120)

    // Another filter: the same 120 teams, other numbers.
    const other = result(rows(120).map((row, i) => ({ ...row, values: [i, i] })))
    rerender(<StatsTable result={other} />)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Show all 120' })).toBeTruthy()

    // Another dimension altogether.
    fireEvent.click(screen.getByRole('button', { name: 'Show all 120' }))
    rerender(<StatsTable result={{ ...result(rows(120).map((row) => ({ ...row, key: `domain-${row.key}` }))), groupBy: 'domain' }} />)
    expect(body().querySelectorAll('[data-stats-row]')).toHaveLength(50)
    expect(screen.getByRole('button', { name: 'Show all 120' })).toBeTruthy()
  })

  it('T10-C4 with `bars`, the first metric is drawn as a bar in proportion to the largest row; a null draws none', () => {
    const r: StatsRow[] = [
      { key: 'a', label: 'Alpha', values: [8, 1], turns: 8, plays: 1 },
      { key: 'b', label: 'Beta', values: [2, 1], turns: 2, plays: 1 },
      { key: 'c', label: 'Charlie', values: [null, 1], turns: 0, plays: 1 },
    ]
    render(<StatsTable result={result(r)} bars />)
    const row = (key: string) => {
      const el = body().querySelector<HTMLElement>(`[data-stats-row="${key}"]`)
      if (!el) throw new Error(key)
      return el
    }
    const bar = (key: string) => row(key).querySelector<HTMLElement>('[data-stats-bar]')
    expect(bar('a')?.style.width).toBe('100%')
    expect(bar('b')?.style.width).toBe('25%')
    expect(bar('c')).toBeNull()
    expect(within(row('c')).getByText(STATS.table.none)).toBeTruthy()
    expect(document.querySelector('[data-stats-row="__totals"] [data-stats-bar]')).toBeNull()
  })

  it('a rank column leads when ranks are given, and a row may carry its colour', () => {
    const r: StatsRow[] = [
      { key: 'a', label: 'Alpha', values: [4, 1], turns: 4, plays: 1 },
      { key: 'b', label: 'Beta', values: [3, 1], turns: 3, plays: 1 },
    ]
    const { rerender } = render(<StatsTable result={result(r)} />)
    expect(screen.queryByRole('columnheader', { name: STATS.live.rank })).toBeNull()

    rerender(<StatsTable result={result(r)} ranks={{ a: 2, b: 1 }} colors={{ a: '#2563eb' }} />)
    const headers = screen.getAllByRole('columnheader')
    expect(headers[0]?.textContent).toBe(STATS.live.rank)
    const alpha = body().querySelector<HTMLElement>('[data-stats-row="a"]')
    if (!alpha) throw new Error('alpha')
    expect(alpha.querySelector('td, th')?.textContent).toBe('2')
    expect(alpha.innerHTML).toContain('rgb(37, 99, 235)')
    const beta = body().querySelector<HTMLElement>('[data-stats-row="b"]')
    expect(beta?.querySelector('td, th')?.textContent).toBe('1')
    // A row with no colour draws no swatch.
    expect(beta?.querySelector('[style*="background"]')).toBeNull()
  })
})
