import { ActiveFilters, ArchiveToggle, FilterMenu, GroupMenu, SearchField, SortMenu, ViewSwitch, type ArchiveView } from '@/molecules'
import type { ViewMode } from '@/chrome/chrome'
import type { ListViewApi } from '@/host/useListView'

export interface ListToolbarProps {
  view: ListViewApi<unknown, unknown>
  /** Plural noun for the search placeholder. */
  what: string
  /** View and Status: a library tab's; a picker (beta.4) has neither. */
  layout?: ViewMode | undefined
  onLayout?: ((layout: ViewMode) => void) | undefined
  status?: ArchiveView | undefined
  onStatus?: ((status: ArchiveView) => void) | undefined
  /** A line in the Filters popover — the Questions tab's incomplete count. */
  filterHint?: string | undefined
  /** Before Search: the Questions tab's domain name. */
  lead?: React.ReactNode
}

/**
 * One toolbar for every library tab (stable 1.1, 05_STUDIO_DESIGN.md §4.6):
 * **Search · Filters · Sort · Group · View · Status**, then — in the page
 * header — New. One component on purpose: four hand-built toolbars are how
 * four tabs drift apart. The filters in force follow as a chip row.
 *
 * Two groups (P20): the left one wraps, View · Status never do — Status stays
 * at the top right at every width, where it used to be the first thing to drop
 * to a second line. The DOM order is the toolbar order.
 */
export function ListToolbar({ view, what, layout, onLayout, status, onStatus, filterHint, lead }: ListToolbarProps) {
  const { spec, state } = view
  const viewSwitch = layout && onLayout ? <ViewSwitch value={layout} onChange={onLayout} /> : null
  const statusTabs = status && onStatus ? <ArchiveToggle value={status} onChange={onStatus} withAll /> : null
  return (
    <div className="flex flex-col gap-2" data-list-toolbar>
      <div className="flex items-start gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {lead}
          <SearchField what={what} onSearch={view.setSearch} initial={state.search} className="w-64 min-w-40" />
          <FilterMenu
            filters={spec.filters}
            values={state.filters}
            changed={state.changed}
            onChange={view.setFilter}
            onChanged={view.setChanged}
            activeCount={view.activeFilters.length}
            hint={filterHint}
          />
          <SortMenu
            sorts={spec.sorts}
            value={state.sort}
            onField={view.sortBy}
            onDirection={(desc) => view.setSort({ id: state.sort.id, desc })}
            showMatch={view.searching && state.sort.id === 'match'}
          />
          <GroupMenu groups={spec.groups} value={state.group} onChange={view.setGroup} />
        </div>
        {viewSwitch || statusTabs ? (
          <div className="flex shrink-0 items-center gap-2">
            {viewSwitch}
            {statusTabs}
          </div>
        ) : null}
      </div>
      <ActiveFilters items={view.activeFilters} onRemove={(id) => (id === 'changed' ? view.setChanged('any') : view.setFilter(id, null))} onClearAll={view.clearFilters} />
    </div>
  )
}
