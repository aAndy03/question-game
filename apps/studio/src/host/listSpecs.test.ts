import { describe, expect, it } from 'vitest'
import { gamesSpec, operatorsSpec, questionsSpec, teamsSpec, type GameItem, type QuestionItem } from './listSpecs'
import { listView, type ListItem, type ListSpec, type ListViewState } from './listView'
import type { Operator, Question, Recipe, Team } from './types'

/** Stable 1.1: what each library tab offers, and that each reads the right field. */

const STATE: ListViewState = { filters: {}, changed: 'any', hits: null, sort: { id: '', desc: false }, group: null, page: 1, pageSize: 'all', collapsed: new Set(), now: 0 }
const run = <T,>(spec: ListSpec<T>, items: readonly T[], over: Partial<ListViewState>, id: (t: T) => string) =>
  listView(items.map((t) => ({ id: id(t), data: t, view: null }) as ListItem<T>), spec, { ...STATE, sort: spec.defaults.sort, ...over }).entries.flatMap((e) =>
    e.kind === 'row' ? [e.row.key] : [`#${e.group.label}`],
  )

const q = (id: string, over: Partial<Question> = {}): Question => ({
  id,
  origin: 'operator',
  stem: id,
  mediaAssetId: null,
  options: [
    { id: `${id}a`, text: 'a', correct: true },
    { id: `${id}b`, text: 'b', correct: false },
  ],
  difficulty: 50,
  explanation: null,
  createdAt: 0,
  updatedAt: 0,
  archivedAt: null,
  ...over,
})
const qi = (question: Question, domains: string[] = [], gaps: QuestionItem['gaps'] = []): QuestionItem => ({ question, gaps, domains: domains.map((d) => ({ id: d, name: d })) })
const ids = (items: readonly QuestionItem[], spec: ListSpec<QuestionItem>, over: Partial<ListViewState> = {}) => run(spec, items, over, (i) => i.question.id)

describe('the Questions tab (T-01–T-09, T-19)', () => {
  const all = questionsSpec({ allQuestions: true, domains: [{ id: 'hist', name: 'History' }] })
  const one = questionsSpec({ allQuestions: false, domains: [{ id: 'hist', name: 'History' }] })

  it('offers exactly its filters, sorts and groups, the Domain filter only under All questions', () => {
    expect(all.filters.map((f) => f.id)).toEqual(['band', 'difficulty', 'answer', 'completeness', 'domain', 'origin'])
    expect(one.filters.map((f) => f.id)).toEqual(['band', 'difficulty', 'answer', 'completeness', 'origin'])
    expect(all.sorts.map((s) => s.id)).toEqual(['difficulty', 'text', 'domains', 'changed', 'created'])
    expect(all.groups.map((g) => g.id)).toEqual(['domain', 'band', 'answer', 'completeness'])
    expect(all.defaults).toEqual({ sort: { id: 'difficulty', desc: false }, group: null, pageSize: 100 })
  })

  const items = [
    qi(q('easy', { difficulty: 10 }), ['hist']),
    qi(q('hard', { difficulty: 90, options: [{ id: 'x', text: 'x', correct: true }, { id: 'y', text: 'y', correct: true }] }), ['hist', 'sci']),
    qi(q('unset', { difficulty: null, origin: 'seed' }), [], ['difficulty', 'domain']),
  ]

  it('reads band, range, answer, completeness, domain and origin from the question', () => {
    expect(ids(items, all, { filters: { band: ['hard'] } })).toEqual(['hard'])
    expect(ids(items, all, { filters: { difficulty: { min: 1, max: 50 } } })).toEqual(['easy'])
    expect(ids(items, all, { filters: { answer: 'multiple' } })).toEqual(['hard'])
    expect(ids(items, all, { filters: { completeness: 'incomplete' } })).toEqual(['unset'])
    expect(ids(items, all, { filters: { completeness: 'complete' } })).toEqual(['easy', 'hard'])
    expect(ids(items, all, { filters: { domain: ['sci'] } })).toEqual(['hard'])
    expect(ids(items, all, { filters: { origin: 'seed' } })).toEqual(['unset'])
  })

  it('sorts difficulty with the unset last, and by domain count', () => {
    expect(ids(items, all, { sort: { id: 'difficulty', desc: true } })).toEqual(['hard', 'easy', 'unset'])
    expect(ids(items, all, { sort: { id: 'domains', desc: true } })).toEqual(['hard', 'easy', 'unset'])
  })

  it('groups by domain with No domain last, and by band with Not set last', () => {
    expect(ids(items, all, { group: 'domain' })).toEqual(['#hist', 'hist:easy', 'hist:hard', '#sci', 'sci:hard', '#No domain', '~none:unset'])
    expect(ids(items, all, { group: 'band' })).toEqual(['#Easy', 'easy:easy', '#Hard', 'hard:hard', '#Not set', '~none:unset'])
    expect(ids(items, all, { group: 'completeness' })).toEqual(['#Incomplete', 'incomplete:unset', '#Complete', 'complete:easy', 'complete:hard'])
  })
})

