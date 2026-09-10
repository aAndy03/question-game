import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMemoryLine, startUserTimingSweep, sweepUserTiming, type UserTimingBuffer } from './diagnostics'

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
  it('empties the user-timing buffer and reports how many entries it held', () => {
    const perf = fakeBuffer()
    perf.measure('m1')
    perf.measure('m2')
    expect(sweepUserTiming(perf)).toBe(2)
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
    const stop = startUserTimingSweep(perf, 1000, (n) => swept.push(n))
    perf.measure('render')
    vi.advanceTimersByTime(1000)
    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(swept).toEqual([1])
    stop()
    perf.measure('render')
    vi.advanceTimersByTime(3000)
    expect(perf.getEntriesByType('measure')).toHaveLength(1)
  })
})

describe('formatMemoryLine', () => {
  it('carries the rates since the previous sample', () => {
    const prev = { atMs: 0, heapMb: 20, heapTotalMb: 30, domEls: 100, userTimingSwept: 0 }
    const next = { atMs: 30_000, heapMb: 25, heapTotalMb: 30, domEls: 100, userTimingSwept: 300 }
    const line = formatMemoryLine(next, prev)
    expect(line).toContain('heapMb=25')
    expect(line).toContain('heapMbPerMin=+10.0')
    expect(line).toContain('userTimingPerMin=600')
    expect(formatMemoryLine(next, null)).not.toContain('PerMin')
  })
})
