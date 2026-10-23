import { useMemo, useRef, type MouseEvent, type ReactNode } from 'react'
import { CheckboxField, Text } from '@/atoms'
import { EmptyState, GroupHeader, PageFooter } from '@/molecules'
import { LIST, PICKER } from '@/copy'
import { useListState } from '@/chrome/chrome'
import { footerText, listView, rangeBetween, type ListItem, type ListSpec } from '@/host/listView'
import { useListView, type ListViewApi } from '@/host/useListView'
import { ListToolbar } from './ListToolbar'

/** What a picker row shows. */
export interface PickerRow {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly chips?: ReactNode
  /** Before the title: a row number, a mark. */
  readonly leading?: ReactNode
}

export interface PickListProps<T> {
  /** A picker spec (`tab: 'pick…'` or `importQuestions`): its own filters, groups and session view. */
  spec: ListSpec<T>
  items: readonly ListItem<T, PickerRow>[]
  /** What is ticked, in order. The list's own, not a library selection: no filter clears it. */
  chosen: readonly string[]
  onChosen: (update: (now: readonly string[]) => readonly string[]) => void
  /** Why a row cannot be ticked, given what is chosen so far — `null` when it can. */
  disabledReason?: ((id: string, chosen: ReadonlySet<string>) => string | null) | undefined
  /** The strip's count: "4 chosen", "1,003 of 1,048 rows will be imported". */
  count: string
  /** A row opens (the import dialog's row pane); the open one is marked. */
  onOpen?: ((id: string) => void) | undefined
  currentId?: string | null | undefined
  /** Short rows run in two columns where there is room (teams, domains). */
  columns?: 1 | 2 | undefined
  /** The words search folds over; a row's title and subtitle by default. */
  searchText?: ((item: ListItem<T, PickerRow>) => string) | undefined
  /** Under the strip, before the rows: a summary, a refusal. */
  above?: ReactNode
}

const fold = (s: string) => s.trim().toLowerCase()

/**
 * A choice of rows on the list-view model (beta.4, extracted P20): the library
 * toolbar's search, filters, sort and grouping, a checkbox per row, per group
 * and per page, pages of 100 — the picker's body, shared by `PickerDialog` and
 * the import dialog. Its chrome is pinned: the toolbar, the strip and the page
 * footer stay where they are and only the rows scroll. What is ticked survives
 * every filter, search and page.
 *
 * *Select all in a group* walks the group's rows across every page and re-asks
 * `disabledReason` after each tick, so one-per-difficulty holds inside the walk.
 */
export function PickList<T>({ spec, items, chosen, onChosen, disabledReason, count, onOpen, currentId, columns = 1, searchText, above }: PickListProps<T>) {
  const session = useListState(spec.tab)
  // Search here is the row's own words, folded — the catalog's index is not
  // asked about a list the dialog already holds.
  const hits = useMemo(() => {
    const needle = fold(session.search)
    if (!needle) return null
    const words = searchText ?? ((i: ListItem<T, PickerRow>) => `${i.view.title} ${i.view.subtitle ?? ''}`)
    return new Map(items.filter((i) => fold(words(i)).includes(needle)).map((i) => [i.id, 1]))
  }, [items, session.search, searchText])
  const view = useListView(spec, items, hits)
  const { page } = view

  const set = useMemo(() => new Set(chosen), [chosen])
  const reason = (id: string, within: ReadonlySet<string> = set) => (within.has(id) ? null : (disabledReason?.(id, within) ?? null))

  // Every row of every group, on every page: *select all in this group* means the whole group.
  const groupIds = useMemo(() => {
    const all = listView(items, spec, { ...view.state, page: 1, pageSize: 'all', collapsed: new Set() })
    const out = new Map<string, string[]>()
    for (const e of all.entries) if (e.kind === 'row') out.set(e.row.groupKey ?? '', [...(out.get(e.row.groupKey ?? '') ?? []), e.row.item.id])
    return out
  }, [items, spec, view.state])

  // Where Shift+click spans from: the last row ticked or unticked by hand (beta.8).
  const anchor = useRef<string | null>(null)
  const toggle = (id: string, on: boolean) => {
    anchor.current = id
    onChosen((now) => (on ? (now.includes(id) ? now : [...now, id]) : now.filter((x) => x !== id)))
  }
  /** Tick what can be ticked, in list order — each pick may close a difficulty for the next. */
  const tickAll = (ids: readonly string[]) =>
    onChosen((now) => {
      const next = [...now]
      const within = new Set(now)
      for (const id of ids) {
        if (within.has(id) || reason(id, within) !== null) continue
        next.push(id)
        within.add(id)
      }
      return next
    })
  /** Off, except what could not be ticked again — a chosen incomplete question stays (review). */
  const untickAll = (ids: readonly string[]) =>
    onChosen((now) => {
      const without = new Set(now.filter((x) => !ids.includes(x)))
      return now.filter((x) => !ids.includes(x) || disabledReason?.(x, without) != null)
    })
  /**
   * Ctrl/⌘+click and Shift+click (beta.8): the clicked row takes the other
   * state, and with Shift so does every row from the last one ticked to it, in
   * the view's order across pages — ticked the way *Select all* ticks, so a
   * row a pick blocks (another question at that difficulty) stays off.
   */
  const pick = (id: string, range: boolean) => {
    const on = !set.has(id)
    const span = range ? rangeBetween(page.selectableIds, anchor.current, id) : [id]
    anchor.current = id
    if (on) tickAll(span)
    else untickAll(span)
  }
  /** Checked when nothing more in it can be ticked; mixed when some is. */
  const groupCheckbox = (ids: readonly string[], label: string) => {
    const some = ids.some((id) => set.has(id))
    const full = some && ids.every((id) => set.has(id) || reason(id) !== null)
    const nothing = !some && ids.every((id) => reason(id) !== null)
    return (
      <CheckboxField
        label={label}
        hideLabel
        isSelected={full}
        isIndeterminate={some && !full}
        onChange={(on) => (on ? tickAll(ids) : untickAll(ids))}
        isDisabled={ids.length === 0 || nothing}
      />
    )
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="shrink-0">
        <ListToolbar view={view as ListViewApi<unknown, unknown>} what={spec.noun.many} />
      </div>
      <div className="flex shrink-0 items-center gap-2 px-2">
        {groupCheckbox(page.pageIds, LIST.selectAll)}
        <Text variant="studio-caption" tone="muted">
          {count}
        </Text>
      </div>
      {above}
      <div className="@container/picker min-h-0 flex-1 overflow-y-auto" data-pick-list>
        {page.entries.length === 0 ? (
          <EmptyState kind={items.length === 0 ? 'empty' : 'noResults'} what={spec.noun.many} compact />
        ) : (
          <ul className={['grid grid-cols-1 gap-x-6', columns === 2 ? '@4xl/picker:grid-cols-2' : ''].join(' ')}>
            {page.entries.map((e) =>
              e.kind === 'header' ? (
                <li key={`h:${e.group.key}`} className="col-span-full flex items-center gap-1">
                  <span className="pl-2">{groupCheckbox(groupIds.get(e.group.key) ?? [], PICKER.selectGroup(e.group.label))}</span>
                  <div className="min-w-0 flex-1">
                    <GroupHeader label={e.group.label} count={e.group.count} continued={e.group.continued} collapsed={e.group.collapsed} onToggle={() => view.toggleCollapsed(e.group.key)} />
                  </div>
                </li>
              ) : (
                <PickRow
                  key={e.row.key}
                  id={e.row.item.id}
                  row={e.row.item.view}
                  isChosen={set.has(e.row.item.id)}
                  reason={reason(e.row.item.id)}
                  onToggle={toggle}
                  onPick={pick}
                  onOpen={onOpen}
                  isCurrent={currentId === e.row.item.id}
                />
              ),
            )}
          </ul>
        )}
      </div>
      <div className="shrink-0">
        <PageFooter page={page.page} pageCount={page.pageCount} text={footerText(page, spec.noun)} pageSize={view.state.pageSize} onPage={view.setPage} onPageSize={view.setPageSize} />
      </div>
    </div>
  )
}

