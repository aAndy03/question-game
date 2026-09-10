import { describe, expect, it } from 'vitest'
import { SecondAccumulator, sourceOf } from './perf'

const measure = (name: string, duration: number): PerformanceEntry =>
  ({ entryType: 'measure', name, duration, startTime: 0, toJSON: () => ({}) }) as PerformanceEntry

describe('SecondAccumulator', () => {
  it('tallies React component measures, keeps the top five, and resets on take', () => {
    const acc = new SecondAccumulator()
    acc.swept([measure('\u200bDecorField', 3), measure('\u200bDecorField', 3), measure('\u200bQuestionStem', 1), measure('plain', 40)])
    acc.longTask(80, 'tick @ /stage/x.js')
    const s = acc.take()
    expect(s.userTimingSwept).toBe(4)
    expect(s.longTaskMaxMs).toBe(80)
    expect(s.top.components[0]).toEqual(['DecorField', { n: 2, ms: 6 }])
    expect(s.top.components).toHaveLength(2)
    expect(acc.take().top.components).toEqual([])
  })
})

describe('sourceOf', () => {
  it('names a long animation frame by its first script', () => {
    const laf = { entryType: 'long-animation-frame', scripts: [{ sourceURL: 'http://localhost:5180/stage/src/decor/world.ts', sourceFunctionName: 'tick' }] } as unknown as PerformanceEntry
    expect(sourceOf(laf)).toBe('tick @ /stage/src/decor/world.ts')
    expect(sourceOf({ entryType: 'longtask' } as PerformanceEntry)).toBe('task')
  })
})
