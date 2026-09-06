import { useEffect, useRef } from 'react'
import * as echarts from 'echarts'
import { Panel, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import type { StatsResult } from '@/host/types'
import { formatMetric, seriesOf } from './StatsTable'

export interface StatsChartProps {
  result: StatsResult
  /** Which column to draw. Defaults to the first — the one the table sorts by. */
  metricIndex?: number | undefined
  height?: number | undefined
}

/**
 * The one chart, and the **only file in the project that imports ECharts**
 * (§7: "EvilCharts/ECharts isolated under Statistics, read-only"). Bars for a
 * categorical dimension, a line for the day series, themed from the Studio
 * CSS variables so it follows light and dark with everything else.
 *
 * ECharts owns a canvas, so it is initialised imperatively and disposed on
 * unmount. Where there is no layout to measure — jsdom, a hidden panel — the
 * chart is simply not created: the panel and its label still render, and
 * nothing throws.
 */
export function StatsChart({ result, metricIndex = 0, height = 260 }: StatsChartProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const chart = useRef<echarts.ECharts | null>(null)
  const metric = result.metrics[metricIndex]
  const points = seriesOf(result, metricIndex)

  useEffect(() => {
    const el = box.current
    if (!el || el.clientWidth === 0 || points.length === 0 || !metric) return
    const instance = chart.current ?? echarts.init(el, undefined, { renderer: 'svg' })
    chart.current = instance
    const style = getComputedStyle(el)
    const token = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback
    const ink = token('--foreground', '#111')
    const muted = token('--foreground-muted', '#666')
    const accent = token('--accent', '#3b82f6')
    const line = token('--separator', '#e5e5e5')
    const isSeries = result.groupBy === 'day'

    instance.setOption(
      {
        animation: false,
        grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (value: number) => formatMetric(value, metric),
        },
        xAxis: {
          type: 'category',
          data: points.map((p) => p.label),
          axisLabel: { color: muted, hideOverlap: true },
          axisLine: { lineStyle: { color: line } },
          axisTick: { show: false },
        },
        yAxis: {
          type: 'value',
          axisLabel: { color: muted },
          splitLine: { lineStyle: { color: line } },
        },
        series: [
          {
            name: STATS.metrics[metric] ?? metric,
            type: isSeries ? 'line' : 'bar',
            data: points.map((p) => p.value),
            // A bar is a mark, not a panel: capped so four teams do not become
            // four blocks of colour across the width of the tab.
            barMaxWidth: 36,
            itemStyle: { color: accent, borderRadius: isSeries ? 0 : [3, 3, 0, 0] },
            lineStyle: { color: accent, width: 2 },
            symbolSize: 6,
            label: { color: ink },
          },
        ],
      },
      { notMerge: true },
    )

    const observer = new ResizeObserver(() => instance.resize())
    observer.observe(el)
    return () => observer.disconnect()
  }, [result, metric, metricIndex, points])

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
      <Text variant="studio-caption" tone="muted">
        {metric ? (STATS.metrics[metric] ?? metric) : STATS.chart.label}
      </Text>
      <div ref={box} data-stats-chart={result.groupBy} role="img" aria-label={STATS.chart.label} style={{ height }} />
      {points.length === 0 ? (
        <Text variant="studio-caption" tone="muted">
          {STATS.chart.none}
        </Text>
      ) : null}
    </Panel>
  )
}
