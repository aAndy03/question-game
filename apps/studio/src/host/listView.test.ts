import { describe, expect, it } from 'vitest'
import { changedSince, footerText, listView, normalizeRange, type FilterValue, type ListItem, type ListSpec, type ListViewState } from './listView'

/**
 * Stable 1.1: the list-view model every library tab runs through — filter,
 * sort, group, page — pure, over the whole list the host already sends.
 */

interface Thing {
  id: string
  name: string
  n: number | null
  tags: readonly string[]
  at: number
  archived?: boolean
}

const NOW = Date.UTC(2026, 9, 20, 12)
const H = 3_600_000
const D = 24 * H
const collator = new Intl.Collator('en', { sensitivity: 'base', numeric: true })

const SPEC: ListSpec<Thing> = {
  tab: 'teams',
  noun: { one: 'thing', many: 'things' },
  filters: [
    { id: 'tag', label: 'Tag', kind: 'multi', test: (t, v) => (v as readonly string[]).some((x) => t.tags.includes(x)) },
    { id: 'big', label: 'Big', kind: 'toggle', test: (t, v) => !v || (t.n ?? 0) > 5 },
    { id: 'n', label: 'N', kind: 'range', test: (t, v) => {
      const r = v as { min: number; max: number }
      return t.n !== null && t.n >= r.min && t.n <= r.max
    } },
  ],
  sorts: [
    { id: 'name', label: 'Name', compare: (a, b) => collator.compare(a.name, b.name) },
    { id: 'n', label: 'N', compare: (a, b) => (a.n as number) - (b.n as number), nullable: (t) => t.n === null },
  ],
  groups: [
    { id: 'tag', label: 'Tag', groupsOf: (t) => (t.tags.length ? t.tags.map((x) => ({ key: x, label: x.toUpperCase(), order: x })) : [{ key: '~none', label: 'No tag', order: 0, last: true }]) },
  ],
  defaults: { sort: { id: 'name', desc: false }, group: null, pageSize: 100 },
  tiebreak: (t) => t.name,
  changedAt: (t) => t.at,
}

const thing = (id: string, over: Partial<Thing> = {}): ListItem<Thing> => {
  const data: Thing = { id, name: id, n: 1, tags: [], at: NOW, ...over }
  return { id, data, view: id }
}

const state = (over: Partial<ListViewState> = {}): ListViewState => ({
  filters: {},
  changed: 'any',
  hits: null,
  sort: { id: 'name', desc: false },
  group: null,
  page: 1,
  pageSize: 100,
  collapsed: new Set(),
  now: NOW,
  ...over,
})

const ids = (items: readonly ListItem<Thing>[], s: Partial<ListViewState> = {}) =>
  listView(items, SPEC, state(s)).entries.flatMap((e) => (e.kind === 'row' ? [e.row.key] : []))

const many = (n: number) => Array.from({ length: n }, (_, i) => thing(`t${String(i).padStart(4, '0')}`))

