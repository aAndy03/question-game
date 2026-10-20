import { ActiveFilters, ArchiveToggle, FilterMenu, GroupMenu, SearchField, SortMenu, ViewSwitch, type ArchiveView } from '@/molecules'
import type { ViewMode } from '@/chrome/chrome'
import type { ListViewApi } from '@/host/useListView'

export interface ListToolbarProps {
  view: ListViewApi<unknown, unknown>
  /** Plural noun for the search placeholder. */
  what: string
  layout: ViewMode
  onLayout(layout: ViewMode): void
  status: ArchiveView
  onStatus(status: ArchiveView): void
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
 */
export function ListToolbar({ view, what, layout, onLayout, status, onStatus, filterHint, lead }: ListToolbarProps) {
  const { spec, state } = view
  return (
    <div className="flex flex-col gap-2" data-list-toolbar>
      <div className="flex flex-wrap items-center gap-2">
        {lead}
        <SearchField what={what} onSearch={view.setSearch} initial={state.search} className="w-64" />
        <FilterMenu
          filters={spec.filters}
          values={state.filters}
          changed={state.changed}
          onChange={view.setFilter}
          onChanged={view.setChanged}
          activeCount={view.activeFilters.length}
          hint={filterHint}
        />
        <SortMenu sorts={spec.sorts} value={state.sort} onChange={view.setSort} showMatch={view.searching && state.sort.id === 'match'} />
        <GroupMenu groups={spec.groups} value={state.group} onChange={view.setGroup} />
        <div className="flex-1" />
        <ViewSwitch value={layout} onChange={onLayout} />
        <ArchiveToggle value={status} onChange={onStatus} withAll />
      </div>
      <ActiveFilters items={view.activeFilters} onRemove={(id) => (id === 'changed' ? view.setChanged('any') : view.setFilter(id, null))} onClearAll={view.clearFilters} />
    </div>
  )
}
