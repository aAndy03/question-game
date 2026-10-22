import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SERIES_TOKENS, StatsChart } from './StatsChart'
import source from './StatsChart.tsx?raw'
import { STATS } from '@/copy/stats'
import { FAKE_LEDGER } from '@/host/fake/preview'
import type { StatsDimension, StatsMetric, StatsResult, StatsRow, TurnAward } from '@/host/types'

/**
 * P20: Statistics is a picture first. ECharts draws on a canvas jsdom cannot
 * paint, so the library is replaced by spies and every assertion is on the
 * option object the molecule hands it — the chart's whole contract.
 */
const { init, setOption, dispose } = vi.hoisted(() => {
  const setOption = vi.fn()
  const dispose = vi.fn()
  const init = vi.fn(() => ({ setOption, resize: vi.fn(), dispose }))
  return { init, setOption, dispose }
})
vi.mock('echarts', () => ({ init }))

/** jsdom lays nothing out; a width is what tells the chart it may draw. */
const setWidth = (px: number) =>
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => px })

beforeEach(() => {
  vi.clearAllMocks()
  setWidth(640)
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  )
})
afterEach(() => {
  delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
  vi.unstubAllGlobals()
})

type Datum = number | null | { value: number | null; itemStyle?: { color?: string } }
interface Series {
  name?: string
  type: string
  stack?: string
  data: Datum[]
  lineStyle?: { color?: string }
}
interface Axis {
  type: string
  data?: string[]
  axisLabel?: { color?: string; formatter?: (value: number) => string }
}
interface Option {
  animation: boolean
  color?: string[]
  series: Series[]
  xAxis: Axis
  yAxis: Axis
  tooltip: { valueFormatter: (value: unknown) => string }
}

/** The last option the chart was given. */
const option = () => setOption.mock.calls.at(-1)?.[0] as Option
/** A series' numbers, whether a datum carries its own colour or not. */
const values = (series: Series | undefined) =>
  (series?.data ?? []).map((d) => (d !== null && typeof d === 'object' ? d.value : d))
/** The labels along whichever axis is the categorical one. */
const categories = (o: Option) => [o.xAxis, o.yAxis].find((axis) => axis.type === 'category')?.data
/** Whichever axis carries the numbers. */
const valueAxisOf = (o: Option) => [o.xAxis, o.yAxis].find((axis) => axis.type === 'value')

const row = (key: string, label: string, vals: (number | null)[]): StatsRow => ({
  key,
  label,
  values: vals,
  turns: 1,
  plays: 1,
})

function answer(
  groupBy: StatsDimension,
  metrics: StatsMetric[],
  rows: StatsRow[],
  turnCount = rows.length,
): StatsResult {
  return {
    groupBy,
    metrics,
    rows,
    totals: row('__totals', STATS.table.total, metrics.map(() => null)),
    playCount: 1,
    turnCount,
  }
}

const POINTS = [7, 42, 3, 15, 99, 23, 8, 61, 4, 30, 12, 77, 5, 50, 18]
const teamsOf = (n: number) =>
  answer(
    'team',
    ['points'],
    POINTS.slice(0, n).map((v, i) => row(`team-${i + 1}`, `Team ${i + 1}`, [v])),
  )

const chart = () => screen.getByRole('img', { name: STATS.chart.label })

