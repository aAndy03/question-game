/**
 * One hook for every library tab (stable 1.1): the pure `listView` model, the
 * view the operator chose (remembered per operator: sort, group, page size;
 * for the session: filters, search, page, collapsed groups), and the
 * selection.
 *
 * The rules that live here, because they are about time and not about one
 * list:
 * - a filter, a search, a sort, a group or a page size puts the operator back
 *   on page 1; a row edited or archived does not (the model clamps instead);
 * - while Search has text and its hits have arrived, the sort is Best match
 *   unless the operator picks another; clearing Search gives back the sort
 *   they had, and Best match is never remembered;
 * - the selection holds item ids — a question in two domains once — and is
 *   cleared by any filter or search change, so a bulk action never reaches a
 *   row that has left the view; collapsing a group drops it from the
 *   selection for the same reason.
 */

import { useCallback, useMemo, useState } from 'react'
import { useChromeStore, useListPrefs, useListState, type ListState } from '@/chrome/chrome'
import { LIST } from '@/copy'
import { isActive, listView, type Changed, type FilterValue, type ListItem, type ListPage, type ListSpec, type ListViewState, type PageSize } from './listView'

export interface ListViewApi<T, V = unknown> {
  readonly page: ListPage<T, V>
  /** The view in force: defaults applied, Best match resolved. */
  readonly state: ListViewState & { readonly search: string }
  readonly spec: ListSpec<T>
  /** Search has non-blank text. */
  readonly searching: boolean
  setFilter(id: string, value: FilterValue | null): void
  setChanged(changed: Changed): void
  clearFilters(): void
  readonly activeFilters: readonly { readonly id: string; readonly label: string; readonly valueLabel: string }[]
  setSearch(text: string): void
  setSort(sort: { id: string; desc: boolean }): void
  setGroup(group: string | null): void
  setPage(page: number): void
  setPageSize(size: PageSize): void
  toggleCollapsed(groupKey: string): void
  readonly selection: {
    readonly ids: ReadonlySet<string>
    /** Selected ids on the page shown. */
    readonly onPage: number
    toggle(id: string): void
    selectPage(): void
    selectAll(): void
    clear(): void
  }
  /** The selection split by what each bulk action would touch. */
  readonly bulk: { readonly archive: readonly string[]; readonly restore: readonly string[] }
}

const NO_ITEMS: readonly never[] = []
const NO_IDS: ReadonlySet<string> = new Set()

function valueLabel<T>(spec: ListSpec<T>, id: string, value: FilterValue): string {
  const def = spec.filters.find((f) => f.id === id)
  const name = (v: string) => def?.options?.find((o) => o.value === v)?.label ?? v
  if (typeof value === 'string') return name(value)
  if (typeof value === 'boolean') return ''
  if ('min' in value) return LIST.range(value.min, value.max)
  return value.map(name).join(', ')
}

