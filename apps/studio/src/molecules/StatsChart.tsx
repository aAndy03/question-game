import { useEffect, useMemo, useRef, type ReactNode } from 'react'
import * as echarts from 'echarts'
import { Panel, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import { WORKSPACE } from '@/copy/workspaces'
import { statsUnit, type StatsMetric, type StatsResult, type StatsRow, type TurnAward } from '@/host/types'
import { formatMetric, seriesOf } from './StatsTable'

/**
 * What the chart draws (P20). Each kind is the picture of one kind of answer:
 * a ranking for teams and domains, a stack of verdicts, a line over days,
 * bars in band order, and the score race of one Play.
 */
export type StatsChartKind = 'bars' | 'ranking' | 'verdicts' | 'timeline' | 'bands' | 'race'

export interface StatsChartProps {
  result: StatsResult
  /** Defaults to `bars`: a bar per row, a line when the rows are days. */
  kind?: StatsChartKind | undefined
  /** Which column to draw — bars, ranking, timeline, bands. Defaults to the first, the one the table sorts by. */
  metricIndex?: number | undefined
  height?: number | undefined
  /** The caption over the chart. Defaults to the metric's name. */
  title?: string | undefined
  /** Row key or team id → a CSS colour: a literal, or `var(--name)` from the Studio theme. */
  colors?: Readonly<Record<string, string>> | undefined
  /** `race` only: the award ledger, in any order. */
  turns?: readonly TurnAward[] | undefined
  /** `race` only: team id → its score now, where every line ends. */
  totals?: Readonly<Record<string, number>> | undefined
  /** `race` only: which lines, in ring order, and what they are called. */
  teams?: readonly { id: string; name: string }[] | undefined
  /** At the right end of the caption's row — All data's metric picker. */
  action?: ReactNode | undefined
}

/** A ranking draws the top rows; the table under it has every one. */
const RANKING_TOP = 12

/**
 * The Studio series palette, in order: a series the page gave no colour takes
 * the next one. Theme references, so the DOM paints with the same list the
 * chart does — the chart resolves each one off its own element (`themeOf`).
 */
export const SERIES_TOKENS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--danger)', 'var(--muted)'] as const

/** What a token is where the theme does not set it — jsdom, a page outside the Studio scope. */
const TOKEN_FALLBACKS: Readonly<Record<string, string>> = {
  '--accent': '#3b82f6',
  '--success': '#16a34a',
  '--warning': '#d97706',
  '--danger': '#dc2626',
  '--muted': '#666666',
  '--separator': '#e5e5e5',
}

/**
 * The Studio theme as ECharts can draw it, read off the chart's own element
 * when it draws. ECharts paints on a canvas that knows nothing of CSS, so a
 * `var(--…)` handed to it is no colour at all: `paint` resolves one, and
 * anything it cannot resolve is the accent. Every colour here is already
 * `rgb()` — see `toRgb`.
 */
interface Theme {
  muted: string
  accent: string
  line: string
  /** For a series the page gave no colour: ECharts' own palette knows nothing of the theme. */
  palette: string[]
  paint: (value: string | undefined) => string
}

/** One kind's picture, before the theme: what to draw, and what to say under it. */
interface Plan {
  /** The line under the chart — that there is nothing, or what it leaves out. */
  note: string | null
  /** `null` when there is nothing to draw. */
  draw: ((theme: Theme) => echarts.EChartsOption) | null
}

/**
 * The one chart, and the **only file in the project that imports ECharts**
 * (§7: "EvilCharts/ECharts isolated under Statistics, read-only"), themed
 * from the Studio CSS variables so it follows light and dark with everything
 * else.
 *
 * It draws what it is given in the order it is given — the host has already
 * ordered days by date and difficulty by band — except a ranking, which is a
 * sort by definition. `null` is never a zero: a bar or a ranking leaves the
 * row out, a line over days or a bar per band leaves a gap where it stands.
 *
 * ECharts owns a canvas, so it is initialised imperatively and disposed on
 * unmount. The option is built in a memo over the props, so a re-render that
 * changes nothing does not redraw. Where there is no layout to measure —
 * jsdom, a hidden panel — the chart is simply not created: the panel and its
 * caption still render, and nothing throws.
 */
