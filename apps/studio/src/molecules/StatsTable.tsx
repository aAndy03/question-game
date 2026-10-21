import { Panel, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import { WORKSPACE } from '@/copy/workspaces'
import { statsUnit, type StatsMetric, type StatsResult, type StatsRow } from '@/host/types'

export interface StatsTableProps {
  result: StatsResult
  /** Highlighted row key — the team holding the token, on Live. */
  markedKey?: string | null | undefined
  /** Hide the totals row where one group is the whole answer. */
  hideTotals?: boolean | undefined
}

/**
 * The default view of a `stats_query` answer (§12: "results table default").
 *
 * The host already grouped, ordered and named the rows, so this formats and
 * nothing else — no sorting, no derived column, no second opinion about what
 * a number means. `null` renders as an em dash, never as a zero: a Play at
 * operator pace has no lock time, and "0 ms" would be a lie about speed.
 */
export function StatsTable({ result, markedKey, hideTotals }: StatsTableProps) {
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full border-collapse" aria-label={STATS.table.label}>
        <thead>
          <tr className="border-b border-[var(--separator)]">
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
          {result.rows.map((row) => (
            <tr
              key={row.key}
              data-stats-row={row.key}
              className={['border-b border-[var(--separator)] last:border-0', row.key === markedKey ? 'bg-[var(--accent)]/8' : ''].join(' ')}
            >
              <th scope="row" className="max-w-[22rem] py-2 pr-4 text-left font-normal">
                <Text variant="studio-label" truncate>
                  {row.label || (result.groupBy === 'workspace' ? WORKSPACE.unnamed : row.key)}
                </Text>
              </th>
              {result.metrics.map((metric, index) => (
                <td key={metric} className="py-2 pl-4 text-right">
                  <Text variant="studio-body" tabular>
                    {formatMetric(row.values[index] ?? null, metric)}
                  </Text>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {hideTotals ? null : (
          <tfoot>
            <tr className="border-t-2 border-[var(--separator)]" data-stats-row="__totals">
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
    </Panel>
  )
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
    case 'points':
      return Number.isInteger(value) ? String(value) : value.toFixed(1)
    default:
      return Number.isInteger(value) ? String(value) : value.toFixed(1)
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