const team = (id: string, over: Partial<Team> = {}): Team => ({ id, origin: 'operator', name: id, shortCode: id, color: '', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null, ...over })

describe('the Teams tab (T-10)', () => {
  const teams = [team('Alpha', { playCount: 3, lastPlayAt: 5 }), team('Beta'), team('Gamma', { playCount: 1, lastPlayAt: 9 })]
  const t = (over: Partial<ListViewState>) => run(teamsSpec, teams, over, (x) => x.id)

  it('filters and groups on whether a team has played, and sorts by plays and last played', () => {
    expect(teamsSpec.sorts.map((s) => s.id)).toEqual(['name', 'plays', 'lastPlayed', 'changed', 'created'])
    expect(t({ filters: { played: 'never' } })).toEqual(['Beta'])
    expect(t({ filters: { played: 'once' } })).toEqual(['Alpha', 'Gamma'])
    expect(t({ sort: { id: 'lastPlayed', desc: true } })).toEqual(['Gamma', 'Alpha', 'Beta'])
    expect(t({ group: 'played' })).toEqual(['#Played at least once', 'once:Alpha', 'once:Gamma', '#Never played', 'never:Beta'])
  })
})

const recipe = (id: string, over: Partial<Recipe> = {}): Recipe =>
  ({ id, origin: 'operator', name: id, folder: null, tags: [], teams: [], board: [], settings: {}, layout: {}, overlays: {}, rev: 1, createdAt: 0, updatedAt: 0, archivedAt: null, ...over }) as unknown as Recipe

describe('the Games tab (T-11–T-16)', () => {
  const recipes = [recipe('Quiz', { folder: 'Season 1', tags: ['live'], teams: ['a', 'b'], updatedAt: 1 }), recipe('Draft', { updatedAt: 3 }), recipe('Old', { folder: 'Season 1', archivedAt: 5, updatedAt: 2 })]
  const items: GameItem[] = recipes.map((r) => ({ recipe: r, playing: r.id === 'Quiz', questions: r.id === 'Quiz' ? 7 : 0 }))
  const spec = gamesSpec(recipes)
  const g = (over: Partial<ListViewState>) => run(spec, items, over, (x) => x.recipe.id)

  it('offers the folders and tags the games have, and knows which is playing', () => {
    expect(spec.filters.find((f) => f.id === 'folder')?.options).toEqual([{ value: 'Season 1', label: 'Season 1' }])
    expect(spec.filters.find((f) => f.id === 'tag')?.options).toEqual([{ value: 'live', label: 'live' }])
    expect(g({ filters: { playing: true } })).toEqual(['Quiz'])
    expect(g({ filters: { folder: ['Season 1'], tag: ['live'] } })).toEqual(['Quiz'])
  })

  it('keeps 1.0.2\x27s order — most recently changed first — and groups by folder and status (T-19)', () => {
    expect(spec.defaults.sort).toEqual({ id: 'changed', desc: true })
    expect(g({})).toEqual(['Draft', 'Old', 'Quiz'])
    expect(g({ group: 'folder' })).toEqual(['#Season 1', 'f:Season 1:Old', 'f:Season 1:Quiz', '#No folder', '~none:Draft'])
    expect(g({ group: 'status' })).toEqual(['#Playing', 'playing:Quiz', '#Ready', 'ready:Draft', '#Archived', 'archived:Old'])
    expect(g({ sort: { id: 'questions', desc: true } })[0]).toBe('Quiz')
  })
})

describe('the Operators tab (T-17, T-18)', () => {
  const op = (id: string, over: Partial<Operator> = {}): Operator => ({ id, displayName: id, pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null, ...over })
  const items = [{ operator: op('Ana', { pinHash: 'h', playsRun: 4 }), active: true }, { operator: op('Bo', { lastActiveAt: 3 }), active: false }]
  const o = (over: Partial<ListViewState>) => run(operatorsSpec, items, over, (x) => x.operator.id)

  it('filters on a PIN and the active operator, offers no groups', () => {
    expect(operatorsSpec.groups).toEqual([])
    expect(o({ filters: { pin: true } })).toEqual(['Ana'])
    expect(o({ filters: { active: true } })).toEqual(['Ana'])
    expect(o({ sort: { id: 'playsRun', desc: true } })).toEqual(['Ana', 'Bo'])
    expect(o({ sort: { id: 'lastActive', desc: false } })).toEqual(['Bo', 'Ana'])
  })
})
