import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Profiler } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useChromeStore } from '@/chrome/chrome'
import type { ListItem, ListSpec } from '@/host/listView'
import { useListView } from '@/host/useListView'
import { LibraryList, type RecordView } from './LibraryList'

afterEach(cleanup)

/** Let every microtask and every zero-delay timer that is queued run. */
const settle = async () => {
  for (let i = 0; i < 5; i += 1) await new Promise((resolve) => setTimeout(resolve, 0))
}

interface Row {
  id: string
  name: string
  n: number
  tags: readonly string[]
  archived: boolean
}

const SPEC: ListSpec<Row> = {
  tab: 'teams',
  noun: { one: 'team', many: 'teams' },
  filters: [{ id: 'big', label: 'Big', kind: 'toggle', test: (r) => r.n > 5 }],
  sorts: [
    { id: 'name', label: 'Name', compare: (a, b) => a.name.localeCompare(b.name) },
    { id: 'n', label: 'Plays', compare: (a, b) => a.n - b.n },
  ],
  groups: [{ id: 'tag', label: 'Tag', groupsOf: (r) => r.tags.map((t) => ({ key: t, label: t.toUpperCase(), order: t })) }],
  defaults: { sort: { id: 'name', desc: false }, group: null, pageSize: 100 },
  tiebreak: (r) => r.name,
  changedAt: () => 0,
  isArchived: (r) => r.archived,
}

const item = (id: string, over: Partial<Row> = {}): ListItem<Row, RecordView> => {
  const data: Row = { id, name: id, n: 0, tags: ['a'], archived: false, ...over }
  return { id, data, view: { id, title: data.name, meta: [String(data.n)], isArchived: data.archived } }
}
const many = (n: number) => Array.from({ length: n }, (_, i) => item(`t${String(i).padStart(4, '0')}`))

function Harness({ items, layout = 'table' as const, onArchive }: { items: readonly ListItem<Row, RecordView>[] | undefined; layout?: 'table' | 'grid'; onArchive?: (ids: readonly string[]) => void }) {
  const view = useListView(SPEC, items, null)
  return (
    <LibraryList
      view={view as never}
      total={items?.length}
      scope="active"
      isLoading={items === undefined}
      layout={layout}
      what="teams"
      columns={{ title: { sortId: 'name', label: 'Name' }, meta: [{ sortId: 'n', label: 'Plays' }] }}
      bulk={{ onArchive }}
    />
  )
}

beforeEach(() => {
  useChromeStore.setState({ operatorId: 'op', prefs: {}, listState: {} })
})

describe('LibraryList', () => {
  it('is quiet while rows are still undefined (2026-09-08: the Archived freeze; U-22)', async () => {
    // The original loop was TanStack Table's auto-reset seeing a new `[]`
    // every render. The table is gone, but the rule is the same: three renders
    // asked for, three commits, and nothing arriving while the test waits.
    let commits = 0
    const ui = (n: number) => (
      <Profiler id="list" onRender={() => void (commits += 1)}>
        <Harness items={undefined} key="h" data-n={n} />
      </Profiler>
    )
    const view = render(ui(0))
    await settle()
    view.rerender(ui(1))
    await settle()
    view.rerender(ui(2))
    await settle()
    const after = commits
    await settle()
    expect(after).toBeLessThanOrEqual(3)
    expect(commits).toBe(after)
  })

  it('draws group headers with counts, continued on the next page (U-18, U-19)', () => {
    const items = [...many(150).map((t) => item(t.id, { tags: ['a'] })), item('zz', { tags: ['b'] })]
    render(<Harness items={items} />)
    act(() => useChromeStore.getState().setListPrefs('teams', { group: 'tag' }))
    expect(screen.getByRole('heading', { name: /A · 150/ })).toBeTruthy()
    act(() => useChromeStore.getState().setListState('teams', { page: 2 }))
    expect(screen.getByRole('heading', { name: /A · 150/ })).toBeTruthy()
    expect(screen.getByText('(continued)')).toBeTruthy()
    expect(screen.getByRole('heading', { name: /B · 1/ })).toBeTruthy()
  })

  it('sorts by a column header, flips on a second click, and says so (U-10)', () => {
    render(<Harness items={[item('b', { n: 2 }), item('a', { n: 9 })]} />)
    const plays = () => screen.getByRole('button', { name: /^Plays/ })
    fireEvent.click(plays())
    expect(plays().closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('ascending')
    fireEvent.click(plays())
    expect(plays().closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('descending')
    expect(screen.getAllByText(/^[ab]$/).map((b) => b.textContent)).toEqual(['a', 'b'])
  })

  it('offers Clear filters when a filter empties the list (U-08)', () => {
    render(<Harness items={[item('a', { n: 1 })]} />)
    act(() => useChromeStore.getState().setListState('teams', { filters: { big: true } }))
    expect(screen.getByText('Nothing matches')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(screen.getByText('a')).toBeTruthy()
  })

  it('draws an item in two groups twice, keyed apart, and selects it once (M-37, B-11)', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const onArchive = vi.fn()
    render(<Harness items={[item('q', { tags: ['a', 'b'] })]} onArchive={onArchive} />)
    act(() => useChromeStore.getState().setListPrefs('teams', { group: 'tag' }))
    expect(screen.getAllByText('q')).toHaveLength(2)
    expect(screen.getAllByText(/also in/)).toHaveLength(2)
    fireEvent.click(screen.getAllByRole('checkbox', { name: 'Select q' })[0]!)
    expect(screen.getAllByRole('checkbox', { name: 'Select q' }).every((c) => (c as HTMLInputElement).checked)).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Archive 1' }))
    expect(onArchive).toHaveBeenCalledWith(['q'])
    expect(error.mock.calls.some((c) => String(c[0]).includes('same key'))).toBe(false)
    error.mockRestore()
  })

  it('selects across pages from the bulk bar (B-01)', () => {
    const onArchive = vi.fn()
    render(<Harness items={many(250)} onArchive={onArchive} />)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(screen.getByText('100 selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Select all 250' }))
    expect(screen.getByText('250 selected (100 on this page)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Archive 250' }))
    expect(onArchive.mock.calls[0]![0]).toHaveLength(250)
  })

  it('draws 100 rows a page and only virtualizes with All over 200 (R-01, R-02)', () => {
    render(<Harness items={many(300)} />)
    expect(screen.getAllByText(/^t\d{4}$/)).toHaveLength(100)
    expect(screen.getByText('1–100 of 300 teams')).toBeTruthy()
    act(() => useChromeStore.getState().setListPrefs('teams', { pageSize: 'all' }))
    expect(screen.queryAllByText(/^t\d{4}$/).length).toBeLessThan(300)
  })

  it('shows the empty state when there is nothing at all, and grid view has no header row (R-05, U-12)', () => {
    const { unmount } = render(<Harness items={[]} />)
    expect(screen.getByText('No teams yet')).toBeTruthy()
    unmount()
    render(<Harness items={[item('a')]} layout="grid" />)
    expect(document.querySelector('[data-list-header]')).toBeNull()
  })
})
