import { useMemo, useState } from 'react'
import { SelectField, Skeleton } from '@/atoms'
import {
  EmptyState,
  StatCard,
  StatsCards,
  StatsChart,
  StatsFilterBar,
  StatsTable,
  formatMetric,
  windowBounds,
  type StatsChartProps,
  type TimeWindow,
} from '@/molecules'
import { STATS } from '@/copy/stats'
import { useCatalogList, useRecipeList, useStats } from '@/host/queries'
import type { StatsDimension, StatsFilter, StatsMetric, StatsResult, StatsRow } from '@/host/types'

export interface AllDataStatsProps {
  /** grid | table, the same per-operator preference every list tab has (§12). */
  view: 'grid' | 'table'
}

/** Every column the picker offers, in the host's order. */
const ALL_METRICS: readonly StatsMetric[] = [
  'turns',
  'correct',
  'incorrect',
  'partial',
  'accuracy',
  'points',
  'avg_points',
  'avg_lock_ms',
  'fastest_lock_ms',
  'plays',
]

const DEFAULT_METRICS: readonly StatsMetric[] = ['turns', 'correct', 'accuracy', 'points']
const EMPTY: StatsFilter = {}

type ChartKind = NonNullable<StatsChartProps['kind']>

/**
 * All data (§11.K, §13.2): one `stats_query` under the compound filter.
 *
 * P20, a picture first: under the filter bar, a strip of what the answer adds
 * up to, then the chart — with a picker for the column it draws — and then
 * the table (default) or the cards, each showing its first 50 rows.
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
  // The column the chart draws; the first one until the operator picks another.
  const [charted, setCharted] = useState<StatsMetric | null>(null)

  const teams = useCatalogList('team', 'all')
  const domains = useCatalogList('domain', 'all')
  const games = useRecipeList('active')

  // The window is resolved once per filter change, not on every render: a
  // `Date.now()` in the query document would make every render a new key.
  const query = useMemo(() => {
    const bounds = windowBounds(time, Date.now())
    return { filter: { ...filter, ...bounds }, groupBy, metrics: askedFor(groupBy, metrics) }
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
        defaultMetrics={DEFAULT_METRICS}
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
          <Summary result={stats.data} />
          <Chart result={stats.data} charted={charted} onChart={setCharted} />
          {view === 'table' ? (
            <StatsTable result={chosenOf(stats.data, metrics)} />
          ) : (
            <StatsCards result={chosenOf(stats.data, metrics)} />
          )}
        </>
      ) : null}
    </div>
  )
}

/**
 * What the answer adds up to. Plays and turns are the answer's own counts;
 * accuracy and points are its totals by metric name, so a column the operator
 * did not ask for is an em dash — never a zero.
 */
function Summary({ result }: { result: StatsResult }) {
  const total = (metric: StatsMetric) => {
    const index = result.metrics.indexOf(metric)
    return index < 0 ? STATS.table.none : formatMetric(result.totals.values[index] ?? null, metric)
  }
  return (
    <div className="@container/summary">
      <div className="grid grid-cols-2 gap-3 @[36rem]/summary:grid-cols-4">
        <StatCard label={STATS.summary.plays} value={result.playCount} />
        <StatCard label={STATS.summary.turns} value={result.turnCount} />
        <StatCard label={STATS.summary.accuracy} value={total('accuracy')} />
        <StatCard label={STATS.summary.points} value={total('points')} />
      </div>
    </div>
  )
}

/**
 * The chart, with the picker for the column it draws in its own header, at
 * the end of the caption's row — the control sits on what it changes, not on a
 * row of its own above it (P20 review). The kind is read off the answer, not
 * the filter bar, so while the next answer loads the picture stays the one of
 * the rows it is drawn from.
 */
function Chart({ result, charted, onChart }: { result: StatsResult; charted: StatsMetric | null; onChart: (metric: StatsMetric) => void }) {
  const kind = chartKind(result)
  // A column unticked since it was picked falls back to the first.
  const metricIndex = Math.max(0, charted ? result.metrics.indexOf(charted) : 0)
  // The verdicts stack draws three columns at once: there is nothing to pick.
  // The caption beside it already names the column, so the picker's label is
  // its accessible name only.
  const picker =
    kind === 'verdicts' ? null : (
      <SelectField
        label={STATS.chart.metric}
        hideLabel
        className="w-48"
        value={result.metrics[metricIndex] ?? null}
        onChange={onChart}
        options={result.metrics.map((metric) => ({ value: metric, label: STATS.metrics[metric] ?? metric }))}
      />
    )
  return <StatsChart result={result} kind={kind} metricIndex={metricIndex} action={picker} />
}

/**
 * The picture of what is grouped: a ranking of teams or domains, verdicts
 * stacked when the team rows carry both Correct and Wrong, a line over days,
 * bars in band order for difficulty, and plain bars for anything else.
 */
function chartKind(result: StatsResult): ChartKind {
  switch (result.groupBy) {
    case 'team':
      return stacksVerdicts(result.groupBy, result.metrics) ? 'verdicts' : 'ranking'
    case 'domain':
      return 'ranking'
    case 'day':
      return 'timeline'
    case 'difficulty':
      return 'bands'
    default:
      return 'bars'
  }
}

/** The one rule for the verdicts stack, read by the query and by the chart. */
function stacksVerdicts(groupBy: StatsDimension, metrics: readonly StatsMetric[]): boolean {
  return groupBy === 'team' && metrics.includes('correct') && metrics.includes('incorrect')
}

/**
 * What the query asks for: the chosen columns, and Partial with them whenever
 * the chart will be the verdicts stack. Without it a game with partial credit
 * stacks short of its turns, and the chart has a verdict it cannot count.
 */
function askedFor(groupBy: StatsDimension, metrics: readonly StatsMetric[]): readonly StatsMetric[] {
  if (!stacksVerdicts(groupBy, metrics) || metrics.includes('partial')) return metrics
  return ALL_METRICS.filter((metric) => metric === 'partial' || metrics.includes(metric))
}

/**
 * The answer as the table and the cards show it: the columns the operator
 * chose. The one column the page adds itself — Partial, for the stack — is
 * the chart's, and stays out unless it was chosen too.
 */
function chosenOf(result: StatsResult, metrics: readonly StatsMetric[]): StatsResult {
  const index = result.metrics.indexOf('partial')
  if (index < 0 || metrics.includes('partial')) return result
  const without = (row: StatsRow): StatsRow => ({ ...row, values: row.values.filter((_, i) => i !== index) })
  return {
    ...result,
    metrics: result.metrics.filter((_, i) => i !== index),
    rows: result.rows.map(without),
    totals: without(result.totals),
  }
}