describe('filters', () => {
  const items = [
    thing('a', { tags: ['x'], n: 9 }),
    thing('b', { tags: ['y'], n: 2 }),
    thing('c', { tags: ['z'], n: 9 }),
    thing('d', { tags: [], n: null }),
  ]

  it('returns every row with nothing on (M-01)', () => {
    const page = listView(items, SPEC, state())
    expect(page.itemCount).toBe(4)
    expect(page.rowCount).toBe(4)
  })

  it('ORs within a multi and ANDs across filters (M-03, M-04)', () => {
    expect(ids(items, { filters: { tag: ['x', 'y'] } })).toEqual(['a', 'b'])
    expect(ids(items, { filters: { tag: ['x', 'y'], big: true } })).toEqual(['a'])
  })

  it('treats null, an empty multi and an unknown id as off, an unknown value as no match (M-09–M-12)', () => {
    expect(ids(items, { filters: { tag: null } })).toHaveLength(4)
    expect(ids(items, { filters: { tag: [] } })).toHaveLength(4)
    expect(ids(items, { filters: { bogus: ['x'] } as Record<string, FilterValue | null> })).toHaveLength(4)
    expect(ids(items, { filters: { tag: ['nope'] } })).toEqual([])
  })

  it('takes a range inclusively and leaves out a missing value (M-05, M-07)', () => {
    const r = [thing('lo', { n: 29 }), thing('a', { n: 30 }), thing('b', { n: 70 }), thing('hi', { n: 71 }), thing('none', { n: null })]
    expect(ids(r, { filters: { n: { min: 30, max: 70 } } })).toEqual(['a', 'b'])
  })

  it('keeps what changed today, in 7 days, in 30 days (M-13)', () => {
    const r = [thing('h', { at: NOW - H }), thing('d3', { at: NOW - 3 * D }), thing('d20', { at: NOW - 20 * D }), thing('d40', { at: NOW - 40 * D })]
    expect(ids(r, { changed: 'today' })).toEqual(['h'])
    expect(ids(r, { changed: '7d' })).toEqual(['d3', 'h'])
    expect(ids(r, { changed: '30d' })).toEqual(['d3', 'd20', 'h'])
    expect(ids(r, { changed: 'any' })).toHaveLength(4)
  })

  it('counts 7 days inclusively, and today from local midnight (M-14, M-15)', () => {
    expect(changedSince('7d', NOW)).toBe(NOW - 7 * D)
    const midnight = new Date(NOW)
    midnight.setHours(0, 0, 0, 0)
    expect(changedSince('today', NOW)).toBe(midnight.getTime())
    expect(changedSince('any', NOW)).toBeNull()
    expect(ids([thing('edge', { at: NOW - 7 * D })], { changed: '7d' })).toEqual(['edge'])
  })

  it('keeps only search hits while searching (M-33)', () => {
    expect(ids(items, { hits: new Map([['a', 1], ['c', 2]]) })).toEqual(['a', 'c'])
  })
})

describe('sort', () => {
  it('sorts both ways; ties ascend by tiebreak then id whichever way (M-23, M-27)', () => {
    const r = [thing('m', { n: 5 }), thing('b', { name: 'tie', n: 3 }), thing('a', { name: 'tie', n: 3 }), thing('z', { n: 9 })]
    expect(ids(r, { sort: { id: 'n', desc: false } })).toEqual(['a', 'b', 'm', 'z'])
    expect(ids(r, { sort: { id: 'n', desc: true } })).toEqual(['z', 'm', 'a', 'b'])
  })

  it('is stable whatever order the list arrives in (M-28)', () => {
    const r = Array.from({ length: 30 }, (_, i) => thing(`x${i}`, { name: `n${i % 4}`, n: i % 3 }))
    const want = ids(r, { sort: { id: 'n', desc: false } })
    for (let k = 0; k < 20; k++) {
      const shuffled = [...r].sort(() => Math.random() - 0.5)
      expect(ids(shuffled, { sort: { id: 'n', desc: false } })).toEqual(want)
    }
  })

  it('compares text without case or accents, numbers as numbers (M-29)', () => {
    const r = [thing('1', { name: 'item 10' }), thing('2', { name: 'Item 9' }), thing('3', { name: 'ăla' }), thing('4', { name: 'Ala' })]
    const order = ids(r)
    expect(order.indexOf('2')).toBeLessThan(order.indexOf('1'))
    expect(Math.abs(order.indexOf('3') - order.indexOf('4'))).toBe(1)
  })

  it('puts a missing value last in both directions (M-30)', () => {
    const r = [thing('none', { n: null }), thing('a', { n: 1 }), thing('b', { n: 2 })]
    expect(ids(r, { sort: { id: 'n', desc: false } })).toEqual(['a', 'b', 'none'])
    expect(ids(r, { sort: { id: 'n', desc: true } })).toEqual(['b', 'a', 'none'])
  })

  it('orders Best match by score, ties by tiebreak (M-31, M-32)', () => {
    const r = [thing('a'), thing('b'), thing('c'), thing('d')]
    const hits = new Map([['b', 0.9], ['a', 0.5], ['c', 0.1], ['d', 0.5]])
    expect(ids(r, { hits, sort: { id: 'match', desc: true } })).toEqual(['b', 'a', 'd', 'c'])
  })

  it('falls back to the default sort for an id it does not know (M-34)', () => {
    expect(ids([thing('b'), thing('a')], { sort: { id: 'bogus', desc: true } })).toEqual(['a', 'b'])
  })
})

