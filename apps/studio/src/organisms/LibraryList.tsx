import { useEffect, useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { CheckboxField, Skeleton } from '@/atoms'
import { BulkBar, EmptyState, GroupHeader, PageFooter, RecordRow, type RecordLayout } from '@/molecules'
import { LIST } from '@/copy'
import { crumb } from '@/chrome/diagnostics'
import { footerText, isActive, type ListEntry } from '@/host/listView'
import type { ListViewApi } from '@/host/useListView'
import type { ArchiveScope } from '@/host/types'

/**
 * What a record list needs from a row to draw it. Each tab maps its entity to
 * this once; `LibraryList` never learns the entity.
 */
export interface RecordView {
  readonly id: string
  readonly title: string
  readonly subtitle?: string | undefined
  readonly leading?: ReactNode
  readonly chips?: ReactNode
  readonly meta?: readonly ReactNode[] | undefined
  readonly isArchived?: boolean | undefined
  readonly isOverridden?: boolean | undefined
}

/** A table column the header row can sort by. */
export interface ListColumn {
  readonly sortId: string
  readonly label: string
}

export interface LibraryListProps {
  /** The tab's list view (`useListView`): what is shown, and the selection. */
  view: ListViewApi<unknown, RecordView>
  /** How many rows the host sent before any filter; `undefined` while loading. */
  total: number | undefined
  /** The Status in force, for the empty states. */
  scope: ArchiveScope
  isLoading: boolean
  error?: string | null | undefined
  layout: RecordLayout
  /** The plural noun for empty states. */
  what: string
  /** The `empty` state's action — usually *New*. */
  emptyAction?: ReactNode
  /** The filter (and its value) whose empty result is `allComplete`, not `noResults`. */
  allCompleteWhen?: { readonly id: string; readonly value: string } | undefined
  /** Table header row: the title column and one per meta cell, `null` where a cell does not sort. */
  columns?: { readonly title: ListColumn; readonly meta: readonly (ListColumn | null)[]; readonly lead?: string | undefined } | undefined
  currentId?: string | null | undefined
  onOpen?: ((id: string) => void) | undefined
  /** A click on the list's empty space: the page closes its opened row (1.1.1). */
  onDismiss?: (() => void) | undefined
  actions?: ((row: RecordView) => ReactNode) | undefined
  /** Enables selection and the bulk bar. */
  bulk?:
    | {
        onArchive?: ((ids: readonly string[]) => void) | undefined
        onRestore?: ((ids: readonly string[]) => void) | undefined
        isPending?: boolean | undefined
      }
    | undefined
  onRetry?: (() => void) | undefined
}

const VIRTUAL_ABOVE = 200

/**
 * A table's meta column only where the list is wide enough for it (1.1.1):
 * the first from 36rem, the rest from 48rem — the title keeps its room.
 * The same rule for a row's cell and its column's heading.
 */
export const metaFits = (i: number): string => (i === 0 ? 'hidden @xl/list:block' : 'hidden @3xl/list:block')

/**
 * Every record list (05_STUDIO_DESIGN.md §4.3, §20): the list view's page —
 * group headers, rows in grid or table layout, a sortable header row in
 * table view — the page footer, the bulk bar, `Skeleton` while loading, the
 * empty states. Filtering, sorting, grouping, paging and selection are the
 * list view's (`useListView`); this only draws them, so there is no second
 * copy of any of them here — which is also why TanStack Table is gone: its
 * row model was a second sort, and its auto-reset was the P11.3 freeze.
 * Virtualised over 200 entries in table view, which only page size *All*
 * reaches.
 */
export function LibraryList({
  view,
  total,
  scope,
  isLoading,
  error,
  layout,
  what,
  emptyAction,
  allCompleteWhen,
  columns,
  currentId,
  onOpen,
  onDismiss,
  actions,
  bulk,
  onRetry,
}: LibraryListProps) {
  const { page, selection, state } = view
  const where = `${what} rows=${total ?? 'none'} layout=${layout}`
  crumb('list:enter', where)
  const entries = page.entries
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtual = entries.length > VIRTUAL_ABOVE && layout === 'table'
  const virtualizer = useVirtualizer({
    // A disabled virtualizer observes nothing; see the P11.3 notes in git.
    enabled: virtual,
    count: virtual ? entries.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  })

  // A new page starts at its top, not where the last one was scrolled to.
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0
  }, [page.page])

  const offset = page.from > 0 ? page.from - 1 : 0
  // How many rows precede each entry, once per page, for the virtual branch's numbering.
  const rowsBefore: number[] = []
  if (virtual) {
    let n = 0
    for (const e of entries) {
      rowsBefore.push(n)
      if (e.kind === 'row') n += 1
    }
  }
  let position = 0
  const draw = (entry: ListEntry<unknown, RecordView>) => {
    if (entry.kind === 'header') {
      const g = entry.group
      return <GroupHeader key={`#${g.key}`} label={g.label} count={g.count} continued={g.continued} collapsed={g.collapsed} onToggle={() => view.toggleCollapsed(g.key)} />
    }
    const { row } = entry
    const record = row.item.view
    position += 1
    return (
      <RecordRow
        key={row.key}
        layout={layout}
        index={layout === 'table' ? offset + position : undefined}
        leading={record.leading}
        title={record.title}
        subtitle={record.subtitle}
        note={row.alsoIn.length > 0 ? LIST.alsoIn(row.alsoIn) : undefined}
        chips={record.chips}
        meta={record.meta}
        actions={actions ? actions(record) : null}
        isArchived={record.isArchived}
        isOverridden={record.isOverridden}
        isCurrent={currentId === row.item.id}
        isSelected={selection.ids.has(row.item.id)}
        onSelectChange={bulk ? () => selection.toggle(row.item.id) : undefined}
        onOpen={onOpen ? () => onOpen(row.item.id) : undefined}
      />
    )
  }

  const searching = view.searching
  const filtering = view.activeFilters.length > 0
  const empty = () => {
    if (!total) return <EmptyState kind={scope === 'archived' ? 'archivedEmpty' : 'empty'} what={what} action={scope === 'archived' ? null : emptyAction} />
    const onlyComplete =
      allCompleteWhen !== undefined && !searching && view.activeFilters.length === 1 && state.filters[allCompleteWhen.id] === allCompleteWhen.value
    if (onlyComplete) return <EmptyState kind="allComplete" what={what} />
    return (
      <EmptyState
        kind="noResults"
        what={what}
        action={
          <div className="flex gap-2">
            {searching ? <TextButton onPress={() => view.setSearch('')}>{LIST.clearSearch}</TextButton> : null}
            {filtering ? <TextButton onPress={view.clearFilters}>{LIST.clearFilters}</TextButton> : null}
          </div>
        }
      />
    )
  }

  const header = () => {
    if (layout !== 'table' || columns === undefined) return null
    const pageAll = page.pageIds.length > 0 && page.pageIds.every((id) => selection.ids.has(id))
    const pageSome = page.pageIds.some((id) => selection.ids.has(id))
    return (
      <div className="sticky top-0 z-10 flex h-9 items-center gap-3 border-b border-[var(--border)] px-3 text-xs" style={{ background: 'var(--surface)' }} data-list-header>
        {bulk ? (
          <CheckboxField
            label={LIST.selectAll}
            hideLabel
            isSelected={pageAll}
            isIndeterminate={!pageAll && pageSome}
            onChange={(on) => (on ? selection.selectPage() : selection.deselectPage())}
          />
        ) : null}
        <span className="w-7 shrink-0" />
        {/* The rows' leading mark (an avatar, a difficulty) sits before the title. */}
        <span data-lead className={`${columns.lead ?? 'w-6'} shrink-0`} />
        <div className="min-w-0 flex-1">
          <SortHeader column={columns.title} view={view} align="left" />
        </div>
        {columns.meta.map((c, i) => (
          <div key={c?.sortId ?? `m${i}`} className={`${metaFits(i)} w-28 shrink-0 text-right`}>
            {c ? <SortHeader column={c} view={view} align="right" /> : null}
          </div>
        ))}
        {actions ? <span className="w-8 shrink-0" /> : null}
      </div>
    )
  }

  const body = () => {
    if (isLoading && total === undefined) return <Skeleton shape={layout === 'grid' ? 'card' : 'row'} count={layout === 'grid' ? 4 : 8} />
    if (error) return <EmptyState kind="error" what={what} detail={error} action={onRetry ? <TextButton onPress={onRetry}>{LIST.retry}</TextButton> : null} />
    if (entries.length === 0) return empty()
    if (layout === 'grid') {
      const out: ReactNode[] = []
      let cards: ReactNode[] = []
      const flush = () => {
        if (cards.length > 0) out.push(<div key={`g${out.length}`} className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">{cards}</div>)
        cards = []
      }
      for (const e of entries) {
        if (e.kind === 'header') {
          flush()
          out.push(draw(e))
        } else cards.push(draw(e))
      }
      flush()
      return <div className="flex flex-col gap-3">{out}</div>
    }
    if (virtual) {
      return (
        <div className="rounded-[var(--radius)] border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
          {header()}
          <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index]
            if (!entry) return null
            position = rowsBefore[item.index] ?? 0
            return (
              <div key={entry.kind === 'row' ? entry.row.key : `#${entry.group.key}`} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}>
                {draw(entry)}
              </div>
            )
          })}
          </div>
        </div>
      )
    }
    // `overflow-hidden` keeps hover and selection inside the rounded corners.
    return (
      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        {header()}
        {entries.map(draw)}
      </div>
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {bulk ? (
        <BulkBar
          count={selection.ids.size}
          onPage={selection.onPage}
          archive={bulk.onArchive ? { count: view.bulk.archive.length, run: () => bulk.onArchive?.(view.bulk.archive) } : undefined}
          restore={bulk.onRestore ? { count: view.bulk.restore.length, run: () => bulk.onRestore?.(view.bulk.restore) } : undefined}
          selectAll={{ count: page.selectableIds.length, run: selection.selectAll }}
          onClear={selection.clear}
          isPending={bulk.isPending}
        />
      ) : null}
      {/* No table role: rows open records and groups have headings, which a table could not hold. */}
      <div
        ref={scrollRef}
        // The list's own width decides which table columns fit (1.1.1): beside
        // the domains pane and an opened row it can be 25rem wide.
        className="@container/list min-h-0 flex-1 overflow-y-auto"
        data-list-body
        onClick={(e) => {
          // Empty space: not a row, a header, a control or a link.
          if (!onDismiss) return
          const hit = (e.target as HTMLElement).closest('[role="button"], [role="row"], [role="heading"], button, a, input, label, [data-list-header]')
          if (!hit) onDismiss()
        }}
      >
        {body()}
      </div>
      <PageFooter
        page={page.page}
        pageCount={page.pageCount}
        text={footerText(page, view.spec.noun)}
        pageSize={state.pageSize}
        onPage={view.setPage}
        onPageSize={view.setPageSize}
      />
    </div>
  )
}

function SortHeader({ column, view, align }: { column: ListColumn; view: ListViewApi<unknown, RecordView>; align: 'left' | 'right' }) {
  const on = view.state.sort.id === column.sortId
  const desc = on && view.state.sort.desc
  return (
    <span className={align === 'right' ? 'block text-right' : 'block'}>
      <button
        type="button"
        aria-pressed={on}
        aria-label={LIST.sortByColumn(column.label, on ? (desc ? 'descending' : 'ascending') : null)}
        className="rounded px-1 font-medium text-[var(--muted)] hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
        onClick={() => view.sortBy(column.sortId)}
      >
        {column.label}
        <span aria-hidden>{on ? (desc ? ' ↓' : ' ↑') : ''}</span>
      </button>
    </span>
  )
}

function TextButton({ onPress, children }: { onPress: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onPress} className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-secondary)]">
      {children}
    </button>
  )
}

/** Whether any filter of a view is on — for a page that needs to know. */
export const hasActive = isActive
