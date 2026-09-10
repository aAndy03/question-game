import { describe, expect, it } from 'vitest'
import { SecondAccumulator, sourceOf } from './perf'

const measure = (name: string, duration: number): PerformanceEntry =>
  ({ entryType: 'measure', name, duration, startTime: 0, toJSON: () => ({}) }) as PerformanceEntry

describe('SecondAccumulator', () => {
  it('tallies React component measures by self time, keeps the top five, and resets on take', () => {
    const acc = new SecondAccumulator()
    acc.commit()
    acc.commit()
    acc.sweptCount(9)
    acc.sweptEntries([
      measure('\u200bViewer', 4),
      measure('\u200bViewer', 6),
      measure('\u200bRingRow', 1),
      measure('\u200bA', 0.1),
      measure('\u200bB', 0.2),
      measure('\u200bC', 0.3),
      measure('\u200bD', 0.4),
      // Not React's: a plain measure, and a mark.
      measure('other', 50),
      { entryType: 'mark', name: '\u200bViewer', duration: 0 } as PerformanceEntry,
    ])
    acc.longTask(120, 'script @ /studio/x.js')
    acc.longTask(60, 'task')

    const s = acc.take()
    expect(s.commits).toBe(2)
    expect(s.userTimingSwept).toBe(9)
    expect(s.longTasks).toBe(2)
    expect(s.longTaskMaxMs).toBe(120)
    expect(s.top.components).toHaveLength(5)
    expect(s.top.components[0]).toEqual(['Viewer', { n: 2, ms: 10 }])
    expect(s.top.components[1]).toEqual(['RingRow', { n: 1, ms: 1 }])
    expect(s.top.components.map(([n]) => n)).not.toContain('A')
    expect(s.top.longTasks[0]).toEqual({ ms: 120, source: 'script @ /studio/x.js' })

    const empty = acc.take()
    expect(empty.commits).toBe(0)
    expect(empty.userTimingSwept).toBe(0)
    expect(empty.longTaskMaxMs).toBe(0)
    expect(empty.top.components).toEqual([])
  })
})

describe('sourceOf', () => {
  it('names a long animation frame by its first script and a long task by its container', () => {
    const laf = {
      entryType: 'long-animation-frame',
      scripts: [{ sourceURL: 'http://localhost:5181/studio/src/organisms/Viewer.tsx?t=1', sourceFunctionName: 'onMessage' }],
    } as unknown as PerformanceEntry
    expect(sourceOf(laf)).toBe('onMessage @ /studio/src/organisms/Viewer.tsx')
    const lt = { entryType: 'longtask', attribution: [{ containerType: 'iframe', containerName: 'Viewer' }] } as unknown as PerformanceEntry
    expect(sourceOf(lt)).toBe('iframe:Viewer')
    expect(sourceOf({ entryType: 'longtask' } as PerformanceEntry)).toBe('task')
  })
})