export function StatsChart({
  result,
  kind = 'bars',
  metricIndex = 0,
  height = 260,
  title,
  colors,
  turns,
  totals,
  teams,
  action,
}: StatsChartProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const metric = result.metrics[metricIndex]

  // Keyed on content, not identity: a page builds its colours, totals and
  // roster from play-state inline, and an equal record is the same picture.
  // The keys stand for the three records, so the memo may close over them.
  const colorsKey = colors ? JSON.stringify(colors) : ''
  const totalsKey = totals ? JSON.stringify(totals) : ''
  const teamsKey = teams ? JSON.stringify(teams) : ''
  const plan = useMemo(
    () => planChart(kind, result, metricIndex, colors, turns, totals, teams),
    [kind, result, metricIndex, colorsKey, totalsKey, teamsKey, turns],
  )

  useEffect(() => {
    const el = box.current
    if (!el) return
    if (!plan.draw) {
      // Nothing to draw now: no picture of the last answer left standing.
      chart.current?.dispose()
      chart.current = null
      return
    }
    if (el.clientWidth === 0) return
    const instance = chart.current ?? echarts.init(el, undefined, { renderer: 'svg' })
    chart.current = instance
    instance.setOption(plan.draw(themeOf(el)), { notMerge: true })

    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [plan])

  // Dispose once, on unmount: re-creating the instance per render would leak
  // a canvas every time a filter changed.
  useEffect(
    () => () => {
      chart.current?.dispose()
      chart.current = null
    },
    [],
  )

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <Text variant="studio-caption" tone="muted">
          {title ?? captionOf(kind, metric)}
        </Text>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div
        ref={box}
        data-stats-chart={result.groupBy}
        data-stats-kind={kind}
        role="img"
        aria-label={STATS.chart.label}
        // Nothing to draw: no tall empty panel, the note says so (P20).
        style={{ height: plan.draw ? height : 0 }}
      />
      {plan.note ? (
        <Text variant="studio-caption" tone="muted">
          {plan.note}
        </Text>
      ) : null}
    </Panel>
  )
}

/** The caption when the page names none: the metric, or what the picture is of. */
function captionOf(kind: StatsChartKind, metric: StatsMetric | undefined): string {
  if (kind === 'race') return STATS.live.race
  if (kind === 'verdicts') return STATS.filters.verdict
  return metric ? (STATS.metrics[metric] ?? metric) : STATS.chart.label
}

const NOTHING: Plan = { note: STATS.chart.none, draw: null }

function planChart(
  kind: StatsChartKind,
  result: StatsResult,
  metricIndex: number,
  colors: StatsChartProps['colors'],
  turns: StatsChartProps['turns'],
  totals: StatsChartProps['totals'],
  teams: StatsChartProps['teams'],
): Plan {
  if (kind === 'verdicts') return verdictsPlan(result)
  if (kind === 'race') return racePlan(result, colors, turns, totals, teams)
  const metric = result.metrics[metricIndex]
  if (!metric) return NOTHING
  const name = STATS.metrics[metric] ?? metric

  if (kind === 'timeline' || kind === 'bands') {
    // An ordinal axis: every row keeps its place, and a null is a gap in it.
    const rows = result.rows
    if (rows.every((row) => row.values[metricIndex] == null)) return NOTHING
    const line = kind === 'timeline'
    return {
      note: null,
      draw: (t) => ({
        ...frame(t, metric, false),
        xAxis: categoryAxis(t, rows.map((row) => labelOf(result, row))),
        yAxis: valueAxis(t, metric),
        series: [
          {
            name,
            type: line ? 'line' : 'bar',
            data: rows.map((row) => datum(row.values[metricIndex] ?? null, colors?.[row.key], t)),
            ...mark(t, line ? 'line' : 'column'),
          },
        ],
      }),
    }
  }

  if (kind === 'ranking') {
    // Best first: the largest, except a time, where the fastest is the best
    // and the twelve kept are the twelve fastest. The sort is stable, so a tie
    // keeps the host's order.
    const lowerIsBetter = statsUnit(metric) === 'milliseconds'
    const ranked = seriesOf(result, metricIndex).sort((a, b) => (lowerIsBetter ? a.value - b.value : b.value - a.value))
    if (ranked.length === 0) return NOTHING
    const shown = ranked.slice(0, RANKING_TOP)
    return {
      note: ranked.length > RANKING_TOP ? STATS.chart.topOf(RANKING_TOP, ranked.length) : null,
      draw: (t) => ({
        ...frame(t, metric, false),
        xAxis: valueAxis(t, metric),
        // A category axis counts upwards; inverted, the best reads first.
        yAxis: { ...categoryAxis(t, shown.map((p) => p.label)), inverse: true },
        series: [{ name, type: 'bar', data: shown.map((p) => datum(p.value, colors?.[p.key], t)), ...mark(t, 'row') }],
      }),
    }
  }

  // `bars`, the P11 default: a bar per row, a line when the rows are days.
  const points = seriesOf(result, metricIndex)
  if (points.length === 0) return NOTHING
  const line = result.groupBy === 'day'
  return {
    note: null,
    draw: (t) => ({
      ...frame(t, metric, false),
      xAxis: categoryAxis(t, points.map((p) => p.label)),
      yAxis: valueAxis(t, metric),
      series: [
        {
          name,
          type: line ? 'line' : 'bar',
          data: points.map((p) => datum(p.value, colors?.[p.key], t)),
          ...mark(t, line ? 'line' : 'column'),
        },
      ],
    }),
  }
}

