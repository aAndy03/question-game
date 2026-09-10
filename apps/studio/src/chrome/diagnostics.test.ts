import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startUserTimingSweep, sweepUserTiming, type UserTimingBuffer } from './diagnostics'

/**
 * jsdom's `performance` has no user-timing buffer, so this is the one the
 * browser has, at its simplest: entries stay until something clears them.
 */
function fakeBuffer(): UserTimingBuffer & { measure(name: string): void; mark(name: string): void } {
  const entries: { entryType: string; name: string }[] = []
  return {
    measure: (name) => void entries.push({ entryType: 'measure', name }),
    mark: (name) => void entries.push({ entryType: 'mark', name }),
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
    perf.mark('a')
    perf.measure('m1')
    perf.measure('m2')
    perf.measure('m3')
    const seen: string[] = []

    expect(sweepUserTiming(perf, (entries) => seen.push(...entries.map((e) => e.name)))).toBe(4)

    expect(seen.sort()).toEqual(['a', 'm1', 'm2', 'm3'])
    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(perf.getEntriesByType('mark')).toHaveLength(0)
  })

  it('reports zero on an empty buffer and does not call the inspector', () => {
    const inspect = vi.fn()
    expect(sweepUserTiming(fakeBuffer(), inspect)).toBe(0)
    expect(inspect).not.toHaveBeenCalled()
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
    perf.measure('render')
    vi.advanceTimersByTime(1000)
    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(swept).toEqual([2])

    stop()
    perf.measure('render')
    vi.advanceTimersByTime(5000)
    expect(perf.getEntriesByType('measure')).toHaveLength(1)
    expect(swept).toEqual([2])
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
