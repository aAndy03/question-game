import type { ReactNode } from 'react'
import { Disclosure, buttonVariants } from '@heroui/react'
import { Button, CheckboxField, Panel, SelectField, Text, type SelectOption } from '@/atoms'
import { STATS } from '@/copy/stats'
import type { StatsDimension, StatsFilter, StatsMetric } from '@/host/types'

/** The named time windows §11.K's "time" filter offers. */
export type TimeWindow = 'all' | 'last7' | 'last30' | 'thisYear'

export interface StatsFilterBarProps {
  filter: StatsFilter
  onFilter: (filter: StatsFilter) => void
  time: TimeWindow
  onTime: (time: TimeWindow) => void
  groupBy: StatsDimension
  onGroupBy: (dimension: StatsDimension) => void
  metrics: readonly StatsMetric[]
  onMetrics: (metrics: readonly StatsMetric[]) => void
  /** Catalog options; the page supplies them, a molecule never fetches. */
  games: readonly SelectOption<string>[]
  teams: readonly SelectOption<string>[]
  domains: readonly SelectOption<string>[]
  /** Every column the picker may offer, in host order. */
  allMetrics: readonly StatsMetric[]
  /**
   * The columns *Clear filters* goes back to (P20). Columns that differ count
   * on the closed *More options*; without this, columns never count.
   */
  defaultMetrics?: readonly StatsMetric[] | undefined
  onClear: () => void
  isDirty: boolean
}

const ANY = '__any'

/**
 * §11.K's compound filter, as one bar: time, then the variables, then what a
 * row means. Filters intersect — that is the host's rule
 * (`StatsFilter::keeps`), and this only builds the document.
 *
 * Every control is single-select on purpose: the host takes a list per
 * variable, but a bar of multi-selects is a query builder, and §13.6 keeps
 * saved queries out of v1. One of each is what the two views actually ask.
 *
 * P20: what is asked least — the columns, rehearsals, every workspace — waits
 * behind *More options*, so the bar is one row and the chart is what the page
 * leads with. A hidden filter is never invisible: the closed button counts
 * what is set inside it (pinned decision 6).
 */
