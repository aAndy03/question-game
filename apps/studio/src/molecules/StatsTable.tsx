import { useMemo, useState } from 'react'
import { Button, Panel, Swatch, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import { WORKSPACE } from '@/copy/workspaces'
import { statsUnit, type StatsMetric, type StatsResult, type StatsRow } from '@/host/types'

export interface StatsTableProps {
  result: StatsResult
  /** Highlighted row key — the team holding the token, on Live. */
  markedKey?: string | null | undefined
  /** Hide the totals row where one group is the whole answer. */
  hideTotals?: boolean | undefined
  /** Draw the first metric as a bar in its cell, against the largest row (P20). */
  bars?: boolean | undefined
  /** Rows shown before *Show all N* (P20). The totals row is never capped. */
  cap?: number | undefined
  /** Row key → its rank, in a first *Rank* column: Live ranks as the scoreboard does. */
  ranks?: Readonly<Record<string, number>> | undefined
  /** Row key → a CSS colour, a swatch before the row's name (a team's colour). */
  colors?: Readonly<Record<string, string>> | undefined
}

/** How many rows a long answer shows first: enough to read, few enough to draw at once (P20). */
export const STATS_CAP = 50

/**
 * Whether *Show all* was pressed on this answer, and the press.
 *
 * The press belongs to the answer it was made on, not to the component: All
 * data keeps one table (or one card grid) mounted while the query changes
 * underneath it, so a component-wide flag would lift the cap for every later
 * answer. What is remembered is the answer itself, by content — its rows and
 * their numbers — not by object: the caller derives a new object on every
 * render (`chosenOf`, `ranked`), and that same answer must stay shown in full.
 */
export function useShowAll(result: StatsResult): readonly [boolean, () => void] {
  const answer = useMemo(() => answerOf(result), [result])
  const [expanded, setExpanded] = useState<string | null>(null)
  return [expanded === answer, () => setExpanded(answer)]
}

/** One string per answer: the dimension, the columns, and every row's key and numbers. */
function answerOf(result: StatsResult): string {
  return JSON.stringify([result.groupBy, result.metrics, result.rows.map((row) => [row.key, row.values]), result.totals.values])
}

/**
 * The default view of a `stats_query` answer (§12: "results table default").
 *
 * The host already grouped, ordered and named the rows, so this formats and
 * nothing else — no sorting, no derived column, no second opinion about what
 * a number means. `null` renders as an em dash, never as a zero: a Play at
 * operator pace has no lock time, and "0 ms" would be a lie about speed.
 *
 * P20: `bars` makes the first column a picture as well as a number, each bar
 * in proportion to the largest row, so a ranking reads at a glance; a long
 * answer shows its first `cap` rows, then *Show all N*. A rank and a colour
 * are the caller's (Live has both from play-state) — the table only draws them.
 */
export function StatsTable({ result, markedKey, hideTotals, bars, cap = STATS_CAP, ranks, colors }: StatsTableProps) {
  const [showAll, onShowAll] = useShowAll(result)
  const total = result.rows.length
  const capped = !showAll && total > cap
  const rows = capped ? result.rows.slice(0, cap) : result.rows
  // Against every row, not only the ones shown: *Show all* must not rescale them.
  const largest = bars ? result.rows.reduce((top, row) => Math.max(top, row.values[0] ?? 0), 0) : 0

  return (
    <Panel className="flex flex-col gap-2 overflow-x-auto">
      <table className="w-full border-collapse" aria-label={STATS.table.label}>
        <thead>
          <tr className="border-b border-[var(--separator)]">
            {ranks ? (
              <th scope="col" className="w-12 py-2 pr-3 text-left">
                <Text variant="studio-caption" tone="muted">
                  {STATS.live.rank}
                </Text>
              </th>
            ) : null}
            <th scope="col" className="py-2 pr-4 text-left">
              <Text variant="studio-caption" tone="muted">
                {STATS.dimensions[result.groupBy] ?? result.groupBy}
              </Text>
            </th>
            {result.metrics.map((metric) => (
              <th key={metric} scope="col" className="py-2 pl-4 text-right">
                <Text variant="studio-caption" tone="muted">
                  {STATS.metrics[metric] ?? metric}
                </Text>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const color = colors?.[row.key]
            const rank = ranks?.[row.key]
            return (
              <tr
                key={row.key}
                data-stats-row={row.key}
                className={['border-b border-[var(--separator)] last:border-0', row.key === markedKey ? 'bg-[var(--accent)]/8' : ''].join(' ')}
              >
                {ranks ? (
                  <td className="py-2 pr-3 text-left">
                    <Text variant="studio-label" tone="muted" tabular>
                      {rank === undefined ? STATS.table.none : rank}
                    </Text>
                  </td>
                ) : null}
                <th scope="row" className="max-w-[22rem] py-2 pr-4 text-left font-normal">
                  <span className="flex min-w-0 items-center gap-2">
                    {color ? <Swatch color={color} size="sm" /> : null}
                    <Text variant="studio-label" truncate className="min-w-0">
                      {row.label || (result.groupBy === 'workspace' ? WORKSPACE.unnamed : row.key)}
                    </Text>
                  </span>
                </th>
                {result.metrics.map((metric, index) => {
                  const value = row.values[index] ?? null
                  const figure = (
                    <Text variant="studio-body" tabular>
                      {formatMetric(value, metric)}
                    </Text>
                  )
                  return (
                    <td key={metric} className="py-2 pl-4 text-right">
                      {bars && index === 0 && value !== null ? (
                        <span className="flex items-center justify-end gap-3">
                          <span aria-hidden className="relative h-2 w-28 shrink-0">
                            <span
                              data-stats-bar
                              className="absolute inset-y-0 start-0 rounded-sm bg-[var(--accent)]"
                              style={{ width: `${barPercent(value, largest)}%` }}
                            />
                          </span>
                          {figure}
                        </span>
                      ) : (
                        figure
                      )}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
        {hideTotals ? null : (
          <tfoot>
            <tr className="border-t-2 border-[var(--separator)]" data-stats-row="__totals">
              {ranks ? <td /> : null}
              <th scope="row" className="py-2 pr-4 text-left font-normal">
                <Text variant="studio-label" tone="muted">
                  {STATS.table.total}
                </Text>
              </th>
              {result.metrics.map((metric, index) => (
                <td key={metric} className="py-2 pl-4 text-right">
                  <Text variant="studio-body" tone="muted" tabular>
                    {formatMetric(result.totals.values[index] ?? null, metric)}
                  </Text>
                </td>
              ))}
            </tr>
          </tfoot>
        )}
      </table>
      {capped ? (
        <div>
          <Button size="sm" variant="ghost" onPress={onShowAll}>
            {STATS.table.showAll(total)}
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}

/** A bar's width in percent of the largest row: clamped, and `0` — never `NaN` — when every row is zero. */
function barPercent(value: number, largest: number): number {
  if (largest <= 0) return 0
  return Math.min(100, Math.max(0, (value / largest) * 100))
}

/**
 * One number, in the metric's unit. The unit comes from the metric (the host
 * says which), so the table, the cards and the chart tooltip all read the
 * same — there is no per-call-site formatting.
 */
export function formatMetric(value: number | null, metric: StatsMetric): string {
  if (value === null) return STATS.table.none
  switch (statsUnit(metric)) {
    case 'ratio':
      return `${Math.round(value * 100)}%`
    case 'milliseconds':
      return value >= 10_000 ? `${(value / 1000).toFixed(0)}s` : `${(value / 1000).toFixed(1)}s`
    default:
      // Grouped as the Board writes points (P20): 81,550, not 81550.
      return Number.isInteger(value) ? value.toLocaleString('en') : value.toLocaleString('en', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  }
}

/** The rows as `{ label, value }` for a chart or a card, one metric at a time. */
export function seriesOf(result: StatsResult, metricIndex = 0): { label: string; value: number; key: string }[] {
  return result.rows
    .map((row: StatsRow) => ({
      key: row.key,
      label: row.label || (result.groupBy === 'workspace' ? WORKSPACE.unnamed : row.key),
      value: row.values[metricIndex] ?? null,
    }))
    .filter((point): point is { key: string; label: string; value: number } => point.value !== null)
}