export function useListView<T, V>(
  spec: ListSpec<T>,
  items: readonly ListItem<T, V>[] | undefined,
  hits: ReadonlyMap<string, number> | null,
): ListViewApi<T, V> {
  const tab = spec.tab
  const prefs = useListPrefs(tab)
  const session = useListState(tab)
  const setListPrefs = useChromeStore((s) => s.setListPrefs)
  const setListState = useChromeStore((s) => s.setListState)
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_IDS)
  // A sort the operator picked while this search was on: Best match gives way.
  const [pickedWhileSearching, setPicked] = useState(false)

  const searching = session.search.trim().length > 0
  const remembered = prefs.sort ?? spec.defaults.sort
  const sort = searching && hits !== null && !pickedWhileSearching ? { id: 'match', desc: true } : remembered
  const group = prefs.group === undefined ? spec.defaults.group : prefs.group
  const pageSize = prefs.pageSize ?? spec.defaults.pageSize
  const collapsed = useMemo(() => new Set(session.collapsed), [session.collapsed])
  // *Changed* is measured from when the window was chosen, so the page does not
  // recompute on every render.
  const now = useMemo(() => Date.now(), [session.changed])

  const state = useMemo(
    () => ({
      filters: session.filters,
      changed: session.changed,
      search: session.search,
      hits: searching ? hits : null,
      sort,
      group,
      page: session.page,
      pageSize,
      collapsed,
      now,
    }),
    [session.filters, session.changed, session.search, session.page, searching, hits, sort.id, sort.desc, group, pageSize, collapsed, now],
  )
  const page = useMemo(() => listView(items ?? NO_ITEMS, spec, state), [items, spec, state])

  // Changes that alter what matches clear the selection and go back to page 1.
  const narrow = useCallback(
    (patch: Partial<ListState>) => {
      setSelected(NO_IDS)
      setListState(tab, { ...patch, page: 1 })
    },
    [setListState, tab],
  )
  const setFilter = useCallback((id: string, value: FilterValue | null) => narrow({ filters: { ...session.filters, [id]: value } }), [narrow, session.filters])
  const setChanged = useCallback((changed: Changed) => narrow({ changed }), [narrow])
  const clearFilters = useCallback(() => narrow({ filters: {}, changed: 'any' }), [narrow])
  const setSearch = useCallback(
    (search: string) => {
      if (search.trim().length === 0) setPicked(false)
      narrow({ search })
    },
    [narrow],
  )
  const setSort = useCallback(
    (next: { id: string; desc: boolean }) => {
      if (next.id === 'match') return
      if (searching) setPicked(true)
      setListPrefs(tab, { sort: next })
      setListState(tab, { page: 1 })
    },
    [searching, setListPrefs, setListState, tab],
  )
  const setGroup = useCallback(
    (next: string | null) => {
      setListPrefs(tab, { group: next })
      setListState(tab, { page: 1, collapsed: [] })
    },
    [setListPrefs, setListState, tab],
  )
  const setPageSize = useCallback(
    (size: PageSize) => {
      setListPrefs(tab, { pageSize: size })
      setListState(tab, { page: 1 })
    },
    [setListPrefs, setListState, tab],
  )
  const setPage = useCallback((n: number) => setListState(tab, { page: n }), [setListState, tab])
  const toggleCollapsed = useCallback(
    (key: string) => {
      const closing = !collapsed.has(key)
      if (closing) {
        const def = spec.groups.find((g) => g.id === group)
        if (def) {
          const inGroup = new Set((items ?? NO_ITEMS).filter((i) => def.groupsOf(i.data).some((g) => g.key === key)).map((i) => i.id))
          setSelected((s) => (s.size === 0 ? s : new Set([...s].filter((id) => !inGroup.has(id)))))
        }
      }
      setListState(tab, { collapsed: closing ? [...collapsed, key] : [...collapsed].filter((k) => k !== key) })
    },
    [collapsed, group, items, setListState, spec.groups, tab],
  )

  const activeFilters = useMemo(() => {
    const out: { id: string; label: string; valueLabel: string }[] = []
    for (const f of spec.filters) {
      const v = session.filters[f.id]
      if (isActive(v)) out.push({ id: f.id, label: f.label, valueLabel: valueLabel(spec, f.id, v) })
    }
    if (session.changed !== 'any') out.push({ id: 'changed', label: LIST.changed, valueLabel: LIST.changedWindow[session.changed] })
    return out
  }, [session.filters, session.changed, spec])

  const selection = useMemo(() => {
    const onPage = page.pageIds.reduce((n, id) => n + (selected.has(id) ? 1 : 0), 0)
    return {
      ids: selected,
      onPage,
      toggle: (id: string) =>
        setSelected((s) => {
          const next = new Set(s)
          if (!next.delete(id)) next.add(id)
          return next
        }),
      selectPage: () => setSelected((s) => new Set([...s, ...page.pageIds])),
      selectAll: () => setSelected(new Set(page.selectableIds)),
      clear: () => setSelected(NO_IDS),
    }
  }, [page.pageIds, page.selectableIds, selected])

  const bulk = useMemo(() => {
    const archive: string[] = []
    const restore: string[] = []
    if (selected.size > 0) {
      for (const i of items ?? NO_ITEMS) {
        if (!selected.has(i.id)) continue
        if (spec.isArchived?.(i.data)) restore.push(i.id)
        else archive.push(i.id)
      }
    }
    return { archive, restore }
  }, [items, selected, spec])

  return {
    page,
    state,
    spec,
    searching,
    setFilter,
    setChanged,
    clearFilters,
    activeFilters,
    setSearch,
    setSort,
    setGroup,
    setPage,
    setPageSize,
    toggleCollapsed,
    selection,
    bulk,
  }
}
