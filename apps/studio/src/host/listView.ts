/**
 * The list view every library tab runs through (stable 1.1): filter → sort →
 * group → page, over the whole list `catalog_list` already returns. Pure — no
 * React, no store — so it is tested on its own and the four tabs cannot
 * disagree about what a filter, a header or a page means.
 *
 * A tab declares a `ListSpec`; `useListView` joins this to the chrome store
 * and the selection; `LibraryList` draws the result.
 */

/** The library tabs, the Game page's three pickers (beta.4) and the import dialog's rows (P20), each with its own view. */
export type LibraryTab = 'teams' | 'library' | 'games' | 'operators' | 'workspaces' | 'pickTeams' | 'pickDomains' | 'pickQuestions' | 'importQuestions'
export type PageSize = 50 | 100 | 250 | 'all'
export const PAGE_SIZES: readonly PageSize[] = [50, 100, 250, 'all']
export type Changed = 'any' | 'today' | '7d' | '30d'
export const CHANGED: readonly Changed[] = ['any', 'today', '7d', '30d']

export type FilterValue = readonly string[] | { readonly min: number; readonly max: number } | boolean | string

export interface FilterDef<T> {
  readonly id: string
  readonly label: string
  readonly kind: 'multi' | 'choice' | 'range' | 'toggle'
  readonly options?: readonly { readonly value: string; readonly label: string }[]
  readonly bounds?: { readonly min: number; readonly max: number }
  /** Called only for an active value (see `isActive`). */
  test(item: T, value: FilterValue): boolean
}

export interface SortDef<T> {
  readonly id: string
  readonly label: string
  /** Ascending order of two items that both have the value. */
  compare(a: T, b: T): number
  /** An item without the value; it sorts last in both directions. */
  nullable?(item: T): boolean
  readonly defaultDesc?: boolean
}

export interface GroupDef<T> {
  readonly id: string
  readonly label: string
  /** One or more groups per item — a question in several domains is in several. */
  groupsOf(item: T): readonly { readonly key: string; readonly label: string; readonly order: number | string; readonly last?: boolean }[]
}

export interface ListSpec<T> {
  readonly tab: LibraryTab
  readonly noun: { readonly one: string; readonly many: string }
  readonly filters: readonly FilterDef<T>[]
  readonly sorts: readonly SortDef<T>[]
  readonly groups: readonly GroupDef<T>[]
  readonly defaults: { readonly sort: { readonly id: string; readonly desc: boolean }; readonly group: string | null; readonly pageSize: PageSize }
  /** The last word in any order: name or text. Then the id. */
  tiebreak(item: T): string
  /** What the shared *Changed* filter reads; a list with no dates (an import's rows) has none, and no Changed filter. */
  changedAt?(item: T): number
  /** Archived rows: what *Restore* applies to under Status All. */
  isArchived?(item: T): boolean
}

export interface ListItem<T, V = unknown> {
  readonly id: string
  readonly data: T
  readonly view: V
}

export interface ListViewState {
  readonly filters: Readonly<Record<string, FilterValue | null>>
  readonly changed: Changed
  /** Search hits id → score, or `null` while Search is empty. */
  readonly hits: ReadonlyMap<string, number> | null
  /** `match` = Best match, by the hits' scores. */
  readonly sort: { readonly id: string; readonly desc: boolean }
  readonly group: string | null
  readonly page: number
  readonly pageSize: PageSize
  readonly collapsed: ReadonlySet<string>
  readonly now: number
}

export interface ListRow<T, V = unknown> {
  /** `<group>:<id>`, or the id when ungrouped — unique per row on screen. */
  readonly key: string
  readonly item: ListItem<T, V>
  readonly groupKey: string | null
  /** The other groups this item also appears under. */
  readonly alsoIn: readonly string[]
}

export interface ListGroup {
  readonly key: string
  readonly label: string
  /** Rows in the group across every page, collapsed or not. */
  readonly count: number
  readonly continued: boolean
  readonly collapsed: boolean
}

export type ListEntry<T, V = unknown> = { readonly kind: 'header'; readonly group: ListGroup } | { readonly kind: 'row'; readonly row: ListRow<T, V> }