/** The three verdicts in reading order, each in its state colour. */
const VERDICT_SERIES = [
  { metric: 'correct', color: 'var(--success)' },
  { metric: 'partial', color: 'var(--warning)' },
  { metric: 'incorrect', color: 'var(--danger)' },
] as const

/**
 * One stacked bar per row. Each verdict is found by its metric's **name**, not
 * its position, so the page may ask for the columns in any order. One it did
 * not ask for is **no series**: the host never counted it, and a series of
 * zeros would put a false `0` in the legend and the tooltip. A stack with
 * nothing in it — every verdict it carries is 0 or null — is nothing to chart.
 */
function verdictsPlan(result: StatsResult): Plan {
  const rows = result.rows
  const columns = VERDICT_SERIES.map((v) => ({ ...v, index: result.metrics.indexOf(v.metric) })).filter(
    (c) => c.index >= 0,
  )
  if (!rows.some((row) => columns.some((c) => (row.values[c.index] ?? 0) > 0))) return NOTHING
  return {
    note: null,
    draw: (t) => ({
      ...frame(t, 'correct', true),
      xAxis: valueAxis(t),
      yAxis: { ...categoryAxis(t, rows.map((row) => labelOf(result, row))), inverse: true },
      series: columns.map((c) => ({
        name: STATS.verdicts[c.metric] ?? c.metric,
        type: 'bar' as const,
        stack: 'verdicts',
        data: rows.map((row) => row.values[c.index] ?? null),
        barMaxWidth: 24,
        itemStyle: { color: t.paint(c.color) },
      })),
    }),
  }
}

/**
 * The score race: one line per team, x the turn, y the team's score after it.
 *
 * The ledger is capped — a long Play sends only its last turns — so each line
 * is drawn **backwards** from where the team stands now: the last point is
 * its total, and each earlier one takes off what that turn paid. When the
 * ledger accounts for every point, every line starts at 0 and this is the
 * whole Play; when it does not, the axis counts on from the turns before it
 * and the note says these are the last ones.
 *
 * A score is never below 0. When the ledger pays a team more than its total —
 * the two read at different moments — the walk back would go negative, so
 * every point stops at 0. Whether this is the whole Play is decided before
 * that clamp, from what the ledger paid each team against its total: a line
 * clamped to 0 starts there too, and is still not the whole Play.
 */