function PickRow({
  id,
  row,
  isChosen,
  reason,
  onToggle,
  onPick,
  onOpen,
  isCurrent,
}: {
  id: string
  row: PickerRow
  isChosen: boolean
  reason: string | null
  onToggle: (id: string, on: boolean) => void
  onPick: (id: string, range: boolean) => void
  onOpen?: ((id: string) => void) | undefined
  isCurrent: boolean
}) {
  const text = (
    <div className="flex min-w-0 flex-col">
      <Text variant="studio-body" truncate title={row.title}>
        {row.title}
      </Text>
      {/* The reason is the row's second line, not only a tooltip (§24); whole in the tooltip. */}
      {reason ? (
        <Text variant="studio-caption" tone="muted" truncate title={reason}>
          {reason}
        </Text>
      ) : row.subtitle ? (
        <Text variant="studio-caption" tone="muted" truncate title={row.subtitle}>
          {row.subtitle}
        </Text>
      ) : null}
    </div>
  )
  // Shift held on the checkbox: React Aria's onChange has no event.
  const shift = useRef(false)
  // Shift on the row picks a run, Ctrl/⌘ ticks it; neither opens the row
  // (only a plain click does). Shift's mouse-down would select text across
  // the rows, so it is refused.
  const click = (e: MouseEvent) => {
    if (!(e.shiftKey || e.ctrlKey || e.metaKey)) return
    e.preventDefault()
    e.stopPropagation()
    onPick(id, e.shiftKey)
  }
  return (
    <li
      onClickCapture={(e) => {
        // The checkbox decides for itself, with `shift`; the rest of the row is a pick.
        if ((e.target as HTMLElement).closest('[data-pick-check]')) return
        click(e)
      }}
      onMouseDown={(e) => {
        if (e.shiftKey) e.preventDefault()
      }}
      className={[
        'grid min-h-10 grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded px-2',
        isCurrent ? 'bg-[var(--accent)]/12' : 'hover:bg-[var(--surface-secondary)]',
      ].join(' ')}
      data-blocked={reason ? '' : undefined}
      data-current={isCurrent ? '' : undefined}
    >
      <span data-pick-check className="flex" onPointerDownCapture={(e) => (shift.current = e.shiftKey)} onKeyDownCapture={() => (shift.current = false)}>
        <CheckboxField label={row.title} hideLabel isSelected={isChosen} onChange={(on) => (shift.current ? onPick(id, true) : onToggle(id, on))} disabledReason={reason} />
      </span>
      <span className="contents">{row.leading ?? <span />}</span>
      {onOpen ? (
        <button type="button" className="min-w-0 rounded text-left outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]" onClick={() => onOpen(id)} aria-pressed={isCurrent}>
          {text}
        </button>
      ) : (
        text
      )}
      <span className="flex min-w-[7.5rem] items-center justify-end gap-1">{row.chips}</span>
    </li>
  )
}
