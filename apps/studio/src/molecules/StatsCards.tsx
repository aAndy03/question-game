import { Button, Panel, Text } from '@/atoms'
import { STATS } from '@/copy/stats'
import type { StatsResult } from '@/host/types'
import { STATS_CAP, formatMetric, useShowAll } from './StatsTable'

export interface StatsCardsProps {
  result: StatsResult
  markedKey?: string | null | undefined
  /** Cards shown before *Show all N* — the table's cap, so the two views agree (P20). */
  cap?: number | undefined
}

/**
 * The same rows as cards — §12's "results table default; entity cards
 * optional", the grid half of the one grid|table preference every list tab
 * already has. One card per row, the first metric large, the rest beneath it.
 *
 * A long answer shows its first `cap` cards, then *Show all N*, as the table
 * does. The row hook sits on a wrapper: `Panel` passes no attributes through.
 */
export function StatsCards({ result, markedKey, cap = STATS_CAP }: StatsCardsProps) {
  const [showAll, onShowAll] = useShowAll(result)
  const [lead, ...rest] = result.metrics
  const total = result.rows.length
  const capped = !showAll && total > cap
  const rows = capped ? result.rows.slice(0, cap) : result.rows
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3" aria-label={STATS.table.label}>
        {rows.map((row) => (
          <div key={row.key} data-stats-row={row.key} className="flex">
            <Panel
              variant="secondary"
              className={['flex flex-1 flex-col gap-2', row.key === markedKey ? 'ring-2 ring-[var(--accent)]' : ''].join(' ')}
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
          </div>
        ))}
      </div>
      {capped ? (
        <div>
          <Button size="sm" variant="ghost" onPress={onShowAll}>
            {STATS.table.showAll(total)}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