function racePlan(
  result: StatsResult,
  colors: StatsChartProps['colors'],
  turns: StatsChartProps['turns'],
  totals: StatsChartProps['totals'],
  teams: StatsChartProps['teams'],
): Plan {
  if (!turns?.length || !teams?.length) return NOTHING
  // Oldest first. The ledger comes newest first, so a tie keeps it reversed.
  const ledger = turns
    .map((turn, index) => ({ turn, index }))
    .sort((a, b) => a.turn.atMs - b.turn.atMs || b.index - a.index)
    .map(({ turn }) => turn)
  const paid = (teamId: string) =>
    ledger.reduce((sum, turn) => (turn.teamId === teamId ? sum + turn.points + turn.bonus : sum), 0)
  const lines = teams.map((team) => {
    // A team the page gave no total ends at what the ledger paid it.
    let score = totals?.[team.id] ?? paid(team.id)
    const scores = new Array<number>(ledger.length + 1)
    scores[ledger.length] = Math.max(0, score)
    for (let k = ledger.length - 1; k >= 0; k -= 1) {
      const turn = ledger[k]!
      if (turn.teamId === team.id) score -= turn.points + turn.bonus
      scores[k] = Math.max(0, score)
    }
    // `score` is now the unclamped start: 0 only when the ledger paid exactly the total.
    return { team, scores, covered: score === 0 }
  })
  const whole = lines.every((line) => line.covered)
  const before = Math.max(0, result.turnCount - ledger.length)
  return {
    note: whole ? null : STATS.chart.lastTurns(ledger.length),
    draw: (t) => {
      // A team without a colour takes the next one from the Studio palette.
      let free = 0
      return {
        ...frame(t, 'points', true),
        xAxis: categoryAxis(t, Array.from({ length: ledger.length + 1 }, (_, k) => String(before + k))),
        yAxis: valueAxis(t),
        series: lines.map(({ team, scores }) => {
          const own = colors?.[team.id]
          const color = own ? t.paint(own) : t.palette[free++ % t.palette.length]!
          return {
            name: team.name,
            type: 'line' as const,
            data: scores,
            symbolSize: 4,
            showSymbol: ledger.length <= 30,
            lineStyle: { width: 2, color },
            itemStyle: { color },
          }
        }),
      }
    },
  }
}

/** What every kind shares: no animation, the Studio palette, the grid, and a tooltip that never prints a null. */
function frame(t: Theme, metric: StatsMetric, legend: boolean): echarts.EChartsOption {
  return {
    animation: false,
    color: t.palette,
    grid: { left: 8, right: 16, top: legend ? 36 : 16, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => (typeof value === 'number' ? formatMetric(value, metric) : STATS.table.none),
    },
    ...(legend ? { legend: { top: 0, left: 0, itemWidth: 12, itemHeight: 8, textStyle: { color: t.muted } } } : {}),
  }
}

function categoryAxis(t: Theme, data: string[]) {
  return {
    type: 'category' as const,
    data,
    axisLabel: { color: t.muted, hideOverlap: true },
    axisLine: { lineStyle: { color: t.line } },
    axisTick: { show: false },
  }
}

/**
 * The numbers' axis, in the metric's unit where it has one — `50%`, `2.5s`,
 * as the table and the tooltip write them. A count or a score is ECharts' own.
 */
function valueAxis(t: Theme, metric?: StatsMetric) {
  const unit = metric ? statsUnit(metric) : 'count'
  const formatter =
    metric && (unit === 'ratio' || unit === 'milliseconds') ? (value: number) => formatMetric(value, metric) : undefined
  return {
    type: 'value' as const,
    axisLabel: { color: t.muted, ...(formatter ? { formatter } : {}) },
    splitLine: { lineStyle: { color: t.line } },
  }
}

/**
 * How a single series is marked. A bar is a mark, not a panel: capped so four
 * teams do not become four blocks of colour across the width of the tab.
 */
function mark(t: Theme, shape: 'column' | 'row' | 'line') {
  const borderRadius = shape === 'column' ? [3, 3, 0, 0] : shape === 'row' ? [0, 3, 3, 0] : 0
  return {
    barMaxWidth: 36,
    itemStyle: { color: t.accent, borderRadius },
    lineStyle: { color: t.accent, width: 2 },
    symbolSize: 6,
  }
}

/** A value, carrying its own colour when the page gave its row one. */
function datum(value: number | null, color: string | undefined, t: Theme) {
  return color && value !== null ? { value, itemStyle: { color: t.paint(color) } } : value
}

