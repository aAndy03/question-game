import { beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useChromeStore } from '@/chrome/chrome'
import type { ListItem, ListSpec } from './listView'
import { useListView } from './useListView'

/**
 * Stable 1.1: the hook every library tab uses — the model, the remembered
 * view, and the selection, with the rules that keep an operator in their place
 * and never let a bulk action reach a row they cannot see.
 */

interface Thing {
  id: string
  name: string
  n: number
  tags: readonly string[]
  archived: boolean
}

const SPEC: ListSpec<Thing> = {
  tab: 'teams',
  noun: { one: 'thing', many: 'things' },
  filters: [
    { id: 'tag', label: 'Tag', kind: 'multi', options: [{ value: 'a', label: 'Alpha' }, { value: 'b', label: 'Beta' }], test: (t, v) => (v as readonly string[]).some((x) => t.tags.includes(x)) },
  ],
  sorts: [
    { id: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
    { id: 'n', label: 'N', compare: (a, b) => a.n - b.n },
  ],
  groups: [{ id: 'tag', label: 'Tag', groupsOf: (t) => t.tags.map((x) => ({ key: x, label: x, order: x })) }],
  defaults: { sort: { id: 'name', desc: false }, group: null, pageSize: 100 },
  tiebreak: (t) => t.name,
  changedAt: () => 0,
  isArchived: (t) => t.archived,
}

const item = (id: string, over: Partial<Thing> = {}): ListItem<Thing> => ({
  id,
  data: { id, name: id, n: 0, tags: ['a'], archived: false, ...over },
  view: id,
})
const many = (n: number, over: Partial<Thing> = {}) => Array.from({ length: n }, (_, i) => item(`t${String(i).padStart(4, '0')}`, over))

beforeEach(() => {
  useChromeStore.setState({ operatorId: 'op', prefs: {}, listState: {} })
})

const mount = (items: readonly ListItem<Thing>[], hits: ReadonlyMap<string, number> | null = null) =>
  renderHook(({ items, hits }) => useListView(SPEC, items, hits), { initialProps: { items, hits } })

describe('where the operator is', () => {
  it('goes back to page 1 on a filter, a sort, a group or a page size, but not when the list changes (M-72, M-74)', () => {
    const items = many(250)
    const { result, rerender } = mount(items)
    act(() => result.current.setPage(3))
    expect(result.current.page.page).toBe(3)
    rerender({ items: items.slice(1), hits: null })
    expect(result.current.page.page).toBe(3)
    for (const change of [
      () => result.current.setFilter('tag', ['a']),
      () => result.current.setSort({ id: 'n', desc: true }),
      () => result.current.setGroup('tag'),
      () => result.current.setPageSize(50),
      () => result.current.setSearch('x'),
    ]) {
      act(() => result.current.setPage(2))
      act(change)
      expect(result.current.page.page).toBe(1)
    }
  })

  it('remembers the page, filters and search through a remount (P-09)', () => {
    const items = many(250)
    const first = mount(items)
    act(() => first.result.current.setFilter('tag', ['a']))
    act(() => first.result.current.setPage(2))
    first.unmount()
    const again = mount(items)
    expect(again.result.current.page.page).toBe(2)
    expect(again.result.current.state.filters).toEqual({ tag: ['a'] })
  })
})

describe('Best match (S-04–S-06, S-10)', () => {
  it('is chosen while searching and gives the previous sort back after', () => {
    const items = [item('a'), item('b'), item('c')]
    const { result, rerender } = mount(items)
    act(() => result.current.setSort({ id: 'n', desc: true }))
    act(() => result.current.setSearch('x'))
    rerender({ items, hits: new Map([['c', 0.9], ['a', 0.1]]) })
    expect(result.current.state.sort).toEqual({ id: 'match', desc: true })
    expect(result.current.page.pageIds).toEqual(['c', 'a'])
    act(() => result.current.setSearch(''))
    rerender({ items, hits: null })
    expect(result.current.state.sort).toEqual({ id: 'n', desc: true })
    expect(useChromeStore.getState().prefs.op?.lists?.teams?.sort).toEqual({ id: 'n', desc: true })
  })

  it('gives way to a sort the operator picks while searching, which then stays', () => {
    const items = [item('a'), item('b')]
    const { result, rerender } = mount(items)
    act(() => result.current.setSearch('x'))
    rerender({ items, hits: new Map([['a', 1], ['b', 2]]) })
    act(() => result.current.setSort({ id: 'name', desc: true }))
    expect(result.current.state.sort).toEqual({ id: 'name', desc: true })
    act(() => result.current.setSearch(''))
    rerender({ items, hits: null })
    expect(result.current.state.sort).toEqual({ id: 'name', desc: true })
  })

  it('does not appear for whitespace (S-07)', () => {
    const { result } = mount([item('a')])
    act(() => result.current.setSearch('   '))
    expect(result.current.searching).toBe(false)
  })
})

describe('selection (B-01–B-06, B-11–B-14)', () => {
  it('selects across every page and counts this page', () => {
    const { result } = mount(many(250))
    act(() => result.current.selection.selectAll())
    expect(result.current.selection.ids.size).toBe(250)
    expect(result.current.selection.onPage).toBe(100)
    act(() => result.current.setPage(3))
    expect(result.current.selection.onPage).toBe(50)
  })

  it('is cleared by a filter, a Changed window or a search, not by a page or a sort (Review Focus 4)', () => {
    const { result } = mount(many(250))
    for (const change of [() => result.current.setFilter('tag', ['a']), () => result.current.setChanged('7d'), () => result.current.setSearch('x'), () => result.current.clearFilters()]) {
      act(() => result.current.selection.selectAll())
      act(change)
      expect(result.current.selection.ids.size).toBe(0)
    }
    act(() => result.current.selection.selectAll())
    act(() => result.current.setPage(2))
    act(() => result.current.setSort({ id: 'n', desc: false }))
    expect(result.current.selection.ids.size).toBeGreaterThan(0)
  })

  it('holds an item in two groups once', () => {
    const { result } = mount([item('q', { tags: ['a', 'b'] }), item('r', { tags: ['b'] })])
    act(() => result.current.setGroup('tag'))
    act(() => result.current.selection.toggle('q'))
    expect([...result.current.selection.ids]).toEqual(['q'])
    act(() => result.current.selection.selectAll())
    expect(result.current.selection.ids.size).toBe(2)
  })

  it('drops a group from the selection when it is collapsed, and select all leaves it out (B-12, B-13)', () => {
    const items = [...many(3, { tags: ['a'] }).map((t) => item(`a${t.id}`, { tags: ['a'] })), ...many(2).map((t) => item(`b${t.id}`, { tags: ['b'] }))]
    const { result } = mount(items)
    act(() => result.current.setGroup('tag'))
    act(() => result.current.selection.selectAll())
    act(() => result.current.toggleCollapsed('a'))
    expect([...result.current.selection.ids].every((id) => id.startsWith('b'))).toBe(true)
    act(() => result.current.selection.selectAll())
    expect(result.current.selection.ids.size).toBe(2)
  })

  it('keeps a collapsed group through a sort change; a new grouping forgets it (Review Focus 5)', () => {
    const { result } = mount(many(10).map((t, i) => item(t.id, { tags: [i % 2 ? 'a' : 'b'] })))
    act(() => result.current.setGroup('tag'))
    act(() => result.current.toggleCollapsed('a'))
    act(() => result.current.setSort({ id: 'n', desc: true }))
    expect(result.current.state.collapsed.has('a')).toBe(true)
    act(() => result.current.setGroup(null))
    act(() => result.current.setGroup('tag'))
    expect(result.current.state.collapsed.size).toBe(0)
  })

  it('splits the selection into what Archive and Restore would touch (B-07, B-08)', () => {
    const { result } = mount([item('a'), item('b', { archived: true }), item('c', { archived: true })])
    act(() => result.current.selection.selectAll())
    expect(result.current.bulk).toEqual({ archive: ['a'], restore: ['b', 'c'] })
  })
})

describe('the chip row and stability (M-68–M-70, U-29)', () => {
  it('names each active filter and clears them all but the search', () => {
    const { result } = mount([item('a')])
    act(() => result.current.setFilter('tag', ['a', 'b']))
    act(() => result.current.setChanged('today'))
    act(() => result.current.setSearch('x'))
    expect(result.current.activeFilters).toEqual([
      { id: 'tag', label: 'Tag', valueLabel: 'Alpha, Beta' },
      { id: 'changed', label: 'Changed', valueLabel: 'Today' },
    ])
    act(() => result.current.clearFilters())
    expect(result.current.activeFilters).toEqual([])
    expect(result.current.state.search).toBe('x')
  })

  it('hands back the same page object while nothing it depends on changed', () => {
    const items = many(5)
    const { result, rerender } = mount(items)
    const before = result.current.page
    rerender({ items, hits: null })
    expect(result.current.page).toBe(before)
  })
})

describe('review fixes', () => {
  it('keeps one setSearch across a search change, so the field never re-reports old text', () => {
    const { result } = mount([item('a')])
    const before = result.current.setSearch
    act(() => result.current.setSearch('x'))
    expect(result.current.setSearch).toBe(before)
  })

  it('never counts or acts on a selected row that has left the view (Important 2)', () => {
    const items = [item('a'), item('b'), item('c')]
    const { result, rerender } = mount(items)
    act(() => result.current.selection.selectAll())
    // b leaves the view without a filter change: archived from the aside, fixed, moved.
    rerender({ items: [items[0]!, items[2]!], hits: null })
    expect([...result.current.selection.ids].sort()).toEqual(['a', 'c'])
    expect(result.current.bulk.archive).toEqual(['a', 'c'])
    // and it does not come back selected when it returns
    rerender({ items, hits: null })
    expect(result.current.selection.ids.has('b')).toBe(false)
  })

  it('picks a field in its own default direction (Important 5)', () => {
    const spec = { ...SPEC, sorts: [...SPEC.sorts, { id: 'changed', label: 'Changed', compare: () => 0, defaultDesc: true }] }
    const { result } = renderHook(() => useListView(spec, [item('a')], null))
    act(() => result.current.sortBy('changed'))
    expect(result.current.state.sort).toEqual({ id: 'changed', desc: true })
    act(() => result.current.sortBy('changed'))
    expect(result.current.state.sort).toEqual({ id: 'changed', desc: false })
    act(() => result.current.sortBy('name'))
    expect(result.current.state.sort).toEqual({ id: 'name', desc: false })
  })
})

describe('deferred fixes', () => {
  it('remembers a sort picked mid-search across a remount, and Best match can be picked again', () => {
    const items = [item('a'), item('b')]
    const hits = new Map([['a', 1], ['b', 2]])
    const first = mount(items, hits)
    act(() => first.result.current.setSearch('x'))
    first.rerender({ items, hits })
    act(() => first.result.current.setSort({ id: 'name', desc: true }))
    first.unmount()
    const again = mount(items, hits)
    expect(again.result.current.state.sort).toEqual({ id: 'name', desc: true })
    act(() => again.result.current.setSort({ id: 'match', desc: true }))
    expect(again.result.current.state.sort).toEqual({ id: 'match', desc: true })
  })

  it('a search with only a trailing space changed is the same search', () => {
    const { result } = mount(many(250))
    act(() => result.current.setSearch('rome'))
    act(() => result.current.setPage(2))
    act(() => result.current.setSearch('rome '))
    expect(result.current.page.page).toBe(2)
  })

  it('keeps the stored page where the list clamps it, so rows coming back do not jump forward', () => {
    const items = many(250)
    const { result, rerender } = mount(items)
    act(() => result.current.setPage(3))
    rerender({ items: items.slice(0, 150), hits: null })
    expect(result.current.page.page).toBe(2)
    rerender({ items, hits: null })
    expect(result.current.page.page).toBe(2)
  })

  it('goes back to page 1 when the scope changes (Status, the domain pane)', () => {
    const { result } = mount(many(250))
    act(() => result.current.setPage(3))
    act(() => result.current.resetPage())
    expect(result.current.page.page).toBe(1)
  })

  it('puts a range the right way round, and a range spanning the whole scale is no filter', () => {
    const spec = { ...SPEC, filters: [...SPEC.filters, { id: 'n', label: 'N', kind: 'range' as const, bounds: { min: 1, max: 100 }, test: () => true }] }
    const { result } = renderHook(() => useListView(spec, [item('a')], null))
    act(() => result.current.setFilter('n', { min: 90, max: 80 }))
    expect(result.current.state.filters.n).toEqual({ min: 80, max: 90 })
    act(() => result.current.setFilter('n', { min: 1, max: 100 }))
    expect(result.current.state.filters.n).toBeNull()
  })

  it('deselects only this page from the header checkbox', () => {
    const { result } = mount(many(250))
    act(() => result.current.selection.selectAll())
    act(() => result.current.selection.deselectPage())
    expect(result.current.selection.ids.size).toBe(150)
    expect(result.current.selection.onPage).toBe(0)
  })
})

describe('a filter value that is no longer an option (P15 review)', () => {
  it('goes when its option goes — a group deleted, a tag renamed — and the rest stay', () => {
    const items = [item('x', { tags: ['b'] })]
    const { result, rerender } = renderHook(({ spec }) => useListView(spec, items, null), { initialProps: { spec: SPEC } })
    act(() => result.current.setFilter('tag', ['a', 'b']))
    const onlyB: ListSpec<Thing> = { ...SPEC, filters: [{ ...SPEC.filters[0]!, options: [{ value: 'b', label: 'Beta' }] }] }
    rerender({ spec: onlyB })
    expect(useChromeStore.getState().listState['teams']?.filters['tag']).toEqual(['b'])
    const none: ListSpec<Thing> = { ...SPEC, filters: [{ ...SPEC.filters[0]!, options: [{ value: 'c', label: 'Gamma' }] }] }
    rerender({ spec: none })
    expect(useChromeStore.getState().listState['teams']?.filters['tag']).toBeNull()
  })

  it('stays while the options are still loading', () => {
    const { result, rerender } = renderHook(({ spec }) => useListView(spec, [item('x')], null), { initialProps: { spec: SPEC } })
    act(() => result.current.setFilter('tag', ['a']))
    rerender({ spec: { ...SPEC, filters: [{ ...SPEC.filters[0]!, options: [] }] } })
    expect(useChromeStore.getState().listState['teams']?.filters['tag']).toEqual(['a'])
  })
})