describe('StatsChart (P20)', () => {
  it('T10-K1: ranking draws a bar per row, largest first, at most 12, and says the rest are in the table', () => {
    const { unmount } = render(<StatsChart result={teamsOf(15)} kind="ranking" />)
    expect(chart().getAttribute('data-stats-kind')).toBe('ranking')
    const o = option()
    expect(o.yAxis.type).toBe('category')
    expect(o.series[0]?.type).toBe('bar')
    expect(o.series[0]?.data.length).toBe(12)
    expect(values(o.series[0])).toEqual([99, 77, 61, 50, 42, 30, 23, 18, 15, 12, 8, 7])
    expect(screen.getByText(STATS.chart.topOf(12, 15))).toBeTruthy()
    unmount()

    render(<StatsChart result={teamsOf(8)} kind="ranking" />)
    expect(values(option().series[0])).toEqual([99, 61, 42, 23, 15, 8, 7, 3])
    expect(screen.queryByText(/every row is in the table/)).toBeNull()
  })

  it('T10-K2: verdicts stacks correct, partial and wrong per category', () => {
    // The columns out of order: the chart finds each verdict by name.
    const result = answer(
      'domain',
      ['turns', 'incorrect', 'correct', 'partial'],
      [row('dom-h', 'History', [5, 1, 3, 1]), row('dom-s', 'Science', [4, 2, 2, 0]), row('dom-a', 'Art', [3, 0, 3, 0])],
    )
    render(<StatsChart result={result} kind="verdicts" />)
    expect(chart().getAttribute('data-stats-kind')).toBe('verdicts')
    const o = option()
    const { correct, partial, incorrect } = STATS.verdicts
    expect(o.series.map((s) => s.name)).toEqual([correct, partial, incorrect])
    expect(o.series.map((s) => s.name)).toEqual(['Correct', 'Partial', 'Wrong'])
    const stacks = new Set(o.series.map((s) => s.stack))
    expect(stacks.size).toBe(1)
    expect([...stacks][0]).toBeTruthy()
    expect(categories(o)).toEqual(['History', 'Science', 'Art'])
    expect(o.series.map(values)).toEqual([
      [3, 2, 3],
      [1, 0, 0],
      [1, 2, 0],
    ])
  })

  it('T10-K11: a verdict the answer does not carry is no series at all, never a zero', () => {
    // Correct and Wrong asked for, Partial not: the host never counted it, so
    // the stack must not say 0 for it — not in a bar, a legend or a tooltip.
    const result = answer(
      'team',
      ['turns', 'correct', 'incorrect'],
      [row('team-a', 'Alpha', [4, 3, 1]), row('team-b', 'Beta', [3, 1, 2])],
    )
    const { unmount } = render(<StatsChart result={result} kind="verdicts" />)
    const o = option()
    expect(o.series.map((s) => s.name)).toEqual(['Correct', 'Wrong'])
    expect(o.series.map(values)).toEqual([
      [3, 1],
      [1, 2],
    ])
    expect(JSON.stringify(o)).not.toContain('Partial')
    unmount()

    // One verdict alone is still a stack of one, not a crash.
    const asked = answer('domain', ['turns', 'correct'], [row('dom-h', 'History', [5, 3])])
    render(<StatsChart result={asked} kind="verdicts" />)
    expect(option().series.map((s) => s.name)).toEqual(['Correct'])
    expect(option().series.map(values)).toEqual([[3]])
  })

  it('T10-K12: a verdicts stack with nothing in it is nothing to chart', () => {
    // Verdict = Partial while the answer carries only Correct and Wrong: every
    // bar would be empty, next to team names, with no note to say why.
    const result = answer(
      'team',
      ['correct', 'incorrect'],
      [row('team-a', 'Alpha', [0, 0]), row('team-b', 'Beta', [0, null])],
    )
    const { unmount } = render(<StatsChart result={result} kind="verdicts" />)
    expect(init).not.toHaveBeenCalled()
    expect(screen.getByText(STATS.chart.none)).toBeTruthy()
    unmount()

    // No verdict column at all: nothing either.
    render(<StatsChart result={answer('team', ['points'], [row('team-a', 'Alpha', [20])])} kind="verdicts" />)
    expect(init).not.toHaveBeenCalled()
    expect(screen.getByText(STATS.chart.none)).toBeTruthy()
  })

  it('T10-K3: timeline is a line over the days as given, not re-sorted by value', () => {
    const result = answer('day', ['turns'], [
      row('2025-09-04', '2025-09-04', [5]),
      row('2025-09-05', '2025-09-05', [9]),
      row('2025-09-06', '2025-09-06', [2]),
      // A day with nothing to average keeps its place on the axis, as a gap.
      row('2025-09-07', '2025-09-07', [null]),
    ])
    render(<StatsChart result={result} kind="timeline" />)
    expect(chart().getAttribute('data-stats-kind')).toBe('timeline')
    const o = option()
    expect(o.series[0]?.type).toBe('line')
    expect(o.xAxis.data).toEqual(['2025-09-04', '2025-09-05', '2025-09-06', '2025-09-07'])
    expect(values(o.series[0])).toEqual([5, 9, 2, null])
  })

  it('T10-K4: bands keeps the band order', () => {
    const result = answer('difficulty', ['turns'], [
      row('10', '1–10', [4]),
      row('20', '11–20', [9]),
      row('30', '21–30', [1]),
      row('40', '31–40', [null]),
      row('100', '91–100', [6]),
    ])
    render(<StatsChart result={result} kind="bands" />)
    expect(chart().getAttribute('data-stats-kind')).toBe('bands')
    const o = option()
    expect(categories(o)).toEqual(['1–10', '11–20', '21–30', '31–40', '91–100'])
    expect(o.series[0]?.type).toBe('bar')
    expect(values(o.series[0])).toEqual([4, 9, 1, null, 6])
  })

  describe('T10-K5: race is one line per team, each ending at its team’s total', () => {
    const turn = (teamId: string, points: number, bonus: number, atMs: number): TurnAward => ({
      ...FAKE_LEDGER[0]!,
      teamId,
      points,
      bonus,
      atMs,
    })
    // Newest first, as the host sends the ledger.
    const ledger = [
      turn('team-b', 60, 10, 4_000),
      turn('team-a', 0, 0, 3_000),
      turn('team-b', 15, 0, 2_000),
      turn('team-a', 20, 0, 1_000),
    ]
    const teams = [
      { id: 'team-a', name: 'Alpha' },
      { id: 'team-b', name: 'Beta' },
      { id: 'team-c', name: 'Charlie' },
    ]
    const result = (turnCount: number) => answer('team', ['points'], [row('team-b', 'Beta', [85])], turnCount)

    it('a ledger of the whole Play starts every line at 0', () => {
      render(
        <StatsChart
          result={result(4)}
          kind="race"
          turns={ledger}
          totals={{ 'team-a': 20, 'team-b': 85, 'team-c': 0 }}
          teams={teams}
        />,
      )
      expect(chart().getAttribute('data-stats-kind')).toBe('race')
      const o = option()
      expect(o.series.map((s) => s.name)).toEqual(['Alpha', 'Beta', 'Charlie'])
      expect(o.series.every((s) => s.type === 'line')).toBe(true)
      expect(o.series.map(values)).toEqual([
        [0, 20, 20, 20, 20],
        [0, 0, 15, 15, 85],
        [0, 0, 0, 0, 0],
      ])
      expect(o.xAxis.data).toEqual(['0', '1', '2', '3', '4'])
      expect(screen.queryByText(STATS.chart.lastTurns(4))).toBeNull()
    })

    it('a capped ledger is drawn back from the totals, and says it is the last turns', () => {
      render(
        <StatsChart
          result={result(10)}
          kind="race"
          turns={ledger}
          totals={{ 'team-a': 120, 'team-b': 85, 'team-c': 30 }}
          teams={teams}
        />,
      )
      const o = option()
      expect(o.series.map((s) => values(s).at(-1))).toEqual([120, 85, 30])
      expect(o.series.map((s) => values(s)[0])).toEqual([100, 0, 30])
      expect(o.xAxis.data).toEqual(['6', '7', '8', '9', '10'])
      expect(screen.getByText(STATS.chart.lastTurns(4))).toBeTruthy()
    })

    it('no resolved turn yet: nothing to chart', () => {
      render(<StatsChart result={result(0)} kind="race" turns={[]} totals={{ 'team-a': 0 }} teams={teams} />)
      expect(init).not.toHaveBeenCalled()
      expect(screen.getByText(STATS.chart.none)).toBeTruthy()
    })

    it('T10-K16: a line never goes below 0, even when the ledger outruns the totals', () => {
      // Totals and ledger from different moments: Alpha's turns pay 20 + 30,
      // but the total says 35. Drawn back from 35, the first point would be -15.
      render(
        <StatsChart
          result={result(3)}
          kind="race"
          turns={[turn('team-a', 30, 0, 3_000), turn('team-b', 15, 0, 2_000), turn('team-a', 20, 0, 1_000)]}
          totals={{ 'team-a': 35, 'team-b': 15, 'team-c': 0 }}
          teams={teams}
        />,
      )
      const drawn = option().series.flatMap(values)
      expect(drawn.length).toBeGreaterThan(0)
      expect(drawn.every((v) => typeof v === 'number' && v >= 0)).toBe(true)
      expect(values(option().series[0]).at(-1)).toBe(35)
    })

    it('T10-K20: a capped ledger keeps its note, whether it pays less than the totals or more', () => {
      const lastThree = [turn('team-a', 30, 0, 3_000), turn('team-b', 15, 0, 2_000), turn('team-a', 20, 0, 1_000)]
      // Less: the turns before these paid Alpha the other 30.
      const { unmount } = render(
        <StatsChart
          result={result(10)}
          kind="race"
          turns={lastThree}
          totals={{ 'team-a': 80, 'team-b': 15, 'team-c': 0 }}
          teams={teams}
        />,
      )
      expect(screen.getByText(STATS.chart.lastTurns(3))).toBeTruthy()
      unmount()

      // More: Alpha's turns pay 50 against a total of 35 — the two read at
      // different moments. Walked back, Alpha stops at 0 where the others start,
      // so every line starts at 0: that is the clamp, not the whole Play.
      render(
        <StatsChart
          result={result(10)}
          kind="race"
          turns={lastThree}
          totals={{ 'team-a': 35, 'team-b': 15, 'team-c': 0 }}
          teams={teams}
        />,
      )
      expect(option().series.map((s) => values(s)[0])).toEqual([0, 0, 0])
      expect(screen.getByText(STATS.chart.lastTurns(3))).toBeTruthy()
    })

    it('T10-K17: no ECharts default palette — a line without a team colour takes Studio’s', () => {
      render(<StatsChart result={result(4)} kind="race" turns={ledger} totals={{ 'team-a': 20, 'team-b': 85, 'team-c': 0 }} teams={teams} />)
      const o = option()
      expect(Array.isArray(o.color)).toBe(true)
      expect(o.color!.length).toBeGreaterThanOrEqual(5)
      const palette = JSON.stringify(o.color).toLowerCase()
      expect(palette).not.toContain('var(')
      // ECharts' own default palette, which knows nothing of the Studio theme.
      for (const hex of ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc']) {
        expect(palette).not.toContain(hex)
      }
      // Every line is coloured by the chart, each its own, each from that list.
      const lines = o.series.map((s) => s.lineStyle?.color)
      expect(lines.every((c) => typeof c === 'string' && o.color!.includes(c))).toBe(true)
      expect(new Set(lines).size).toBe(3)
    })
  })

  it('T10-K6: bars is the old default', () => {
    const result = answer('team', ['turns', 'points'], [
      row('team-a', 'Alpha', [4, 20]),
      row('team-b', 'Beta', [3, null]),
      row('team-c', 'Charlie', [2, 90]),
    ])
    const { unmount } = render(<StatsChart result={result} metricIndex={1} />)
    expect(chart().getAttribute('data-stats-kind')).toBe('bars')
    expect(chart().getAttribute('data-stats-chart')).toBe('team')
    const o = option()
    expect(o.series[0]?.type).toBe('bar')
    expect(o.xAxis.data).toEqual(['Alpha', 'Charlie'])
    expect(values(o.series[0])).toEqual([20, 90])
    unmount()

    render(<StatsChart result={answer('day', ['turns'], [row('2025-09-04', '2025-09-04', [3])])} />)
    expect(option().series[0]?.type).toBe('line')
  })

  it('T10-K7: a theme colour never reaches ECharts; a literal colour passes through', () => {
    const colors = { 'team-a': 'var(--state-correct)', 'team-b': '#2563eb' }
    const result = answer('team', ['points'], [row('team-a', 'Alpha', [20]), row('team-b', 'Beta', [90])])
    const { unmount } = render(<StatsChart result={result} kind="ranking" colors={colors} />)
    expect(JSON.stringify(option())).not.toContain('var(')
    expect(JSON.stringify(option())).toContain('#2563eb')
    unmount()

    render(
      <StatsChart
        result={result}
        kind="race"
        colors={colors}
        turns={[{ ...FAKE_LEDGER[0]!, teamId: 'team-b', points: 90, bonus: 0, atMs: 1 }]}
        totals={{ 'team-a': 0, 'team-b': 90 }}
        teams={[
          { id: 'team-a', name: 'Alpha' },
          { id: 'team-b', name: 'Beta' },
        ]}
      />,
    )
    expect(JSON.stringify(option())).not.toContain('var(')
    expect(JSON.stringify(option())).toContain('#2563eb')
  })

  it('T10-K8: axis text is muted from --muted, which exists', () => {
    expect(source).not.toContain('--foreground-muted')
    expect(source).toContain("'--muted'")
    render(<StatsChart result={teamsOf(3)} />)
    for (const axis of [option().xAxis, option().yAxis]) {
      expect(typeof axis.axisLabel?.color).toBe('string')
      expect(axis.axisLabel?.color).not.toBe('')
    }
  })

  it('T10-K9: options are memoised: re-rendering with the same props does not call setOption again', () => {
    const result = teamsOf(5)
    const { rerender } = render(<StatsChart result={result} colors={{ 'team-1': '#2563eb' }} />)
    // A page builds its colours inline: an equal record is the same picture.
    rerender(<StatsChart result={result} colors={{ 'team-1': '#2563eb' }} />)
    rerender(<StatsChart result={result} colors={{ 'team-1': '#2563eb' }} />)
    rerender(<StatsChart result={result} colors={{ 'team-1': '#2563eb' }} />)
    expect(setOption.mock.calls.length).toBe(1)
    rerender(<StatsChart result={teamsOf(5)} colors={{ 'team-1': '#2563eb' }} />)
    expect(setOption.mock.calls.length).toBe(2)
  })

  it('T10-K10: no animation, a null is an em dash, one dispose', () => {
    const { unmount } = render(<StatsChart result={teamsOf(3)} />)
    expect(option().animation).toBe(false)
    expect(option().tooltip.valueFormatter(null)).toBe('—')
    expect(option().tooltip.valueFormatter(null)).toBe(STATS.table.none)
    unmount()
    expect(dispose).toHaveBeenCalledTimes(1)

    vi.clearAllMocks()
    setWidth(0)
    render(<StatsChart result={teamsOf(3)} />)
    expect(init).not.toHaveBeenCalled()
    expect(chart()).toBeTruthy()
    expect(screen.getByText(STATS.metrics.points!)).toBeTruthy()
  })

  it('T10-K13: oklch never reaches ECharts — every colour is painted to rgb first', () => {
    // HeroUI's tokens are oklch(); ECharts cannot parse one, so its hover
    // highlight lightens the bar into no colour at all and the bar vanishes.
    const tokens = document.createElement('style')
    tokens.textContent = `[data-stats-kind] {
      --accent: oklch(0.62 0.19 259); --muted: oklch(0.55 0.01 260); --separator: oklch(0.92 0.004 286);
      --success: oklch(0.73 0.19 150); --warning: oklch(0.78 0.16 75); --danger: oklch(0.65 0.24 25);
    }`
    document.head.append(tokens)
    // A canvas that reads back one fixed pixel, whatever it was asked to paint.
    const painted: string[] = []
    vi.stubGlobal(
      'OffscreenCanvas',
      class {
        getContext() {
          const context = {
            fillStyle: '#000000',
            clearRect() {},
            fillRect() {
              painted.push(context.fillStyle)
            },
            getImageData: () => ({ data: Uint8ClampedArray.of(10, 20, 30, 255) }),
          }
          return context
        }
      },
    )
    try {
      const { unmount } = render(<StatsChart result={teamsOf(3)} colors={{ 'team-1': 'oklch(0.7 0.15 150)' }} />)
      // The precondition: the chart's element does read an oklch accent.
      expect(getComputedStyle(chart()).getPropertyValue('--accent').trim()).toBe('oklch(0.62 0.19 259)')
      const json = JSON.stringify(option())
      expect(json).not.toContain('oklch(')
      expect(json).toContain('rgb(10, 20, 30)')
      expect(painted).toContain('oklch(0.62 0.19 259)')
      expect(painted).toContain('oklch(0.7 0.15 150)')
      unmount()

      // The verdict colours, the same.
      render(
        <StatsChart
          result={answer('team', ['correct', 'partial', 'incorrect'], [row('team-a', 'Alpha', [3, 1, 1])])}
          kind="verdicts"
        />,
      )
      expect(JSON.stringify(option())).not.toContain('oklch(')
    } finally {
      tokens.remove()
    }
  })

  it('T10-K19: one series palette — SERIES_TOKENS, exported, is the chart’s own, in its order', () => {
    // Theme references, so an organism can paint the DOM with the same list.
    expect(SERIES_TOKENS.length).toBeGreaterThanOrEqual(5)
    expect(SERIES_TOKENS.every((t) => /^var\(--[\w-]+\)$/.test(t))).toBe(true)
    // Each token a colour of its own: the chart's palette is those, in that order.
    const names = SERIES_TOKENS.map((t) => /--[\w-]+/.exec(t)![0])
    const hex = names.map((_, i) => `#${(i + 1).toString(16).padStart(2, '0').repeat(3)}`)
    const tokens = document.createElement('style')
    tokens.textContent = `[data-stats-kind] { ${names.map((n, i) => `${n}: ${hex[i]};`).join(' ')} }`
    document.head.append(tokens)
    try {
      render(<StatsChart result={teamsOf(3)} />)
      expect(option().color).toEqual(hex)
    } finally {
      tokens.remove()
    }
  })

  it('T10-K21: no OffscreenCanvas — WKWebView before Safari 16.4 — still paints to rgb, on a canvas element', () => {
    const tokens = document.createElement('style')
    tokens.textContent = '[data-stats-kind] { --accent: oklch(0.62 0.19 259); }'
    document.head.append(tokens)
    vi.stubGlobal('OffscreenCanvas', undefined)
    // A canvas element whose context reads back one fixed pixel.
    const painted: string[] = []
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(((): unknown => {
      const context = {
        fillStyle: '#000000',
        clearRect() {},
        fillRect() {
          painted.push(context.fillStyle)
        },
        getImageData: () => ({ data: Uint8ClampedArray.of(40, 50, 60, 255) }),
      }
      return context
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext)
    try {
      // jsdom has the element but no context, and says so on the console when
      // asked: it is never asked, and the colour passes through.
      const { unmount } = render(<StatsChart result={teamsOf(3)} />)
      expect(getContext).not.toHaveBeenCalled()
      expect(JSON.stringify(option())).toContain('oklch(0.62 0.19 259)')
      unmount()

      // macOS 10.15's WKWebView: a canvas element, painted and read back.
      const agent = vi
        .spyOn(navigator, 'userAgent', 'get')
        .mockReturnValue('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)')
      try {
        render(<StatsChart result={teamsOf(3)} />)
        const json = JSON.stringify(option())
        expect(json).not.toContain('oklch(')
        expect(json).toContain('rgb(40, 50, 60)')
        expect(painted).toContain('oklch(0.62 0.19 259)')
        expect(getContext).toHaveBeenCalledWith('2d', { willReadFrequently: true })
      } finally {
        agent.mockRestore()
      }
    } finally {
      getContext.mockRestore()
      tokens.remove()
    }
  })

  it('T10-K14: a ranking of a lower-is-better metric ranks the fastest first', () => {
    const ms = [4200, 1800, 9100, 2500, 700, 3300, 5100, 1200, 6400, 2900, 8000, 1500, 4700, 3900, 2100]
    const result = answer(
      'team',
      ['fastest_lock_ms'],
      ms.map((v, i) => row(`team-${i + 1}`, `Team ${i + 1}`, [v])),
    )
    render(<StatsChart result={result} kind="ranking" />)
    const drawn = values(option().series[0]) as number[]
    expect(drawn.length).toBe(12)
    expect(drawn).toEqual([...drawn].sort((a, b) => a - b))
    expect(drawn[0]).toBe(700)
    // The three slowest are the ones left to the table.
    expect(drawn).not.toContain(9100)
  })

  it('T10-K15: the value axis speaks the metric’s unit', () => {
    const { unmount } = render(
      <StatsChart result={answer('team', ['accuracy'], [row('team-a', 'Alpha', [0.5]), row('team-b', 'Beta', [0.75])])} />,
    )
    expect(valueAxisOf(option())?.axisLabel?.formatter?.(0.5)).toBe('50%')
    unmount()

    const { unmount: again } = render(
      <StatsChart
        result={answer('team', ['avg_lock_ms'], [row('team-a', 'Alpha', [2500]), row('team-b', 'Beta', [4100])])}
        kind="ranking"
      />,
    )
    expect(valueAxisOf(option())?.axisLabel?.formatter?.(2500)).toBe('2.5s')
    again()

    // A plain number stays ECharts' own.
    render(<StatsChart result={teamsOf(3)} />)
    expect(valueAxisOf(option())?.axisLabel?.formatter).toBeUndefined()
  })

  it('T10-K18: the header has a slot for an action, at the end of the caption’s row', () => {
    render(
      <StatsChart
        result={teamsOf(3)}
        action={
          <button type="button" aria-label="Pick a column">
            Pick
          </button>
        }
      />,
    )
    const action = screen.getByRole('button', { name: 'Pick a column' })
    const caption = screen.getByText(STATS.metrics.points!)
    const headRow = caption.parentElement!
    // The same row as the caption, and after it…
    expect(headRow.contains(action)).toBe(true)
    expect(caption.compareDocumentPosition(action) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // …a row of its own, not the chart box…
    expect(headRow.contains(chart())).toBe(false)
    // …inside the chart's panel.
    expect(chart().parentElement!.contains(action)).toBe(true)
  })
})