describe('groups', () => {
  const r = [thing('q1', { tags: ['zeta'] }), thing('q2', { tags: ['alpha', 'zeta'] }), thing('q3', { tags: [] }), thing('q4', { tags: ['alpha'] })]

  it('orders headers, puts No tag last, counts rows, and shows a two-group item under both (M-35–M-39)', () => {
    const page = listView(r, SPEC, state({ group: 'tag' }))
    const shape = page.entries.map((e) => (e.kind === 'header' ? `# ${e.group.label} · ${e.group.count}` : e.row.key))
    expect(shape).toEqual(['# ALPHA · 2', 'alpha:q2', 'alpha:q4', '# ZETA · 2', 'zeta:q1', 'zeta:q2', '# No tag · 1', '~none:q3'])
    const q2 = page.entries.find((e) => e.kind === 'row' && e.row.key === 'alpha:q2')
    expect(q2?.kind === 'row' && q2.row.alsoIn).toEqual(['ZETA'])
    expect(page.rowCount).toBe(5)
    expect(page.itemCount).toBe(4)
  })

  it('keeps the sort inside each group (M-47)', () => {
    const page = listView(r, SPEC, state({ group: 'tag', sort: { id: 'name', desc: true } }))
    expect(page.entries.filter((e) => e.kind === 'row').map((e) => (e.kind === 'row' ? e.row.key : ''))).toEqual(['alpha:q4', 'alpha:q2', 'zeta:q2', 'zeta:q1', '~none:q3'])
  })
})

describe('pages', () => {
  it('cuts 250 rows into pages of 100 (M-50)', () => {
    const items = many(250)
    expect(listView(items, SPEC, state({ page: 2 }))).toMatchObject({ page: 2, pageCount: 3, from: 101, to: 200 })
    expect(listView(items, SPEC, state({ page: 3 })).pageIds).toHaveLength(50)
  })

  it('offers 50, 250 and All (M-51)', () => {
    const items = many(260)
    expect(listView(items, SPEC, state({ pageSize: 50 })).pageCount).toBe(6)
    expect(listView(items, SPEC, state({ pageSize: 250 })).pageCount).toBe(2)
    expect(listView(items, SPEC, state({ pageSize: 'all' }))).toMatchObject({ pageCount: 1, from: 1, to: 260 })
  })

  it('clamps a page past either end, and an empty list is one empty page (M-52–M-54, M-73)', () => {
    const items = many(201)
    expect(listView(items, SPEC, state({ page: 9 })).page).toBe(3)
    expect(listView(items, SPEC, state({ page: 0 })).page).toBe(1)
    // The last row of page 3 archived: the page moves back one, not to 1.
    expect(listView(many(200), SPEC, state({ page: 3 })).page).toBe(2)
    expect(listView([], SPEC, state())).toMatchObject({ page: 1, pageCount: 1, from: 0, to: 0, entries: [] })
  })

  it('repeats a group header on the next page as continued, but not at an exact boundary (M-55–M-58)', () => {
    const items = [...many(150).map((t) => thing(t.id, { tags: ['a'] })), ...many(160).slice(150).map((t) => thing(t.id, { tags: ['b'] }))]
    const p2 = listView(items, SPEC, state({ group: 'tag', page: 2 }))
    expect(p2.entries[0]).toEqual({ kind: 'header', group: { key: 'a', label: 'A', count: 150, continued: true, collapsed: false } })
    expect(p2.entries.filter((e) => e.kind === 'row')).toHaveLength(60)
    const exact = [...many(100).map((t) => thing(t.id, { tags: ['a'] })), thing('zz', { tags: ['b'] })]
    const e2 = listView(exact, SPEC, state({ group: 'tag', page: 2 }))
    expect(e2.entries[0]).toMatchObject({ kind: 'header', group: { key: 'b', continued: false } })
  })

  it('gives a collapsed group its header and count but no page slots, and no selectable ids (M-59, M-60, M-62)', () => {
    const items = [...many(80).map((t) => thing(`a${t.id}`, { tags: ['a'] })), ...many(80).map((t) => thing(`b${t.id}`, { tags: ['b'] }))]
    const page = listView(items, SPEC, state({ group: 'tag', collapsed: new Set(['a']) }))
    expect(page.entries[0]).toMatchObject({ kind: 'header', group: { key: 'a', count: 80, collapsed: true } })
    expect(page.entries.filter((e) => e.kind === 'row')).toHaveLength(80)
    expect(page.rowCount).toBe(80)
    expect(page.selectableIds.every((id) => id.startsWith('b'))).toBe(true)
    const all = listView(items, SPEC, state({ group: 'tag', collapsed: new Set(['a', 'b', 'nope']) }))
    expect(all).toMatchObject({ pageCount: 1, rowCount: 0 })
    expect(all.entries.filter((e) => e.kind === 'header')).toHaveLength(2)
  })
})