export function StatsFilterBar({
  filter,
  onFilter,
  time,
  onTime,
  groupBy,
  onGroupBy,
  metrics,
  onMetrics,
  games,
  teams,
  domains,
  allMetrics,
  defaultMetrics,
  onClear,
  isDirty,
}: StatsFilterBarProps) {
  const one = (values: readonly string[] | undefined) => values?.[0] ?? ANY
  const set = (key: 'recipeIds' | 'teamIds' | 'domainIds', value: string) =>
    onFilter({ ...filter, [key]: value === ANY ? [] : [value] })
  const inside = countSetInside(filter, metrics, defaultMetrics)

  return (
    <div role="group" aria-label={STATS.filters.title} data-stats-filters>
      <Panel>
        <Disclosure className="flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <Cell>
              <SelectField
                label={STATS.filters.time}
                value={time}
                onChange={(value) => onTime(value)}
                options={[
                  { value: 'all', label: STATS.filters.allTime },
                  { value: 'last7', label: STATS.filters.last7 },
                  { value: 'last30', label: STATS.filters.last30 },
                  { value: 'thisYear', label: STATS.filters.thisYear },
                ]}
              />
            </Cell>
            <Cell>
              <SelectField
                label={STATS.filters.game}
                value={one(filter.recipeIds)}
                onChange={(value) => set('recipeIds', value)}
                options={[{ value: ANY, label: STATS.filters.anyGame }, ...games]}
              />
            </Cell>
            <Cell>
              <SelectField
                label={STATS.filters.team}
                value={one(filter.teamIds)}
                onChange={(value) => set('teamIds', value)}
                options={[{ value: ANY, label: STATS.filters.anyTeam }, ...teams]}
              />
            </Cell>
            <Cell>
              <SelectField
                label={STATS.filters.domain}
                value={one(filter.domainIds)}
                onChange={(value) => set('domainIds', value)}
                options={[{ value: ANY, label: STATS.filters.anyDomain }, ...domains]}
              />
            </Cell>
            <Cell>
              <SelectField
                label={STATS.filters.verdict}
                value={filter.verdicts?.[0] ?? ANY}
                onChange={(value) =>
                  onFilter({ ...filter, verdicts: value === ANY ? [] : [value as 'correct' | 'incorrect' | 'partial'] })
                }
                options={[
                  { value: ANY, label: STATS.filters.anyVerdict },
                  { value: 'correct', label: STATS.verdicts['correct'] ?? 'Correct' },
                  { value: 'incorrect', label: STATS.verdicts['incorrect'] ?? 'Wrong' },
                  { value: 'partial', label: STATS.verdicts['partial'] ?? 'Partial' },
                ]}
              />
            </Cell>
            <Cell>
              <SelectField
                label={STATS.filters.groupBy}
                value={groupBy}
                onChange={(value) => onGroupBy(value)}
                options={(
                  [...['team', 'domain', 'question', 'difficulty', 'operator', 'recipe', 'play', 'day'], ...(filter.allWorkspaces ? ['workspace'] : [])] as StatsDimension[]
                ).map((value) => ({ value, label: STATS.dimensions[value] ?? value }))}
              />
            </Cell>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              {/* A HeroUI button's look on the disclosure's own trigger: the
                  `Button` atom cannot take the trigger slot that carries
                  `aria-expanded` and `aria-controls`. */}
              <Disclosure.Trigger className={buttonVariants({ variant: 'secondary', size: 'sm' })}>
                {inside > 0 ? STATS.filters.moreOptionsSet(inside) : STATS.filters.moreOptions}
                <Disclosure.Indicator />
              </Disclosure.Trigger>
              <Button size="sm" variant="ghost" icon="restore" onPress={onClear} isDisabled={!isDirty}>
                {STATS.filters.clear}
              </Button>
            </div>
          </div>
          <Disclosure.Content>
            <Disclosure.Body className="flex flex-col gap-3 border-t border-[var(--separator)] pt-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <Text variant="studio-caption" tone="muted">
                  {STATS.filters.columns}
                </Text>
                {allMetrics.map((metric) => (
                  <CheckboxField
                    key={metric}
                    label={STATS.metrics[metric] ?? metric}
                    isSelected={metrics.includes(metric)}
                    onChange={(on) =>
                      onMetrics(on ? [...allMetrics.filter((m) => m === metric || metrics.includes(m))] : metrics.filter((m) => m !== metric))
                    }
                    // One column has to survive: an empty table says nothing.
                    isDisabled={metrics.length === 1 && metrics.includes(metric)}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-x-8 gap-y-3">
                <div className="flex flex-col gap-0.5">
                  <CheckboxField
                    label={STATS.filters.rehearsals}
                    isSelected={Boolean(filter.includeRehearsal)}
                    onChange={(on) => onFilter({ ...filter, includeRehearsal: on })}
                  />
                  <Text variant="studio-caption" tone="muted">
                    {STATS.filters.rehearsalsHint}
                  </Text>
                </div>
                <div className="flex flex-col gap-0.5">
                  <CheckboxField
                    label={STATS.filters.allWorkspaces}
                    isSelected={Boolean(filter.allWorkspaces)}
                    onChange={(on) => {
                      onFilter({ ...filter, allWorkspaces: on })
                      // By workspace means nothing inside one: back to teams (beta.5).
                      if (!on && groupBy === 'workspace') onGroupBy('team')
                    }}
                  />
                  <Text variant="studio-caption" tone="muted">
                    {STATS.filters.allWorkspacesHint}
                  </Text>
                </div>
              </div>
            </Disclosure.Body>
          </Disclosure.Content>
        </Disclosure>
      </Panel>
    </div>
  )
}

/** One select's share of the row: they split it evenly, and wrap before they squeeze. */
function Cell({ children }: { children: ReactNode }) {
  return <div className="min-w-[7rem] max-w-[16rem] flex-1 basis-[7rem]">{children}</div>
}

/**
 * How many things *More options* hides that are not at their default: each
 * of rehearsals, every workspace and the columns counts once.
 */
function countSetInside(filter: StatsFilter, metrics: readonly StatsMetric[], defaultMetrics: readonly StatsMetric[] | undefined): number {
  const columns = defaultMetrics !== undefined && (metrics.length !== defaultMetrics.length || metrics.some((m) => !defaultMetrics.includes(m)))
  return (filter.includeRehearsal ? 1 : 0) + (filter.allWorkspaces ? 1 : 0) + (columns ? 1 : 0)
}

/** The `from`/`to` of a named window, at `now`. `all` filters nothing. */
export function windowBounds(time: TimeWindow, now: number): { fromMs: number | null; toMs: number | null } {
  const day = 86_400_000
  switch (time) {
    case 'last7':
      return { fromMs: now - 7 * day, toMs: null }
    case 'last30':
      return { fromMs: now - 30 * day, toMs: null }
    case 'thisYear':
      return { fromMs: Date.UTC(new Date(now).getUTCFullYear(), 0, 1), toMs: null }
    default:
      return { fromMs: null, toMs: null }
  }
}
