import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { formatMemoryLine, startUserTimingSweep, sweepUserTiming, type MemorySample, type UserTimingBuffer } from './diagnostics'

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
  it('empties the user-timing buffer and reports how many entries it held', () => {
    const perf = fakeBuffer()
    perf.mark('a')
    perf.measure('m1')
    perf.measure('m2')
    perf.measure('m3')
    expect(perf.getEntriesByType('measure')).toHaveLength(3)

    expect(sweepUserTiming(perf)).toBe(4)

    expect(perf.getEntriesByType('measure')).toHaveLength(0)
    expect(perf.getEntriesByType('mark')).toHaveLength(0)
  })

  it('reports zero on an empty buffer', () => {
    expect(sweepUserTiming(fakeBuffer())).toBe(0)
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
})

describe('formatMemoryLine', () => {
  const at = (atMs: number, heapMb: number, swept: number, commits: number): MemorySample => ({
    atMs,
    heapMb,
    heapTotalMb: heapMb + 10,
    domEls: 500,
    userTimingSwept: swept,
    commits,
  })

  it('carries the absolute numbers and the rates since the previous sample', () => {
    const line = formatMemoryLine(at(60_000, 40, 6000, 600), at(0, 30, 0, 0))
    expect(line).toContain('heapMb=40')
    expect(line).toContain('heapDeltaMb=+10.0')
    expect(line).toContain('heapMbPerMin=+10.0')
    expect(line).toContain('domEls=500')
    expect(line).toContain('userTimingPerMin=6000')
    expect(line).toContain('commitsPerMin=600')
  })

  it('has no rates on the first sample', () => {
    const line = formatMemoryLine(at(0, 30, 0, 0), null)
    expect(line).toContain('heapMb=30')
    expect(line).not.toContain('PerMin')
  })
})