export interface ListPage<T, V = unknown> {
  readonly entries: readonly ListEntry<T, V>[]
  /** Distinct ids matching, outside collapsed groups: what *Select all* selects. */
  readonly selectableIds: readonly string[]
  readonly pageIds: readonly string[]
  /** Rows on screen across every page (collapsed groups left out). */
  readonly rowCount: number
  /** Distinct items behind those rows. */
  readonly itemCount: number
  /** Rows the collapsed groups hold, kept off the pages. */
  readonly collapsedCount: number
  readonly page: number
  readonly pageCount: number
  readonly from: number
  readonly to: number
}

/** Off: `null`, `undefined`, `''`, `false`, an empty multi. */
export function isActive(value: FilterValue | null | undefined): value is FilterValue {
  if (value === null || value === undefined || value === '' || value === false) return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

const DAY = 24 * 3_600_000

/** The earliest `updatedAt` *Changed* keeps: today = local midnight; 7 d and 30 d rolling, inclusive. */
export function changedSince(changed: Changed, now: number): number | null {
  if (changed === 'any') return null
  if (changed === 'today') {
    const midnight = new Date(now)
    midnight.setHours(0, 0, 0, 0)
    return midnight.getTime()
  }
  return now - (changed === '7d' ? 7 : 30) * DAY
}

const TEXT = new Intl.Collator('en', { sensitivity: 'base', numeric: true })
/** How names and text are ordered everywhere in a list: no case, no accents, numbers as numbers. */
export const compareText = (a: string, b: string): number => TEXT.compare(a, b)

function compareOrder(a: number | string, b: number | string): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b
  return compareText(String(a), String(b))
}

interface GroupAcc<T, V> {
  key: string
  label: string
  order: number | string
  /** *No domain*, *No folder*, *Not set*: after every named group. */
  last: boolean
  rows: ListRow<T, V>[]
}