/** A row's name on an axis — the same words the table and `seriesOf` use. */
function labelOf(result: StatsResult, row: StatsRow): string {
  return row.label || (result.groupBy === 'workspace' ? WORKSPACE.unnamed : row.key)
}

/** `var(--name)` or `var(--name, fallback)`. */
const CSS_VAR = /^var\(\s*(--[\w-]+)\s*(?:,\s*(.+))?\)$/

function themeOf(el: HTMLElement): Theme {
  const style = getComputedStyle(el)
  const token = (name: string) =>
    toRgb(style.getPropertyValue(name).trim() || (TOKEN_FALLBACKS[name] ?? TOKEN_FALLBACKS['--accent']!))
  const accent = token('--accent')
  const muted = token('--muted')
  const paint = (value: string | undefined) => {
    const written = value?.trim() ?? ''
    const ref = CSS_VAR.exec(written)
    const colour = ref ? style.getPropertyValue(ref[1]!).trim() || (ref[2]?.trim() ?? '') : written
    // Whatever is still a reference — an unset token, a nested fallback — is the accent.
    return colour && !colour.includes('var(') ? toRgb(colour) : accent
  }
  const palette = SERIES_TOKENS.map((ref) => token(CSS_VAR.exec(ref)![1]!))
  return { muted, accent, line: token('--separator'), palette, paint }
}

/**
 * A colour as ECharts can read it. HeroUI's tokens are `oklch()`, which
 * ECharts cannot parse: its hover highlight lightens the item's colour, gets
 * no colour back, and the hovered bar is drawn with `fill="none"` — it
 * vanishes under the pointer. So every colour is painted once on a 1×1 canvas
 * and read back as `rgb()`/`rgba()`, which the browser does for any colour it
 * can draw.
 *
 * Where there is no canvas to paint on (jsdom) the colour passes through
 * unchanged, as it does when the canvas will not take it. The cache is per
 * colour string, and per canvas implementation, so a test's stub never
 * answers for the next one.
 */
const rgbCache = new Map<string, string>()
let rgbCacheFor: unknown

type Painter = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

/**
 * Where `toRgb` paints: an `OffscreenCanvas` where there is one, else a 1×1
 * canvas element — WKWebView before Safari 16.4 (macOS 10.15, which Tauri 2
 * supports) has no `OffscreenCanvas`, and without this the hovered bar would
 * still vanish there. jsdom has the element but no 2D context, and prints an
 * error when one is asked for, so under jsdom it is never asked: `null`.
 */
function canvasOf(): { key: unknown; open: () => Painter | null } | null {
  if (typeof OffscreenCanvas !== 'undefined') {
    const Canvas = OffscreenCanvas
    return { key: Canvas, open: () => new Canvas(1, 1).getContext('2d', { willReadFrequently: true }) }
  }
  if (typeof document === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null
  if (typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')) return null
  return {
    key: HTMLCanvasElement.prototype.getContext,
    open: () => {
      const canvas = document.createElement('canvas')
      canvas.width = 1
      canvas.height = 1
      return canvas.getContext('2d', { willReadFrequently: true })
    },
  }
}

function toRgb(colour: string): string {
  const canvas = canvasOf()
  if (!canvas) return colour
  if (rgbCacheFor !== canvas.key) {
    rgbCache.clear()
    rgbCacheFor = canvas.key
  }
  const known = rgbCache.get(colour)
  if (known !== undefined) return known
  let read = colour
  try {
    const context = canvas.open()
    if (context) {
      // A colour the canvas cannot take leaves fillStyle as it was, so it
      // reads back as each of two different starting colours: no colour.
      context.fillStyle = '#000000'
      context.fillStyle = colour
      const first = context.fillStyle
      context.fillStyle = '#ffffff'
      context.fillStyle = colour
      if (context.fillStyle === first) {
        context.clearRect(0, 0, 1, 1)
        context.fillRect(0, 0, 1, 1)
        const [r = 0, g = 0, b = 0, a = 255] = context.getImageData(0, 0, 1, 1).data
        read = a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${Math.round((a / 255) * 1000) / 1000})`
      }
    }
  } catch {
    read = colour
  }
  rgbCache.set(colour, read)
  return read
}