describe('footer (M-63–M-67)', () => {
  const NOUN = { one: 'question', many: 'questions' }
  it('says which rows of how many', () => {
    expect(footerText({ from: 1, to: 30, rowCount: 30, itemCount: 30 }, NOUN)).toBe('1–30 of 30 questions')
    expect(footerText({ from: 101, to: 200, rowCount: 1234, itemCount: 1234 }, NOUN)).toBe('101–200 of 1,234 questions')
    expect(footerText({ from: 101, to: 200, rowCount: 1310, itemCount: 1234 }, NOUN)).toBe('101–200 of 1,310 rows · 1,234 questions')
    expect(footerText({ from: 1, to: 1, rowCount: 1, itemCount: 1 }, NOUN)).toBe('1–1 of 1 question')
    expect(footerText({ from: 1201, to: 1234, rowCount: 1234, itemCount: 1234 }, NOUN)).toBe('1,201–1,234 of 1,234 questions')
    expect(footerText({ from: 0, to: 0, rowCount: 0, itemCount: 0 }, NOUN)).toBe('')
  })
})

describe('purity and speed (M-71, U-27)', () => {
  it('does not touch its inputs', () => {
    const items = Object.freeze(many(5).map((t) => Object.freeze(t)))
    const s = Object.freeze(state({ group: 'tag' }))
    expect(() => listView(items, SPEC, s)).not.toThrow()
    expect(listView(items, SPEC, s)).toEqual(listView(items, SPEC, s))
  })

  it('runs 3,000 items through every step in well under a frame budget', () => {
    const items = Array.from({ length: 3000 }, (_, i) => thing(`q${i}`, { name: `Question ${i}`, n: i % 100, tags: [`d${i % 12}`, ...(i % 7 === 0 ? ['d0'] : [])], at: NOW - (i % 40) * D }))
    const s = state({ filters: { n: { min: 10, max: 90 }, tag: ['d1', 'd2', 'd3', 'd0'] }, changed: '30d', sort: { id: 'n', desc: true }, group: 'tag' })
    const times: number[] = []
    for (let k = 0; k < 5; k++) {
      const t0 = performance.now()
      listView(items, SPEC, s)
      times.push(performance.now() - t0)
    }
    times.sort((a, b) => a - b)
    expect(times[2]).toBeLessThan(50)
  })
})

describe('deferred fixes', () => {
  it('says how many rows the collapsed groups hold when nothing else is on screen', () => {
    const items = many(3).map((t) => thing(t.id, { tags: ['a'] }))
    const page = listView(items, SPEC, state({ group: 'tag', collapsed: new Set(['a']) }))
    expect(page.collapsedCount).toBe(3)
    expect(footerText(page, { one: 'thing', many: 'things' })).toBe('3 things in collapsed groups')
  })

  it('treats a range that spans the whole bounds as no filter, and a reversed one as its right way round', () => {
    const r = [thing('lo', { n: 10 }), thing('hi', { n: 90 }), thing('none', { n: null })]
    expect(ids(r, { filters: { n: { min: 80, max: 20 } } })).toEqual([])
    expect(normalizeRange({ min: 80, max: 20 }, { min: 1, max: 100 })).toEqual({ min: 20, max: 80 })
    expect(normalizeRange({ min: 1, max: 100 }, { min: 1, max: 100 })).toBeNull()
    expect(normalizeRange({ min: 5, max: 100 }, { min: 1, max: 100 })).toEqual({ min: 5, max: 100 })
  })
})
