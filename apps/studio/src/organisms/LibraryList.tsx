import { useMemo, useRef, useState, type ReactNode } from 'react'
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { Skeleton } from '@/atoms'
import { BulkBar, EmptyState, RecordRow, type RecordLayout } from '@/molecules'
import { LIST } from '@/copy'

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
  /** Sort keys the toolbar may pick. */
  readonly sort: Readonly<Record<string, string | number>>
}

export interface LibraryListProps {
  rows: readonly RecordView[] | undefined
  isLoading: boolean
  error?: string | null | undefined
  layout: RecordLayout
  /** The plural noun for empty states. */
  what: string
  /** Which empty state applies when there are no rows. */
  emptyKind: 'empty' | 'noResults' | 'archivedEmpty'
  emptyAction?: ReactNode
  sortBy?: string | undefined
  sortDesc?: boolean | undefined
  currentId?: string | null | undefined
  onOpen?: ((id: string) => void) | undefined
  actions?: ((row: RecordView) => ReactNode) | undefined
  /** Enables selection and the bulk bar. */
  bulk?:
    | {
        mode: 'archive' | 'restore'
        onArchive?: ((ids: readonly string[]) => void) | undefined
        onRestore?: ((ids: readonly string[]) => void) | undefined
        isPending?: boolean | undefined
      }
    | undefined
  onRetry?: (() => void) | undefined
}

const VIRTUAL_ABOVE = 200

/**
 * Every record list: TanStack Table for sorting and selection, `RecordRow`
 * in grid or table layout, virtualised above 200 rows, `Skeleton` while
 * loading, the four `EmptyState`s, one `BulkBar` (05_STUDIO_DESIGN.md §4.3).
 */
export function LibraryList({
  rows,
  isLoading,
  error,
  layout,
  what,
  emptyKind,
  emptyAction,
  sortBy = 'title',
  sortDesc = false,
  currentId,
  onOpen,
  actions,
  bulk,
  onRetry,
}: LibraryListProps) {
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({})
  const sorting = useMemo<SortingState>(() => [{ id: sortBy, desc: sortDesc }], [sortBy, sortDesc])

  const columns = useMemo<ColumnDef<RecordView>[]>(
    () => [
      { id: 'title', accessorFn: (r) => r.title.toLowerCase() },
      ...Object.keys(rows?.[0]?.sort ?? {}).map((key) => ({
        id: key,
        accessorFn: (r: RecordView) => r.sort[key] ?? '',
      })),
    ],
    [rows],
  )

  const table = useReactTable({
    data: (rows ?? []) as RecordView[],
    columns,
    state: { sorting, rowSelection },
    onRowSelectionChange: setRowSelection,
    getRowId: (r) => r.id,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableRowSelection: bulk !== undefined,
  })

  const sorted = table.getRowModel().rows
  const selectedIds = Object.keys(rowSelection).filter((id) => rowSelection[id])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const virtual = sorted.length > VIRTUAL_ABOVE && layout === 'table'
  const virtualizer = useVirtualizer({
    // `enabled` matters more than `count`. A disabled virtualizer observes
    // nothing; an enabled one asks `getScrollElement()` on every render and
    // sets up observers around whatever it gets — including `null`, which is
    // what this ref is on every branch that does not render the list. Two of
    // those branches are the ordinary ones (loading, and an empty archive), so
    // the common case was handing an observer an element that does not exist.
    enabled: virtual,
    count: virtual ? sorted.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 40,
    overscan: 12,
  })

  // The number is the row's place in the list as it stands — filtered, sorted,
  // and counted from one. It is not an id: an archived row does not keep a
  // number to come back to, it takes the next one in whatever list it lands in.
  const render = (row: (typeof sorted)[number], position: number) => (
    <RecordRow
      key={row.id}
      layout={layout}
      index={layout === 'table' ? position + 1 : undefined}
      leading={row.original.leading}
      title={row.original.title}
      subtitle={row.original.subtitle}
      chips={row.original.chips}
      meta={row.original.meta}
      actions={actions ? actions(row.original) : null}
      isArchived={row.original.isArchived}
      isOverridden={row.original.isOverridden}
      isCurrent={currentId === row.id}
      isSelected={row.getIsSelected()}
      onSelectChange={bulk ? (on) => row.toggleSelected(on) : undefined}
      onOpen={onOpen ? () => onOpen(row.id) : undefined}
    />
  )

  /**
   * Skeleton, empty, error and the list itself are all *inside* the scroll
   * box rather than instead of it. The box is the list's shape, so it should
   * not appear and disappear underneath the operator as rows arrive — and the
   * ref the virtualizer is pointed at stays mounted for the life of the list
   * instead of going null on every state that is not "rows".
   */
  const body = () => {
    if (isLoading && !rows) return <Skeleton shape={layout === 'grid' ? 'card' : 'row'} count={layout === 'grid' ? 4 : 8} />
    if (error) return <EmptyState kind="error" what={what} detail={error} action={onRetry ? <RetryButton onRetry={onRetry} /> : null} />
    if (!rows || rows.length === 0) return <EmptyState kind={emptyKind} what={what} action={emptyAction} />
    if (layout === 'grid') {
      return <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">{sorted.map((row, i) => render(row, i))}</div>
    }
    if (virtual) {
      return (
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = sorted[item.index]
            if (!row) return null
            return (
              <div key={row.id} style={{ position: 'absolute', top: 0, left: 0, right: 0, transform: `translateY(${item.start}px)` }}>
                {render(row, item.index)}
              </div>
            )
          })}
        </div>
      )
    }
    // `overflow-hidden` is what makes a row's hover and selection respect the
    // container's rounded corners: without it the first and last rows paint
    // square over them.
    return (
      <div className="overflow-hidden rounded-[var(--radius)] border border-[var(--border)]" style={{ background: 'var(--surface)' }}>
        {sorted.map((row, i) => render(row, i))}
      </div>
    )
  }

  const hasRows = Boolean(rows && rows.length > 0)
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {bulk ? (
        <BulkBar
          count={selectedIds.length}
          mode={bulk.mode}
          onArchive={bulk.onArchive ? () => bulk.onArchive?.(selectedIds) : undefined}
          onRestore={bulk.onRestore ? () => bulk.onRestore?.(selectedIds) : undefined}
          onClear={() => setRowSelection({})}
          isPending={bulk.isPending}
        />
      ) : null}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
        role={layout === 'table' && hasRows ? 'table' : undefined}
      >
        {body()}
      </div>
    </div>
  )
}

function RetryButton({ onRetry }: { onRetry: () => void }) {
  return (
    <button
      type="button"
      onClick={onRetry}
      className="rounded-[var(--radius)] border border-[var(--border)] px-3 py-1.5 text-sm hover:bg-[var(--surface-secondary)]"
    >
      {LIST.retry}
    </button>
  )
}
