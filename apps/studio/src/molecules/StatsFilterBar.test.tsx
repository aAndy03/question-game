import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { STATS } from '@/copy/stats'
import type { StatsFilter, StatsMetric } from '@/host/types'
import { StatsFilterBar, type StatsFilterBarProps } from './StatsFilterBar'

/**
 * P20 (Task 10): the bar is one row of what is asked most; what is asked
 * least waits behind *More options* — and says so when it is set.
 */

const ALL: readonly StatsMetric[] = ['turns', 'correct', 'incorrect', 'accuracy', 'points']
const DEFAULT: readonly StatsMetric[] = ['turns', 'correct', 'accuracy', 'points']

function bar(over: Partial<StatsFilterBarProps> = {}) {
  const props: StatsFilterBarProps = {
    filter: {} as StatsFilter,
    onFilter: vi.fn(),
    time: 'all',
    onTime: vi.fn(),
    groupBy: 'team',
    onGroupBy: vi.fn(),
    metrics: DEFAULT,
    onMetrics: vi.fn(),
    games: [],
    teams: [],
    domains: [],
    allMetrics: ALL,
    defaultMetrics: DEFAULT,
    onClear: vi.fn(),
    isDirty: false,
    ...over,
  }
  return render(<StatsFilterBar {...props} />)
}

describe('StatsFilterBar', () => {
  it('T10-C6 the bar is one compact row; Columns, Include rehearsals and All workspaces are under More options', () => {
    bar()
    for (const label of [STATS.filters.time, STATS.filters.game, STATS.filters.team, STATS.filters.domain, STATS.filters.verdict, STATS.filters.groupBy]) {
      expect(screen.getByRole('button', { name: new RegExp(`${label}$`) })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: STATS.filters.clear })).toBeTruthy()
    expect(screen.queryByRole('checkbox', { name: STATS.filters.rehearsals })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: STATS.filters.allWorkspaces })).toBeNull()
    expect(screen.queryByRole('checkbox', { name: STATS.metrics['points'] ?? 'Points' })).toBeNull()
    const more = screen.getByRole('button', { name: STATS.filters.moreOptions })
    expect(more.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(more)
    expect(more.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByRole('checkbox', { name: STATS.filters.rehearsals })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: STATS.filters.allWorkspaces })).toBeTruthy()
    for (const metric of ALL) {
      expect(screen.getByRole('checkbox', { name: STATS.metrics[metric] ?? metric })).toBeTruthy()
    }
    expect(screen.getByRole('button', { name: STATS.filters.clear })).toBeTruthy()
  })

  it('T10-C7 a closed More options says when something inside it is set', () => {
    const { unmount } = bar()
    const plain = screen.getByRole('button', { name: STATS.filters.moreOptions })
    expect(plain.getAttribute('aria-expanded')).toBe('false')
    expect(plain.textContent).not.toMatch(/\d/)
    unmount()

    bar({ filter: { includeRehearsal: true } })
    const set = screen.getByRole('button', { name: STATS.filters.moreOptionsSet(1) })
    expect(set.getAttribute('aria-expanded')).toBe('false')
  })

  it('counts each thing set inside More options once', () => {
    bar({ filter: { includeRehearsal: true, allWorkspaces: true }, metrics: ['turns', 'points'] })
    expect(screen.getByRole('button', { name: STATS.filters.moreOptionsSet(3) })).toBeTruthy()
  })
})