export function listView<T, V>(items: readonly ListItem<T, V>[], spec: ListSpec<T>, state: ListViewState): ListPage<T, V> {
  // 1. Search hits, filters (AND across), Changed.
  const since = changedSince(state.changed, state.now)
  const active = spec.filters.filter((f) => isActive(state.filters[f.id]))
  const kept = items.filter((item) => {
    if (state.hits !== null && !state.hits.has(item.id)) return false
    if (since !== null && spec.changedAt && spec.changedAt(item.data) < since) return false
    return active.every((f) => f.test(item.data, state.filters[f.id] as FilterValue))
  })

  // 2. Sort: the field, missing values last, then tiebreak, then id.
  const tie = (a: ListItem<T, V>, b: ListItem<T, V>) => compareText(spec.tiebreak(a.data), spec.tiebreak(b.data)) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const hits = state.hits
  let order: (a: ListItem<T, V>, b: ListItem<T, V>) => number
  if (state.sort.id === 'match' && hits !== null) {
    order = (a, b) => (hits.get(b.id) ?? 0) - (hits.get(a.id) ?? 0) || tie(a, b)
  } else {
    const def = spec.sorts.find((s) => s.id === state.sort.id)
    const sort = def ?? spec.sorts.find((s) => s.id === spec.defaults.sort.id)
    const desc = def ? state.sort.desc : spec.defaults.sort.desc
    order = (a, b) => {
      if (sort) {
        const na = sort.nullable?.(a.data) ?? false
        const nb = sort.nullable?.(b.data) ?? false
        if (na !== nb) return na ? 1 : -1
        if (!na) {
          const c = sort.compare(a.data, b.data)
          if (c !== 0) return desc ? -c : c
        }
      }
      return tie(a, b)
    }
  }
  const sorted = [...kept].sort(order)

  // 3. Group: one row per group an item is in.
  const groupDef = state.group === null ? undefined : spec.groups.find((g) => g.id === state.group)
  let groups: GroupAcc<T, V>[]
  if (groupDef === undefined) {
    groups = [{ key: '', label: '', order: 0, last: false, rows: sorted.map((item) => ({ key: item.id, item, groupKey: null, alsoIn: [] })) }]
  } else {
    const byKey = new Map<string, GroupAcc<T, V>>()
    for (const item of sorted) {
      const of = groupDef.groupsOf(item.data)
      for (const g of of) {
        let acc = byKey.get(g.key)
        if (acc === undefined) {
          acc = { key: g.key, label: g.label, order: g.order, last: g.last ?? false, rows: [] }
          byKey.set(g.key, acc)
        }
        acc.rows.push({ key: `${g.key}:${item.id}`, item, groupKey: g.key, alsoIn: of.filter((o) => o.key !== g.key).map((o) => o.label) })
      }
    }
    groups = [...byKey.values()].sort((a, b) => Number(a.last) - Number(b.last) || compareOrder(a.order, b.order) || compareText(a.label, b.label) || (a.key < b.key ? -1 : 1))
  }

  // 4. Page over the rows on screen; collapsed groups keep their header only.
  const grouped = groupDef !== undefined
  const isCollapsed = (g: GroupAcc<T, V>) => grouped && state.collapsed.has(g.key)
  const starts: number[] = []
  const visible: ListRow<T, V>[] = []
  for (const g of groups) {
    starts.push(visible.length)
    if (!isCollapsed(g)) visible.push(...g.rows)
  }
  const size = state.pageSize === 'all' ? Math.max(visible.length, 1) : state.pageSize
  const pageCount = Math.max(1, Math.ceil(visible.length / size))
  const page = Math.min(Math.max(1, Math.floor(state.page) || 1), pageCount)
  const start = (page - 1) * size
  const end = Math.min(start + size, visible.length)

  const entries: ListEntry<T, V>[] = []
  groups.forEach((g, i) => {
    const first = starts[i] as number
    if (isCollapsed(g)) {
      const at = Math.min(Math.floor(first / size) + 1, pageCount)
      if (grouped && at === page) entries.push({ kind: 'header', group: { key: g.key, label: g.label, count: g.rows.length, continued: false, collapsed: true } })
      return
    }
    const last = first + g.rows.length
    const lo = Math.max(first, start)
    const hi = Math.min(last, end)
    if (lo >= hi) return
    if (grouped) entries.push({ kind: 'header', group: { key: g.key, label: g.label, count: g.rows.length, continued: first < start, collapsed: false } })
    for (let k = lo; k < hi; k++) entries.push({ kind: 'row', row: visible[k] as ListRow<T, V> })
  })

  const distinct = (rows: readonly ListRow<T, V>[]) => [...new Set(rows.map((r) => r.item.id))]
  const collapsedCount = groups.reduce((n, g) => n + (isCollapsed(g) ? g.rows.length : 0), 0)
  const selectableIds = distinct(visible)
  return {
    entries,
    selectableIds,
    pageIds: distinct(visible.slice(start, end)),
    rowCount: visible.length,
    itemCount: selectableIds.length,
    collapsedCount,
    page,
    pageCount,
    from: visible.length === 0 ? 0 : start + 1,
    to: end,
  }
}

const N = (n: number) => n.toLocaleString('en-US')

/** `101–200 of 1,234 questions`, or `… of 1,310 rows · 1,234 questions` when a row repeats. */
export function footerText(
  page: Pick<ListPage<unknown>, 'from' | 'to' | 'rowCount' | 'itemCount'> & { readonly collapsedCount?: number },
  noun: { readonly one: string; readonly many: string },
): string {
  const word = (n: number) => (n === 1 ? noun.one : noun.many)
  if (page.rowCount === 0) {
    // Every group folded: say what is behind them rather than nothing at all.
    const hidden = page.collapsedCount ?? 0
    return hidden > 0 ? `${N(hidden)} ${word(hidden)} in collapsed groups` : ''
  }
  const range = `${N(page.from)}–${N(page.to)}`
  return page.rowCount === page.itemCount
    ? `${range} of ${N(page.rowCount)} ${word(page.rowCount)}`
    : `${range} of ${N(page.rowCount)} rows · ${N(page.itemCount)} ${word(page.itemCount)}`
}

/**
 * A range as the operator meant it: the right way round, and no filter at all
 * when it spans the whole scale — a range of 1–100 left behind by emptying
 * both fields would otherwise still hide every question without a difficulty.
 */
export function normalizeRange(
  range: { readonly min: number; readonly max: number },
  bounds: { readonly min: number; readonly max: number },
): { min: number; max: number } | null {
  const min = Math.min(range.min, range.max)
  const max = Math.max(range.min, range.max)
  return min <= bounds.min && max >= bounds.max ? null : { min, max }
}
