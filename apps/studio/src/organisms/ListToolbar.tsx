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
    <div className="@container/toolbar flex flex-col gap-2" data-list-toolbar data-density="compact">
      {/*
        One row on a wide list. On a narrow one (a row open beside it, a small
        window) the tools share their row with View · Status and every button
        wrapped alone, four rows high (P20, the Beta library at 1100px): there
        the lead and View · Status take the first row and the tools the whole
        width under it. CSS order only — the DOM, and the tab order, stay.
      */}
      <div className="flex flex-wrap items-center gap-2 @[48rem]/toolbar:flex-nowrap @[48rem]/toolbar:items-start">
        {lead ? <div className="min-w-0 shrink">{lead}</div> : null}
        <div className="order-3 flex w-full min-w-0 flex-wrap items-center gap-2 @[48rem]/toolbar:order-none @[48rem]/toolbar:w-auto @[48rem]/toolbar:flex-1">
          <SearchField what={what} onSearch={view.setSearch} initial={state.search} className="w-64 min-w-40" />
          <FilterMenu
            filters={spec.filters}
            values={state.filters}
            changed={spec.changedAt ? state.changed : undefined}
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
          <div className="order-2 ml-auto flex shrink-0 items-center gap-2 @[48rem]/toolbar:order-none">
            {viewSwitch}
            {statusTabs}
          </div>
        ) : null}
      </div>
      <ActiveFilters items={view.activeFilters} onRemove={(id) => (id === 'changed' ? view.setChanged('any') : view.setFilter(id, null))} onClearAll={view.clearFilters} />
    </div>
  )
}
