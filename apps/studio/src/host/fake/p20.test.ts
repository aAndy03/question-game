import { describe, expect, it } from 'vitest'
import { createFakeHost, type FakeHost } from '../fake'
import { FAKE_LEDGER } from './preview'
import type { StatsQuery, StatsResult } from '../types'

const ask = (fake: FakeHost, query: StatsQuery) => fake.invoke<StatsResult>('stats_query', { query })

const TEAMS: StatsResult = {
  groupBy: 'team',
  metrics: ['turns', 'correct', 'accuracy', 'points'],
  rows: [
    { key: 'team-alpha', label: 'Alpha', values: [4, 3, 0.75, 90], turns: 4, plays: 1 },
    { key: 'team-beta', label: 'Beta', values: [3, 1, null, 20], turns: 3, plays: 1 },
  ],
  totals: { key: '', label: '', values: [7, 4, 0.571, 110], turns: 7, plays: 1 },
  playCount: 1,
  turnCount: 7,
}

const DOMAINS: StatsResult = {
  groupBy: 'domain',
  metrics: ['turns', 'correct', 'partial', 'incorrect'],
  rows: [
    { key: 'dom-geo', label: 'Geography', values: [5, 3, 1, 1], turns: 5, plays: 1 },
    { key: 'dom-his', label: 'History', values: [2, 1, 0, 1], turns: 2, plays: 1 },
  ],
  totals: { key: '', label: '', values: [7, 4, 1, 2], turns: 7, plays: 1 },
  playCount: 1,
  turnCount: 7,
}

/**
 * P20 (Task 10): Statistics asks several dimensions at once — Live alone asks
 * team, domain and difficulty — so one canned answer relabelled for all of
 * them is a table of teams under a Domain heading. The host answers each
 * dimension and each metric by name (`crates/host/src/stats.rs`); so does this.
 */
describe('the fake answers stats_query as the host does (P20)', () => {
  it('the fake answers a canned result per dimension when one is set, and the single canned result otherwise (T10-F1)', async () => {
    const fake = createFakeHost()
    fake.stats = TEAMS
    fake.statsBy = { domain: DOMAINS }

    const domains = await ask(fake, { groupBy: 'domain', metrics: DOMAINS.metrics })
    expect(domains.groupBy).toBe('domain')
    expect(domains.rows.map((r) => r.label)).toEqual(['Geography', 'History'])
    expect(domains.totals.values).toEqual([7, 4, 1, 2])

    // A dimension with no answer of its own still gets the one canned answer.
    const days = await ask(fake, { groupBy: 'day', metrics: TEAMS.metrics })
    expect(days.groupBy).toBe('day')
    expect(days.rows.map((r) => r.key)).toEqual(['team-alpha', 'team-beta'])

    // The ledger is opt-in, whichever answer the dimension reads.
    expect((await ask(fake, { groupBy: 'domain', metrics: DOMAINS.metrics })).turns).toEqual([])
    expect((await ask(fake, { groupBy: 'domain', metrics: DOMAINS.metrics, detail: 2 })).turns).toEqual(FAKE_LEDGER.slice(0, 2))
    expect((await ask(fake, { groupBy: 'team', metrics: TEAMS.metrics })).turns).toEqual([])
    expect((await ask(fake, { groupBy: 'team', metrics: TEAMS.metrics, detail: 50 })).turns).toEqual(FAKE_LEDGER)
  })

  it('the fake reads a canned result by metric name, so another column order never mislabels a value', async () => {
    const fake = createFakeHost()
    fake.stats = TEAMS

    // Points first, then turns, then a column the canned answer does not carry.
    const answer = await ask(fake, { groupBy: 'team', metrics: ['points', 'turns', 'fastest_lock_ms'] })
    expect(answer.metrics).toEqual(['points', 'turns', 'fastest_lock_ms'])
    expect(answer.rows.map((r) => r.values)).toEqual([
      [90, 4, null],
      [20, 3, null],
    ])
    expect(answer.totals.values).toEqual([110, 7, null])
    // A null stays a null: nothing to average is not a zero.
    expect((await ask(fake, { groupBy: 'team', metrics: ['accuracy'] })).rows.map((r) => r.values)).toEqual([[0.75], [null]])

    // No columns asked for: the canned answer's own, as before.
    const whole = await ask(fake, { groupBy: 'team' })
    expect(whole.metrics).toEqual(TEAMS.metrics)
    expect(whole.rows[0]?.values).toEqual([4, 3, 0.75, 90])
  })

  it('the fake starts with no per-dimension answers and the empty result', async () => {
    const fake = createFakeHost()
    expect(fake.statsBy).toEqual({})
    const answer = await ask(fake, { groupBy: 'domain', metrics: ['turns'] })
    expect(answer.rows).toEqual([])
    expect(answer.totals.values).toEqual([0])
  })
})
