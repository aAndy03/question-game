import { useMemo, useState } from 'react'
import { Skeleton } from '@/atoms'
import { EmptyState, StatsCards, StatsChart, StatsFilterBar, StatsTable, windowBounds, type TimeWindow } from '@/molecules'
import { STATS } from '@/copy/stats'
import { useCatalogList, useRecipeList, useStats } from '@/host/queries'
import type { StatsDimension, StatsFilter, StatsMetric } from '@/host/types'

export interface AllDataStatsProps {
  /** grid | table, the same per-operator preference every list tab has (§12). */
  view: 'grid' | 'table'
}

/** Every column the picker offers, in the host's order. */
const ALL_METRICS: readonly StatsMetric[] = [
  'turns',
  'correct',
  'incorrect',
  'accuracy',
  'points',
  'avg_points',
  'avg_lock_ms',
  'fastest_lock_ms',
  'plays',
]

const DEFAULT_METRICS: readonly StatsMetric[] = ['turns', 'correct', 'accuracy', 'points']
const EMPTY: StatsFilter = {}

/**
 * All data (§11.K, §13.2): one `stats_query` under the compound filter, drawn
 * as the table (default) or the cards, with one chart under it.
 *
 * Filter state is component state, not chrome and certainly not a store: it is
 * a question being asked, and it dies with the page. The answer is a Query,
 * keyed by the document — so going back to a filter you already ran is
 * instant and still costs the host nothing.
 */
export function AllDataStats({ view }: AllDataStatsProps) {
  const [filter, setFilter] = useState<StatsFilter>(EMPTY)
  const [time, setTime] = useState<TimeWindow>('all')
  const [groupBy, setGroupBy] = useState<StatsDimension>('team')
  const [metrics, setMetrics] = useState<readonly StatsMetric[]>(DEFAULT_METRICS)

  const teams = useCatalogList('team', 'all')
  const domains = useCatalogList('domain', 'all')
  const games = useRecipeList('active')

  // The window is resolved once per filter change, not on every render: a
  // `Date.now()` in the query document would make every render a new key.
  const query = useMemo(() => {
    const bounds = windowBounds(time, Date.now())
    return { filter: { ...filter, ...bounds }, groupBy, metrics }
  }, [filter, time, groupBy, metrics])

  const stats = useStats(query)
  const isDirty = time !== 'all' || metrics !== DEFAULT_METRICS || Object.values(filter).some((v) => (Array.isArray(v) ? v.length > 0 : Boolean(v)))

  return (
    <div className="flex flex-col gap-4" data-all-data-stats>
      <StatsFilterBar
        filter={filter}
        onFilter={setFilter}
        time={time}
        onTime={setTime}
        groupBy={groupBy}
        onGroupBy={setGroupBy}
        metrics={metrics}
        onMetrics={setMetrics}
        allMetrics={ALL_METRICS}
        games={(games.data ?? []).map((recipe) => ({ value: recipe.id, label: recipe.name }))}
        teams={(teams.data ?? []).map((team) => ({ value: team.id, label: team.name }))}
        domains={(domains.data ?? []).map((domain) => ({ value: domain.id, label: domain.name }))}
        onClear={() => {
          setFilter(EMPTY)
          setTime('all')
          setMetrics(DEFAULT_METRICS)
        }}
        isDirty={isDirty}
      />

      {stats.isPending ? <Skeleton shape="row" count={4} /> : null}
      {stats.data && stats.data.rows.length === 0 ? (
        <EmptyState kind="noResults" what={STATS.empty.what} detail={STATS.empty.body} />
      ) : null}
      {stats.data && stats.data.rows.length > 0 ? (
        <>
          {view === 'table' ? <StatsTable result={stats.data} /> : <StatsCards result={stats.data} />}
          <StatsChart result={stats.data} />
        </>
      ) : null}
    </div>
  )
}
