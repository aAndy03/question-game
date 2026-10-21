import { Tabs } from '@heroui/react'
import { PageHeader, ViewSwitch } from '@/molecules'
import { AllDataStats, LiveStats } from '@/organisms'
import { SettingsLayout } from '@/templates'
import { useChromeStore, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { TABS } from '@/copy'
import { STATS } from '@/copy/stats'
import { useCurrentWorkspaceId } from '@/host/queries'

export type StatsView = 'live' | 'all'

export interface StatisticsPageProps {
  /** The route's view; wins over the remembered one so a link can deep-link. */
  view?: StatsView | undefined
  /**
   * Where a view switch goes. The tab writes it to the route; the Statistics
   * window (§13.3) keeps it in its own state, because it has no route stack.
   */
  onView?: ((view: StatsView) => void) | undefined
  /** `window`: no sidebar behind it, so the empty state offers no way out. */
  surface?: 'tab' | 'window' | undefined
}

const VIEWS: readonly StatsView[] = ['live', 'all']

/**
 * Statistics — Live | All data (§11.K, 05_STUDIO_DESIGN.md §13.2).
 *
 * A projector, and the whole page proves it: nothing here or below it imports
 * the command hook, because Statistics has no write verb to call. The layout
 * is the Settings one — header, inner tabs, one scrolling column — since the
 * shape is the same and a second template would be a second thing to keep in
 * step.
 */
export function StatisticsPage({ view, onView, surface = 'tab' }: StatisticsPageProps) {
  const go = useNavStore((s) => s.go)
  const replace = useNavStore((s) => s.replace)
  // Older persisted documents predate the Statistics tab's view key.
  const listView = usePrefs().view['statistics'] ?? 'table'
  const setListView = useChromeStore((s) => s.setView)
  const selected: StatsView = view ?? 'live'
  const workspace = useCurrentWorkspaceId()

  return (
    <SettingsLayout
      width="wide"
      header={<PageHeader title={TABS.statistics.label} description={TABS.statistics.hint} />}
      tabs={
        <div className="flex items-end justify-between gap-4">
          <Tabs
            variant="secondary"
            selectedKey={selected}
            onSelectionChange={(key) => {
              if (typeof key === 'string' && (VIEWS as readonly string[]).includes(key)) {
                const next = key as StatsView
                if (onView) onView(next)
                else replace({ tab: 'statistics', view: next })
              }
            }}
          >
            <Tabs.ListContainer>
              <Tabs.List aria-label={TABS.statistics.label}>
                {VIEWS.map((id) => (
                  <Tabs.Tab key={id} id={id}>
                    {id === 'live' ? STATS.views.live : STATS.views.all}
                    <Tabs.Indicator />
                  </Tabs.Tab>
                ))}
              </Tabs.List>
            </Tabs.ListContainer>
          </Tabs>
          {selected === 'all' ? (
            <div className="pb-2">
              <ViewSwitch value={listView} onChange={(next) => setListView('statistics', next)} />
            </div>
          ) : null}
        </div>
      }
    >
      {/* Keyed on the workspace: a filter naming the last one's games, teams and domains goes with it (beta.2). */}
      {selected === 'live' ? (
        <LiveStats key={workspace ?? 'none'} {...(surface === 'tab' ? { onGoToControl: () => void go({ tab: 'control' }) } : {})} />
      ) : (
        <AllDataStats key={workspace ?? 'none'} view={listView} />
      )}
    </SettingsLayout>
  )
}
