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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChromeStore, useListPrefs, useListState, type ListState } from '@/chrome/chrome'
import { LIST } from '@/copy'
import { isActive, listView, normalizeRange, rangeBetween, type Changed, type FilterValue, type ListItem, type ListPage, type ListSpec, type ListViewState, type PageSize } from './listView'

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
  /** Sort by a field: a new field in its own default direction, the same field flipped. */
  sortBy(id: string): void
  setGroup(group: string | null): void
  setPage(page: number): void
  /** The scope changed (Status, the domain pane): page 1, nothing selected. */
  resetPage(): void
  setPageSize(size: PageSize): void
  toggleCollapsed(groupKey: string): void
  readonly selection: {
    readonly ids: ReadonlySet<string>
    /** Selected ids on the page shown. */
    readonly onPage: number
    toggle(id: string): void
    selectPage(): void
    /** The header checkbox off: this page only, not what is selected elsewhere. */
    deselectPage(): void
    /**
     * Ctrl/⌘+click (`range: false`) and Shift+click (`range: true`), beta.8:
     * the clicked row takes the other state, and with Shift so does every row
     * from the last one ticked to it, in the view's order across pages.
     */
    pick(id: string, range: boolean): void
    /** Every row in view, every page, added to what is selected. */
    selectAll(): void
    /** Every row in view off; hidden ones stay selected. */
    deselectAll(): void
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
  /**
   * Every row that may stay selected, by id, with whether it is archived —
   * when the page narrows `items` before the view sees them (Domains &
   * Questions' domain pick). Absent, `items` is the whole tab.
   */
  universe?: ReadonlyMap<string, boolean>,
): ListViewApi<T, V> {
  const tab = spec.tab
  const prefs = useListPrefs(tab)
  const session = useListState(tab)
  const setListPrefs = useChromeStore((s) => s.setListPrefs)
  const setListState = useChromeStore((s) => s.setListState)
  const [selected, setSelected] = useState<ReadonlySet<string>>(NO_IDS)
  // Where Shift+click spans from: the last row ticked or unticked by hand.
  const anchor = useRef<string | null>(null)

  const searching = session.search.trim().length > 0
  const remembered = prefs.sort ?? spec.defaults.sort
  // A sort the operator picked while this search was on (kept for the session,
  // so a remount does not hand the list back to Best match): Best match gives way.
  const sort = searching && hits !== null && !session.pickedSort ? { id: 'match', desc: true } : remembered
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

  // Changes that alter what matches go back to page 1. They keep the
  // selection (beta.8): a row a search or a filter hides stays ticked.
  const narrow = useCallback(
    (patch: Partial<ListState>) => {
      setListState(tab, { ...patch, page: 1 })
    },
    [setListState, tab],
  )
  const setFilter = useCallback(
    (id: string, value: FilterValue | null) => {
      // A range the operator meant: the right way round, and off once it spans the scale.
      const def = spec.filters.find((f) => f.id === id)
      const next = def?.kind === 'range' && value !== null && typeof value === 'object' && 'min' in value ? normalizeRange(value, def.bounds ?? value) : value
      narrow({ filters: { ...session.filters, [id]: next } })
    },
    [narrow, session.filters, spec.filters],
  )
  // A value that is no longer an option — a group deleted, a tag renamed, the
  // groups of the domain left behind — goes, rather than empty the list behind
  // a chip that names nothing (review). Options still loading prune nothing.
  useEffect(() => {
    let changed = false
    const next: Record<string, FilterValue | null> = { ...session.filters }
    for (const f of spec.filters) {
      const v = session.filters[f.id]
      if (f.kind !== 'multi' || !f.options || f.options.length === 0 || !Array.isArray(v)) continue
      const known = new Set(f.options.map((o) => o.value))
      const kept = v.filter((x) => known.has(x))
      if (kept.length === v.length) continue
      next[f.id] = kept.length > 0 ? kept : null
      changed = true
    }
    if (changed) setListState(tab, { filters: next, page: 1 })
  }, [spec.filters, session.filters, setListState, tab])
  const setChanged = useCallback((changed: Changed) => narrow({ changed }), [narrow])
  const clearFilters = useCallback(() => narrow({ filters: {}, changed: 'any' }), [narrow])
  // One function for the life of the list: the search field re-reports its
  // text whenever this changes identity, and an old text reported after a
  // clear brings the search straight back (review). The current text is read
  // from the store, not closed over.
  const setSearch = useCallback(
    (search: string) => {
      // The same text is not a new search, and must not cost the operator their page.
      // A trailing space is not a new search either.
      if (search.trim() === (useChromeStore.getState().listState[tab]?.search ?? '').trim()) return
      narrow(search.trim().length === 0 ? { search, pickedSort: false } : { search })
    },
    [narrow, tab],
  )
  const setSort = useCallback(
    (next: { id: string; desc: boolean }) => {
      // Best match is never remembered: picking it gives the search its own order back.
      if (next.id === 'match') {
        setListState(tab, { page: 1, pickedSort: false })
        return
      }
      setListPrefs(tab, { sort: next })
      setListState(tab, searching ? { page: 1, pickedSort: true } : { page: 1 })
    },
    [searching, setListPrefs, setListState, tab],
  )
  const sortBy = useCallback(
    (id: string) => {
      const on = state.sort.id === id
      const def = spec.sorts.find((s) => s.id === id)
      setSort({ id, desc: on ? !state.sort.desc : (def?.defaultDesc ?? false) })
    },
    [setSort, spec.sorts, state.sort.id, state.sort.desc],
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
  const resetPage = useCallback(() => {
    setListState(tab, { page: 1 })
  }, [setListState, tab])
  // The stored page follows the clamp: a list that shrank under the operator
  // keeps them where they now are, so rows coming back do not jump them forward.
  const loaded = items !== undefined
  useEffect(() => {
    if (loaded && page.page !== session.page) setListState(tab, { page: page.page })
  }, [loaded, page.page, session.page, setListState, tab])
  const toggleCollapsed = useCallback(
    (key: string) => {
      // A collapsed group leaves the view, so the in-view selection drops it —
      // except a question still showing under another, open domain.
      const closing = !collapsed.has(key)
      setListState(tab, { collapsed: closing ? [...collapsed, key] : [...collapsed].filter((k) => k !== key) })
    },
    [collapsed, setListState, tab],
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

  // Every row of the tab, and whether it is archived: what may stay selected.
  const known = useMemo(() => {
    if (universe) return universe
    const out = new Map<string, boolean>()
    for (const i of items ?? NO_ITEMS) out.set(i.id, spec.isArchived?.(i.data) ?? false)
    return out
  }, [universe, items, spec])
  // **The selection outlives the view** (beta.8, the maintainer's ask): a row
  // a search, a filter, a collapsed group, another page or another domain
  // hides stays selected — tick some, search, tick more, act on all of them.
  // A row that left the **tab** — archived out of Active, restored out of
  // Archived, gone — is dropped, so it is never acted on and does not come
  // back selected (the review's rule, kept for what has truly gone).
  const kept = useMemo(() => {
    if (selected.size === 0 || items === undefined) return selected
    const still = [...selected].filter((id) => known.has(id))
    return still.length === selected.size ? selected : new Set(still)
  }, [selected, known, items])
  useEffect(() => {
    if (kept !== selected) setSelected(kept)
  }, [kept, selected])

  const selection = useMemo(() => {
    const onPage = page.pageIds.reduce((n, id) => n + (kept.has(id) ? 1 : 0), 0)
    const visible = new Set(page.selectableIds)
    return {
      ids: kept,
      onPage,
      toggle: (id: string) => {
        anchor.current = id
        setSelected((s) => {
          const next = new Set(s)
          if (!next.delete(id)) next.add(id)
          return next
        })
      },
      pick: (id: string, range: boolean) => {
        const on = !kept.has(id)
        const span = range ? rangeBetween(page.selectableIds, anchor.current, id) : [id]
        anchor.current = id
        setSelected((s) => {
          const next = new Set(s)
          for (const x of span) {
            if (on) next.add(x)
            else next.delete(x)
          }
          return next
        })
      },
      selectPage: () => setSelected((s) => new Set([...s, ...page.pageIds])),
      deselectPage: () =>
        setSelected((s) => {
          const here = new Set(page.pageIds)
          return new Set([...s].filter((id) => !here.has(id)))
        }),
      /** Add every row in view (every page); what is hidden stays as it is. */
      selectAll: () => setSelected((s) => new Set([...s, ...page.selectableIds])),
      /** Take every row in view off; what is hidden stays selected. */
      deselectAll: () => setSelected((s) => new Set([...s].filter((id) => !visible.has(id)))),
      clear: () => setSelected(NO_IDS),
    }
  }, [page.pageIds, page.selectableIds, kept])

  // The whole selection, shown or hidden, split by what each action applies to.
  const bulk = useMemo(() => {
    const archive: string[] = []
    const restore: string[] = []
    for (const id of kept) {
      if (known.get(id)) restore.push(id)
      else archive.push(id)
    }
    return { archive, restore }
  }, [kept, known])

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
    sortBy,
    setGroup,
    setPage,
    resetPage,
    setPageSize,
    toggleCollapsed,
    selection,
    bulk,
  }
}
