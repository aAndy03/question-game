import { Panel, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import type { StatsResult } from '@/host/types'
import { formatMetric } from './StatsTable'

export interface StatsCardsProps {
  result: StatsResult
  markedKey?: string | null | undefined
}

/**
 * The same rows as cards — §12's "results table default; entity cards
 * optional", the grid half of the one grid|table preference every list tab
 * already has. One card per row, the first metric large, the rest beneath it.
 */
export function StatsCards({ result, markedKey }: StatsCardsProps) {
  const [lead, ...rest] = result.metrics
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3" aria-label={STATS.table.label}>
      {result.rows.map((row) => (
        <Panel
          key={row.key}
          variant="secondary"
          data-stats-row={row.key}
          className={['flex flex-col gap-2', row.key === markedKey ? 'ring-2 ring-[var(--accent)]' : ''].join(' ')}
        >
          <Text as="div" variant="studio-label" truncate>
            {row.label || row.key}
          </Text>
          {lead ? (
            <div className="flex items-baseline gap-2">
              <Text as="span" variant="studio-display" tabular>
                {formatMetric(row.values[0] ?? null, lead)}
              </Text>
              <Text as="span" variant="studio-caption" tone="muted">
                {STATS.metrics[lead] ?? lead}
              </Text>
            </div>
          ) : null}
          <dl className="flex flex-col gap-0.5">
            {rest.map((metric, index) => (
              <div key={metric} className="flex items-baseline justify-between gap-3">
                <Text as="dt" variant="studio-caption" tone="muted">
                  {STATS.metrics[metric] ?? metric}
                </Text>
                <Text as="dd" variant="studio-caption" tabular>
                  {formatMetric(row.values[index + 1] ?? null, metric)}
                </Text>
              </div>
            ))}
          </dl>
        </Panel>
      ))}
    </div>
  )
}
