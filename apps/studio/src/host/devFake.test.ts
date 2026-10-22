import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { installDevFakeIfAsked } from './devFake'
import { setHostTransport } from './host'
import type { StatsDimension, StatsMetric, StatsResult } from './types'

/** Every column Live and All data ask for (P20), in the order neither of them uses. */
const METRICS: readonly StatsMetric[] = ['turns', 'points', 'correct', 'partial', 'incorrect', 'accuracy', 'avg_points', 'avg_lock_ms', 'fastest_lock_ms', 'plays']

const DIMENSIONS: readonly StatsDimension[] = ['team', 'domain', 'difficulty', 'day']

/**
 * `?fake` is how the Statistics tab is worked on in a browser (§13.1), so its
 * canned answers have to read like the host's: a table per dimension, with
 * the host's row order, and numbers that agree with each other.
 */
describe('the ?fake demo', () => {
  const before = window.location.href
  beforeEach(() => window.history.replaceState(null, '', '/studio/?fake'))
  afterEach(() => {
    setHostTransport(null)
    window.history.replaceState(null, '', before)
  })

  it('the ?fake demo answers every dimension the tab asks for, consistently (T10-F2)', async () => {
    const fake = installDevFakeIfAsked()
    if (!fake) throw new Error('?fake did not install the fake host')

    const answers = new Map<StatsDimension, StatsResult>()
    for (const groupBy of DIMENSIONS) {
      const answer = await fake.invoke<StatsResult>('stats_query', { query: { groupBy, metrics: METRICS } })
      answers.set(groupBy, answer)
      expect(answer.groupBy).toBe(groupBy)
      expect(answer.metrics).toEqual(METRICS)
      expect(answer.rows.length, `${groupBy} has no rows`).toBeGreaterThan(0)
      // A live row is never blank: the host labels every one.
      for (const row of answer.rows) expect(row.label, `${groupBy} ${row.key}`).not.toBe('')
      // The rows add up to the totals.
      const sum = answer.rows.reduce((n, row) => n + (row.values[0] ?? 0), 0)
      expect(sum, `${groupBy}: the first column over the rows`).toBe(answer.totals.values[0])
      // The demo carries every column the tab asks for.
      for (const [i, metric] of METRICS.entries()) expect(answer.totals.values[i], `${groupBy} totals ${metric}`).toEqual(expect.any(Number))
    }

    // The host's order: difficulty bands ascend as numbers, days as dates.
    const bands = answers.get('difficulty')?.rows.map((r) => r.key) ?? []
    for (const key of bands) expect(key).toMatch(/^\d+$/)
    expect(bands.map(Number)).toEqual(bands.map(Number).toSorted((a, b) => a - b))
    const days = answers.get('day')?.rows.map((r) => r.key) ?? []
    for (const key of days) expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(days).toEqual(days.toSorted())

    // One season, however it is cut: every dimension has the same totals.
    const totals = [...answers.values()].map((a) => [a.totals.values, a.playCount, a.turnCount])
    for (const other of totals) expect(other).toEqual(totals[0])
  })
})
