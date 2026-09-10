import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startUserTimingSweep, sweepUserTiming, type UserTimingBuffer } from './diagnostics'

/** jsdom's `performance` has no user-timing buffer; this is the browser's, at its simplest. */
function fakeBuffer(): UserTimingBuffer & { measure(name: string): void } {
  const entries: { entryType: string; name: string }[] = []
  return {
    measure: (name) => void entries.push({ entryType: 'measure', name }),
    getEntriesByType: (type) => entries.filter((e) => e.entryType === type) as unknown as PerformanceEntryList,
    clearMeasures: () => {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i]?.entryType === 'measure') entries.splice(i, 1)
    },
    clearMarks: () => {
      for (let i = entries.length - 1; i >= 0; i--) if (entries[i]?.entryType === 'mark') entries.splice(i, 1)
    },
  }
}

describe('sweepUserTiming', () => {
  it('shows the entries to the inspector, then empties the buffer', () => {
    const perf = fakeBuffer()
    perf.measure('m1')
    perf.measure('m2')
    const seen: string[] = []
    expect(sweepUserTiming(perf, (entries) => seen.push(...entries.map((e) => e.name)))).toBe(2)
    expect(seen).toEqual(['m1', 'm2'])
    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(sweepUserTiming(perf)).toBe(0)
  })
})

describe('startUserTimingSweep', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps the buffer bounded on an interval and stops when asked', () => {
    const perf = fakeBuffer()
    const swept: number[] = []
    const stop = startUserTimingSweep(perf, 1000, { count: (held) => swept.push(held) })
    perf.measure('render')
    vi.advanceTimersByTime(1000)
    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(swept).toEqual([1])
    stop()
    perf.measure('render')
    vi.advanceTimersByTime(3000)
    expect(perf.getEntriesByType('measure')).toHaveLength(1)
  })

  it('counts every sweep but folds only one in `inspectEvery`', () => {
    const perf = fakeBuffer()
    const counted: number[] = []
    const folded: number[] = []
    const stop = startUserTimingSweep(perf, 1000, {
      count: (held) => counted.push(held),
      inspect: (entries) => folded.push(entries.length),
      inspectEvery: 3,
    })
    for (let sweep = 0; sweep < 3; sweep += 1) {
      perf.measure('render')
      vi.advanceTimersByTime(1000)
    }
    stop()
    // Three sweeps, three counts — the leak signal is never sampled.
    expect(counted).toEqual([1, 1, 1])
    // One fold, and it saw the measures array plus the (empty) marks array.
    expect(folded).toEqual([1, 0])
  })

})
