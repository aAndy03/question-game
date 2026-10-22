import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EMPTY_PLAY_STATE, type PlayStateForMain } from '@questiongame/contract'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { FAKE_LEDGER } from '@/host/fake/preview'
import { demoLibrary, demoPlay, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { keyboardDrag, stubRowLayout } from '@/test/sortable'
import { STATS } from '@/copy/stats'
import { PREVIEW } from '@/copy/preview'
import { WORKSPACE } from '@/copy/workspaces'
import type { CatalogItem, StatsDimension, StatsMetric, StatsQuery, StatsResult, TurnAward } from '@/host/types'

/**
 * Every picture a chart was handed, by its element. ECharts itself is kept;
 * only `init` is a spy, and it is reached only where a test gives the charts
 * a width (`widenCharts`) — everywhere else jsdom's width of 0 keeps the chart
 * from being created at all, as it always did.
 */
const drawn = vi.hoisted(() => new Map<Element, unknown[]>())
vi.mock('echarts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('echarts')>()
  return {
    ...actual,
    init: (el: HTMLElement) => {
      const options: unknown[] = []
      drawn.set(el, options)
      return { setOption: (option: unknown) => void options.push(option), resize: () => {}, dispose: () => {} }
    },
  }
})

/** P20, the interface pass, in Studio: route-level rules (05_STUDIO_DESIGN.md §26). */
let fake: FakeHost

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
  receivePlayState(null)
  fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
})
afterEach(() => {
  setHostTransport(null)
  cleanup()
})

async function at(route: Route) {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go(route)
  })
}

describe('the opened row starts below the toolbar (P20)', () => {
  it('on Questions the toolbar is not in the row the aside opens in, so Status never wraps under it', async () => {
    await at({ tab: 'library', questionId: 'q-h1', mode: 'view' })
    const aside = await screen.findByRole('complementary', { name: 'Details' })
    const toolbar = document.querySelector('[data-list-toolbar]') as HTMLElement
    expect(toolbar).not.toBeNull()
    expect(aside.parentElement?.contains(toolbar)).toBe(false)
  })

  it('on Teams too, the toolbar sits above the aside’s row', async () => {
    await at({ tab: 'teams', id: 'team-alpha', mode: 'view' })
    const aside = await screen.findByRole('complementary', { name: 'Details' })
    const toolbar = document.querySelector('[data-list-toolbar]') as HTMLElement
    expect(aside.parentElement?.contains(toolbar)).toBe(false)
  })
})

describe('editor pages use the width (P20)', () => {
  it('a new team shows its preview beside the form: the Studio mark and the Stage letter, from the draft', async () => {
    await at({ tab: 'teams', mode: 'new' })
    const side = await screen.findByRole('complementary', { name: 'Preview' })
    fireEvent.change(screen.getByRole('textbox', { name: /^Name/ }), { target: { value: 'Rapid' } })
    expect(within(side).getAllByText('RAPID').length).toBeGreaterThan(0)
    expect(within(side).getByTestId('stage-letter').textContent).toBe('R')
    expect(screen.getAllByRole('button', { name: /^Save/ })).toHaveLength(1)
  })

  it('a theme colour previews as Theme colour, never as its token', async () => {
    const alpha = fake.library.get('team:team-alpha')
    if (alpha?.kind !== 'team') throw new Error('alpha')
    fake.library.set('team:team-alpha', { kind: 'team', item: { ...alpha.item, color: 'var(--state-incorrect)' } })
    await at({ tab: 'teams', id: 'team-alpha', mode: 'edit' })
    const side = await screen.findByRole('complementary', { name: 'Preview' })
    expect(within(side).getAllByText('Theme colour').length).toBeGreaterThan(0)
    expect(document.body.textContent).not.toContain('var(--state-incorrect)')
  })

  it('a question is filed beside its body: domains, domain groups and question tags in the side column', async () => {
    fake.domainGroups.set('dom-history', [{ id: 'g1', domainId: 'dom-history', name: 'Antiquity', sortKey: 0 }])
    await at({ tab: 'library', questionId: 'q-h1', mode: 'edit' })
    const side = await screen.findByRole('complementary', { name: 'Where it is filed' })
    expect(side.querySelector('[data-group-picker="dom-history"]')).not.toBeNull()
    expect(within(side).getByText('Question tags')).toBeTruthy()
    expect(within(side).queryByRole('textbox', { name: /^Question$/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: /^Save/ })).toHaveLength(1)
  })

  it('an operator’s pin, which saves on its own, sits beside the form and not above Save', async () => {
    await at({ tab: 'operators', id: 'op-andy', mode: 'edit' })
    const side = await screen.findByRole('complementary', { name: 'Pin' })
    expect(side.querySelector('[data-operator-pin]')).not.toBeNull()
  })

  it('a new operator has no side column', async () => {
    await at({ tab: 'operators', mode: 'new' })
    await screen.findByRole('textbox', { name: /^Display name/ })
    expect(screen.queryByRole('complementary', { name: 'Pin' })).toBeNull()
  })
})

describe('menus have section names (P20)', () => {
  it('a team’s row menu groups its items under Team, Copy and move, and Status — item names unchanged', async () => {
    await at({ tab: 'teams' })
    const kebabs = await screen.findAllByRole('button', { name: 'Open' })
    fireEvent.click(kebabs[0]!)
    const menu = await screen.findByRole('menu')
    for (const title of ['Team', 'Copy and move', 'Status']) expect(within(menu).getByText(title)).toBeTruthy()
    const names = within(menu).getAllByRole('menuitem').map((i) => i.getAttribute('data-key') ?? i.textContent)
    expect(names.length).toBe(6)
    expect(within(menu).getByRole('menuitem', { name: 'Copy to…' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Archive' })).toBeTruthy()
  })

  it('a disabled item says why under its name', async () => {
    await fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op-andy' } })
    await at({ tab: 'operators' })
    await screen.findAllByText('Andy M.')
    const kebabs = screen.getAllByRole('button', { name: 'Open' })
    // The active operator's row (op-andy) is the first, by name.
    fireEvent.click(kebabs[0]!)
    const menu = await screen.findByRole('menu')
    const activate = within(menu).getByRole('menuitem', { name: /Make active/ })
    expect(activate.getAttribute('aria-disabled')).toBe('true')
    expect(activate.textContent).toContain('Already the active operator')
  })

  it('the bulk Edit… menu is sectioned: Question tags, Domains, Difficulty', async () => {
    await at({ tab: 'library', domainId: 'dom-history' })
    const box = await screen.findByRole('checkbox', { name: /^Select Which empire/ })
    fireEvent.click(box)
    fireEvent.click(await screen.findByRole('button', { name: 'Edit…' }))
    const menu = await screen.findByRole('menu')
    for (const title of ['Question tags', 'Domains', 'Difficulty']) expect(within(menu).getByText(title)).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Set difficulty…' })).toBeTruthy()
  })
})

describe('managers for question tags and domain groups (P20)', () => {
  const tagged = (id: string, tags: string[]) => {
    const row = fake.library.get(`question:${id}`)
    if (row?.kind !== 'question') throw new Error(id)
    fake.library.set(`question:${id}`, { kind: 'question', item: { ...row.item, tags } })
  }

  it('the chosen question tag shows its questions; Show in list filters the list to it and closes', async () => {
    tagged('q-h1', ['Rome'])
    tagged('q-h2', ['Rome'])
    await at({ tab: 'library' })
    fireEvent.click(await screen.findByRole('button', { name: 'Question tags…' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('option', { name: /Rome/ }))
    expect(within(dialog).getByRole('list', { name: 'Tags on this question' }).querySelectorAll('li')).toHaveLength(2)
    fireEvent.click(within(dialog).getByRole('button', { name: 'Show in list' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(useChromeStore.getState().listState.library?.filters?.tag).toEqual(['rome'])
  })

  it('Merge into… moves a question tag onto another in one write, judged on press', async () => {
    tagged('q-h1', ['Rome'])
    tagged('q-h2', ['Roma'])
    await at({ tab: 'library' })
    fireEvent.click(await screen.findByRole('button', { name: 'Question tags…' }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('option', { name: /Roma/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge into…' }))
    const merge = await screen.findByRole('alertdialog')
    fireEvent.click(within(merge).getByRole('button', { name: 'Merge' }))
    // Nothing picked: nothing written, the dialog stays.
    expect(fake.calls.filter((c) => c.name === 'tag_rename')).toHaveLength(0)
    expect(screen.getByRole('alertdialog')).toBeTruthy()
  })

  it('a domain’s groups list *No domain group* with its count, and a merge is one host call with into', async () => {
    fake.domainGroups.set('dom-history', [
      { id: 'g1', domainId: 'dom-history', name: 'Antiquity', sortKey: 0 },
      { id: 'g2', domainId: 'dom-history', name: 'Modern', sortKey: 1 },
    ])
    await at({ tab: 'library', domainId: 'dom-history' })
    fireEvent.click(await screen.findByRole('button', { name: 'Domain groups…' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByRole('option', { name: /No domain group/ }).textContent).toContain('4')
    fireEvent.click(within(dialog).getByRole('option', { name: /Antiquity/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Merge into…' }))
    const merge = await screen.findByRole('alertdialog')
    fireEvent.change(merge.querySelector('select') as HTMLSelectElement, { target: { value: 'g2' } })
    fireEvent.click(within(merge).getByRole('button', { name: 'Merge' }))
    await waitFor(() => expect(fake.domainGroups.get('dom-history')?.map((g) => g.id)).toEqual(['g2']))
    expect(fake.calls.filter((c) => c.name === 'domain_group_delete').map((c) => c.args)).toEqual([{ id: 'g1', into: 'g2' }])
  })
})

describe('game tags and folders (P20)', () => {
  const second = (over: Partial<import('@/host/types').Recipe> = {}) => {
    fake.seed([], [{ ...demoRecipe(), id: 'recipe-two', name: 'Finals night', folder: 'Finals', tags: ['demo'], ...over }])
  }
  const labelWrites = () => fake.calls.filter((c) => c.name === 'recipe_bulk_edit' && c.args?.['preview'] === false).map((c) => c.args)

  it('the Game page’s first panel is Name · Folder · Game tags, each with its value', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' })
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    const folder = screen.getByRole('combobox', { name: /^Folder/ })
    expect((folder as HTMLInputElement).value).toBe('Season 3')
    expect(screen.getByRole('list', { name: 'Game tags on this game' }).textContent).toContain('four teams')
    expect(name.compareDocumentPosition(folder) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.queryByText(/Question tag/)).toBeNull()
  })

  it('a new folder typed and entered is one label write — no recipe_upsert', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' })
    const folder = await screen.findByRole('combobox', { name: /^Folder/ })
    fireEvent.change(folder, { target: { value: 'Semis' } })
    fireEvent.keyDown(folder, { key: 'Enter' })
    await waitFor(() => expect(labelWrites()).toEqual([{ ids: ['recipe-demo'], edits: [{ op: 'set_folder', folder: 'Semis' }], preview: false }]))
    expect(fake.calls.filter((c) => c.name === 'recipe_upsert')).toHaveLength(0)
    await waitFor(() => expect(fake.recipes.get('recipe-demo')?.folder).toBe('Semis'))
  })

  it('a game tag added on the page is a tag edit, and removing one is an untag', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' })
    const field = await screen.findByRole('textbox', { name: /^Game tags/ })
    fireEvent.change(field, { target: { value: 'Juniors' } })
    fireEvent.keyDown(field, { key: 'Enter' })
    await waitFor(() => expect(labelWrites().at(-1)).toEqual({ ids: ['recipe-demo'], edits: [{ op: 'tag', tag: 'Juniors' }], preview: false }))
    fireEvent.click(await screen.findByRole('button', { name: 'Remove the game tag demo' }))
    await waitFor(() => expect(labelWrites().at(-1)?.['edits']).toEqual([{ op: 'untag', tag: 'demo' }]))
  })

  it('labels stay editable while the game plays; the name does not', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' })
    act(() => receivePlayState({ ...demoPlay('question-issued'), status: 'playing' }))
    const name = await screen.findByRole('textbox', { name: /^Name/ })
    expect(name.hasAttribute('disabled') || name.getAttribute('aria-disabled') === 'true').toBe(true)
    const folder = screen.getByRole('combobox', { name: /^Folder/ })
    expect(folder.hasAttribute('disabled')).toBe(false)
  })

  it('the Games bulk Edit… is sectioned Folder and Game tags, and Set folder… applies without a blur', async () => {
    second()
    await at({ tab: 'games' })
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select Season opener' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select Finals night' }))
    fireEvent.click(screen.getByRole('button', { name: 'Edit…' }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).getByText('Folder')).toBeTruthy()
    expect(within(menu).getByText('Game tags')).toBeTruthy()
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Set folder…' }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.change(within(dialog).getByRole('combobox', { name: /^Folder/ }), { target: { value: 'Grand final' } })
    expect(within(dialog).getByText('Applies to 2 games.')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(labelWrites()).toEqual([{ ids: ['recipe-demo', 'recipe-two'], edits: [{ op: 'set_folder', folder: 'Grand final' }], preview: false }]))
  })

  it('a game’s row menu has Organise between Game and Copy and move', async () => {
    await at({ tab: 'games' })
    fireEvent.click((await screen.findAllByRole('button', { name: 'Open' }))[0]!)
    const menu = await screen.findByRole('menu')
    const text = menu.textContent ?? ''
    expect(text.indexOf('Organise')).toBeGreaterThan(text.indexOf('Game'))
    expect(text.indexOf('Organise')).toBeLessThan(text.indexOf('Copy and move'))
    expect(within(menu).getByRole('menuitem', { name: 'Folder…' })).toBeTruthy()
    expect(within(menu).getByRole('menuitem', { name: 'Game tags…' })).toBeTruthy()
  })

  it('the manager lists folders and game tags with counts, and renaming a folder moves its games', async () => {
    second()
    await at({ tab: 'games' })
    fireEvent.click(await screen.findByRole('button', { name: 'Folders and game tags…' }))
    const dialog = await screen.findByRole('dialog')
    const demo = within(dialog).getByRole('option', { name: /demo/ })
    expect(demo.textContent).toContain('2')
    fireEvent.click(within(dialog).getByRole('option', { name: /Season 3/ }))
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }))
    const field = await screen.findByRole('textbox', { name: /New name/ })
    fireEvent.change(field, { target: { value: 'Season 4' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    await waitFor(() => expect(labelWrites().at(-1)).toEqual({ ids: ['recipe-demo'], edits: [{ op: 'set_folder', folder: 'Season 4' }], preview: false }))
  })

  it('the fake refuses a 21st game tag whole, as the host does', async () => {
    second({ tags: Array.from({ length: 20 }, (_, i) => `t${i}`) })
    await expect(fake.invoke('recipe_bulk_edit', { ids: ['recipe-demo', 'recipe-two'], edits: [{ op: 'tag', tag: 'new' }], preview: false })).rejects.toBeTruthy()
    expect(fake.recipes.get('recipe-demo')?.tags).toEqual(['demo', 'four teams'])
  })
})

describe('a question’s options, by drag and drop (P20)', () => {
  it('reorders the draft, letters following, and saves the new order', async () => {
    const restore = stubRowLayout()
    try {
      await at({ tab: 'library', questionId: 'q-h1', mode: 'edit' })
      const value = (name: string) => (screen.getByRole('textbox', { name }) as HTMLInputElement).value
      await waitFor(() => expect(value('Option B')).not.toBe(''))
      const [first, second] = [value('Option A'), value('Option B')]
      await keyboardDrag(screen.getByRole('button', { name: 'Reorder option A' }), 1)
      await waitFor(() => expect(value('Option A')).toBe(second))
      expect(value('Option B')).toBe(first)
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
      await waitFor(() => {
        const saved = fake.library.get('question:q-h1') as Extract<CatalogItem, { kind: 'question' }>
        expect(saved.item.options.slice(0, 2).map((o) => o.text)).toEqual([second, first])
      })
    } finally {
      restore()
    }
  })
})

// ------------------------------------------------------------ Statistics (Task 10)

const calls = (name: string) => fake.calls.filter((c) => c.name === name)
const statsQueries = () => calls('stats_query').map((c) => (c.args?.['query'] ?? {}) as StatsQuery)

type Figures = Partial<Record<StatsMetric, number | null>>

/** One dimension's answer, written by metric name. */
interface Served {
  rows: { key: string; label: string; by: Figures }[]
  totals?: Figures
  playCount?: number
  /** Defaults to the rows' turns. */
  turnCount?: number
  /** The ledger; without it, what the fake answers for `detail` (`FAKE_LEDGER`). */
  turns?: readonly TurnAward[]
}

/**
 * A `stats_query` answers the rows given for its `groupBy`, each value filled
 * **by the metric name the query asked for** — so no test here depends on the
 * order Studio requests its columns in. A dimension not given answers as the
 * fake does; `detail > 0` still brings the fake's ledger.
 */
function serveStats(host: FakeHost, by: Partial<Record<StatsDimension, Served>>) {
  const invoke = host.invoke.bind(host)
  host.invoke = (async (name: Parameters<FakeHost['invoke']>[0], args?: Record<string, unknown>) => {
    const answer = await invoke<StatsResult>(name, args)
    if (name !== 'stats_query') return answer
    const query = (args?.['query'] ?? {}) as StatsQuery
    const served = by[query.groupBy ?? 'team']
    if (!served) return answer
    const metrics = query.metrics ?? []
    const values = (figures: Figures) => metrics.map((m) => figures[m] ?? null)
    const turnCount = served.turnCount ?? served.rows.reduce((n, row) => n + (row.by.turns ?? 0), 0)
    const playCount = served.playCount ?? 1
    return {
      ...answer,
      metrics,
      rows: served.rows.map((row) => ({ key: row.key, label: row.label, values: values(row.by), turns: row.by.turns ?? 0, plays: 1 })),
      totals: { key: '', label: '', values: values(served.totals ?? {}), turns: turnCount, plays: playCount },
      playCount,
      turnCount,
      turns: served.turns ?? answer.turns ?? [],
    } satisfies StatsResult
  }) as FakeHost['invoke']
}

interface TeamSpec {
  id: string
  name: string
  score: number
  rank: number
  turnsTaken?: number
  color?: string
}

/** A Play on the desk, in `statistics.test.tsx`'s shape (copied, not shared). */
function openPlay(teams: readonly TeamSpec[], over: { currentTeamId?: string | null; roundIndex?: number; remaining?: number } = {}): PlayStateForMain {
  return {
    ...EMPTY_PLAY_STATE,
    playId: 'play-1',
    status: 'playing',
    teams: teams.map((t) => ({
      id: t.id,
      name: t.name,
      shortCode: t.name.toUpperCase(),
      color: t.color ?? 'var(--ink)',
      logoUrl: null,
      detail: null,
      score: t.score,
      rank: t.rank,
      turnsTaken: t.turnsTaken ?? 0,
      active: true,
    })),
    domains: [{ id: 'dom-1', name: 'Geography', code: 'GEO_101', remaining: over.remaining ?? 5, exhausted: false, nextDifficulty: 20 }],
    ring: {
      order: teams.map((t) => t.id),
      currentTeamId: over.currentTeamId === undefined ? (teams[0]?.id ?? null) : over.currentTeamId,
      roundIndex: over.roundIndex ?? 2,
    },
    operator: {
      recipeId: 'recipe-demo',
      legalTokenTargets: [],
      defaultNextTeamId: null,
      consecutiveCorrect: 0,
      isRehearsal: false,
      canUndo: false,
      canRedo: false,
      eventCount: 12,
      showGiveToken: false,
      overrideAfterLock: 'refuse_until_reveal',
      disabled: [],
    },
  }
}

/** Both halves of "a Play is open": the store, and the fake's `get_state` the bridge asks on mount. */
function load(play: PlayStateForMain) {
  fake.playState = play
  receivePlayState(play)
}

const ALPHA_BETA: readonly TeamSpec[] = [
  { id: 'team-alpha', name: 'Alpha', score: 20, rank: 2, turnsTaken: 4 },
  { id: 'team-beta', name: 'Beta', score: 90, rank: 1, turnsTaken: 3 },
]

/** Beta leads with 90 though Alpha has had more turns; the host lists Alpha first (by turns). */
const BY_TEAM: Served = {
  rows: [
    { key: 'team-alpha', label: 'Alpha', by: { turns: 4, correct: 1, accuracy: 0.25, points: 20, fastest_lock_ms: 9100 } },
    { key: 'team-beta', label: 'Beta', by: { turns: 3, correct: 3, accuracy: 1, points: 90, fastest_lock_ms: 8400 } },
  ],
  totals: { turns: 7, correct: 4, accuracy: 0.571, points: 110, fastest_lock_ms: 8400 },
}
const BY_DOMAIN: Served = {
  rows: [{ key: 'dom-1', label: 'Geography', by: { turns: 7, correct: 4, partial: 1, incorrect: 2, points: 110 } }],
  totals: { turns: 7, correct: 4, partial: 1, incorrect: 2, points: 110 },
}
const BY_DIFFICULTY: Served = {
  rows: [
    { key: '10', label: '1–10', by: { turns: 3, accuracy: 1, points: 30 } },
    { key: '20', label: '11–20', by: { turns: 4, accuracy: 0.25, points: 80 } },
  ],
  totals: { turns: 7, accuracy: 0.571, points: 110 },
}

const tile = (name: string) => screen.getByRole('group', { name })
const leaderboardRows = () => [...document.querySelectorAll<HTMLTableRowElement>('[data-live-stats] tbody [data-stats-row]')]

async function live(play: PlayStateForMain, served: Partial<Record<StatsDimension, Served>> = { team: BY_TEAM, domain: BY_DOMAIN, difficulty: BY_DIFFICULTY }) {
  serveStats(fake, served)
  load(play)
  await at({ tab: 'statistics', view: 'live' })
  await screen.findByRole('group', { name: 'Leading' })
  // Every answer in: the tiles read the team totals, the charts their own.
  await waitFor(() => expect(document.querySelectorAll('[data-stats-chart]')).toHaveLength(3))
  await waitFor(() => expect(leaderboardRows().length).toBeGreaterThan(0))
}

describe('Statistics ▸ Live is a picture first (P20)', () => {
  it('T10-L1 the tiles say what they mean', async () => {
    await live(openPlay(ALPHA_BETA))
    const leading = tile('Leading')
    await waitFor(() => expect(leading.textContent).toContain('90'))
    expect(within(leading).getByText('Beta')).toBeTruthy()

    const questions = tile('Questions')
    await waitFor(() => expect(questions.textContent).toContain('7 / 12'))
    const asked = within(questions).getByRole('meter', { name: 'Questions' })
    expect(asked.getAttribute('aria-valuenow')).toBe('7')
    expect(asked.getAttribute('aria-valuemax')).toBe('12')
    expect(questions.textContent).toContain(STATS.live.questionsLeftDetail(5))

    const accuracy = tile('Accuracy')
    expect(accuracy.textContent).toContain('57%')
    expect(within(accuracy).getByRole('meter', { name: 'Accuracy' }).getAttribute('aria-valuenow')).toBe('57')

    const round = tile('Round')
    expect(round.textContent).toContain('2')
    expect(within(round).getByText(STATS.live.holder('Alpha'))).toBeTruthy()

    expect(tile('Fastest lock').textContent).toContain('8.4s')
  })

  it('T10-L2 an accuracy that is null is an em dash with no meter; a lock that is null is an em dash; a free token says so', async () => {
    await live(openPlay(ALPHA_BETA, { currentTeamId: null }), {
      team: { ...BY_TEAM, totals: { turns: 7, correct: 0, accuracy: null, points: 0, fastest_lock_ms: null } },
      domain: BY_DOMAIN,
      difficulty: BY_DIFFICULTY,
    })
    const accuracy = tile('Accuracy')
    await waitFor(() => expect(accuracy.textContent).toContain(STATS.table.none))
    expect(screen.queryByRole('meter', { name: 'Accuracy' })).toBeNull()
    expect(tile('Fastest lock').textContent).toContain(STATS.table.none)
    const round = tile('Round')
    expect(round.textContent).toContain('2')
    expect(round.textContent).not.toContain('Alpha')
    expect(round.textContent).not.toContain('Beta')
  })

  it('T10-L3 the leaderboard ranks as the scoreboard ranks, not by turns', async () => {
    await live(openPlay(ALPHA_BETA))
    const rows = leaderboardRows()
    expect(rows.map((row) => row.getAttribute('data-stats-row'))).toEqual(['team-beta', 'team-alpha'])
    expect(rows.map((row) => row.cells[0]?.textContent)).toEqual(['1', '2'])
    expect(rows[0]?.textContent).toContain('Beta')
  })

  it('T10-L4 ties rank 1, 1, 3, in ring order', async () => {
    const teams: TeamSpec[] = [
      { id: 'team-alpha', name: 'Alpha', score: 50, rank: 1 },
      { id: 'team-bravo', name: 'Bravo', score: 50, rank: 1 },
      { id: 'team-charlie', name: 'Charlie', score: 20, rank: 3 },
    ]
    await live(openPlay(teams), {
      // The host's order (by turns) is not the scoreboard's.
      team: {
        rows: [
          { key: 'team-charlie', label: 'Charlie', by: { turns: 5, points: 20 } },
          { key: 'team-bravo', label: 'Bravo', by: { turns: 4, points: 50 } },
          { key: 'team-alpha', label: 'Alpha', by: { turns: 4, points: 50 } },
        ],
        totals: { turns: 13, points: 120 },
      },
      domain: BY_DOMAIN,
      difficulty: BY_DIFFICULTY,
    })
    const rows = leaderboardRows()
    expect(rows.map((row) => row.getAttribute('data-stats-row'))).toEqual(['team-alpha', 'team-bravo', 'team-charlie'])
    expect(rows.map((row) => row.cells[0]?.textContent)).toEqual(['1', '1', '3'])
    // Two share first place: the tile says so rather than naming one of them.
    expect(tile('Leading').textContent).toContain(STATS.live.tied(2))
  })

  it('T10-L5 each leaderboard row is in its team’s colour', async () => {
    await live(openPlay([{ ...ALPHA_BETA[0]!, color: '#2563eb' }, ALPHA_BETA[1]!]))
    const alpha = leaderboardRows().find((row) => row.getAttribute('data-stats-row') === 'team-alpha')
    const styled = [...(alpha?.querySelectorAll<HTMLElement>('[style]') ?? [])].map((el) => el.getAttribute('style') ?? '')
    expect(styled.some((style) => style.includes('rgb(37, 99, 235)'))).toBe(true)
    // A Stage token Studio cannot paint (`--ink`) is never written on the row:
    // Beta's swatch is a Studio colour instead (T10-L12, T10-L14).
    const beta = leaderboardRows().find((row) => row.getAttribute('data-stats-row') === 'team-beta')
    expect(beta?.innerHTML).not.toContain('var(--ink)')
  })

  it('T10-L6 Live asks for team (with the ledger once), domain and difficulty', async () => {
    await live(openPlay(ALPHA_BETA))
    const queries = statsQueries()
    expect([...new Set(queries.map((q) => q.groupBy))].sort()).toEqual(['difficulty', 'domain', 'team'])
    for (const query of queries) {
      expect(query.filter?.playIds).toEqual(['play-1'])
      expect(query.filter?.includeRehearsal).toBe(true)
    }
    const detailed = queries.filter((q) => (q.detail ?? 0) > 0)
    expect(new Set(detailed.map((q) => JSON.stringify(q))).size).toBe(1)
    expect(detailed[0]?.groupBy).toBe('team')
    expect(queries.find((q) => q.groupBy === 'team')?.metrics).toContain('fastest_lock_ms')
    const domain = queries.find((q) => q.groupBy === 'domain')?.metrics ?? []
    for (const metric of ['correct', 'partial', 'incorrect'] as const) expect(domain).toContain(metric)
  })

  it('T10-L7 three charts, in this order: score over turns, by domain, by difficulty', async () => {
    await live(openPlay(ALPHA_BETA))
    const kinds = [...document.querySelectorAll('[data-stats-chart]')].map((el) => el.getAttribute('data-stats-kind'))
    expect(kinds).toEqual(['race', 'verdicts', 'bands'])
  })

  it('T10-L8 the award ledger is last, and its working is closed', async () => {
    await live(openPlay(ALPHA_BETA))
    const ledger = await waitFor(() => {
      const found = document.querySelector<HTMLElement>('[data-award-ledger]')
      if (!found) throw new Error('no ledger yet')
      return found
    })
    for (const chart of document.querySelectorAll('[data-stats-chart]')) {
      expect(chart.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    const working = within(ledger).getByRole('switch', { name: PREVIEW.ledger.showWorking }) as HTMLInputElement
    expect(working.checked).toBe(false)
    expect(within(ledger).queryByRole('columnheader', { name: PREVIEW.ledger.base })).toBeNull()
    const rows = [...ledger.querySelectorAll('[data-turn]')]
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) expect(row.getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(working)
    await waitFor(() => expect(within(ledger).getByRole('columnheader', { name: PREVIEW.ledger.base })).toBeTruthy())
  })

  it('T10-L9 a Play with no resolved turn reads without NaN', async () => {
    const teams: TeamSpec[] = [
      { id: 'team-alpha', name: 'Alpha', score: 0, rank: 1 },
      { id: 'team-beta', name: 'Beta', score: 0, rank: 1 },
    ]
    const nothing: Served = { rows: [], totals: { turns: 0, correct: 0, partial: 0, incorrect: 0, points: 0 }, playCount: 1, turnCount: 0, turns: [] }
    await live(openPlay(teams, { remaining: 12 }), { team: nothing, domain: nothing, difficulty: nothing })
    await waitFor(() => expect(screen.getAllByText(STATS.chart.none)).toHaveLength(3))
    const text = document.body.textContent ?? ''
    for (const bad of ['NaN', 'undefined', 'Infinity']) expect(text).not.toContain(bad)
    const rows = leaderboardRows()
    expect(rows.map((row) => row.getAttribute('data-stats-row'))).toEqual(['team-alpha', 'team-beta'])
    for (const row of rows) expect(row.textContent).toContain(STATS.table.none)
    expect(tile('Questions').textContent).toContain('0 / 12')
  })

  it('T10-L10 no Play open: only the pointer to Control — no tiles, no charts, no queries', async () => {
    serveStats(fake, { team: BY_TEAM, domain: BY_DOMAIN, difficulty: BY_DIFFICULTY })
    await at({ tab: 'statistics', view: 'live' })
    expect(await screen.findByRole('button', { name: STATS.live.goToControl })).toBeTruthy()
    expect(screen.queryByRole('group', { name: 'Leading' })).toBeNull()
    expect(document.querySelector('[data-stats-chart]')).toBeNull()
    expect(calls('stats_query')).toHaveLength(0)
  })
})

/** The `SelectField` whose label ends its trigger's name, through the native select React Aria keeps for autofill. */
function selectOf(label: string): HTMLSelectElement {
  const trigger = screen.getByRole('button', { name: new RegExp(`${label}$`) })
  for (let el = trigger.parentElement; el; el = el.parentElement) {
    const select = el.querySelector('select')
    if (select) return select
  }
  throw new Error(`no select under ${label}`)
}

function choose(label: string, value: string) {
  fireEvent.change(selectOf(label), { target: { value } })
}

const chartOf = () => screen.getByRole('img', { name: STATS.chart.label })
/**
 * The caption over the chart: the first thing in the row its panel draws
 * before the canvas — the row the picker now shares, at its other end.
 */
const captionOf = () => {
  const header = chartOf().previousElementSibling
  return (header?.firstElementChild ?? header)?.textContent ?? ''
}

const ALL_DATA: Served = {
  rows: [
    { key: 'team-alpha', label: 'Alpha', by: { turns: 4, correct: 3, incorrect: 1, accuracy: 0.75, points: 90 } },
    { key: 'team-beta', label: 'Beta', by: { turns: 3, correct: 1, incorrect: 2, accuracy: null, points: 20 } },
  ],
  totals: { turns: 7, correct: 4, incorrect: 3, accuracy: 0.571, points: 110 },
  playCount: 1,
  turnCount: 7,
}

async function allData(served: Partial<Record<StatsDimension, Served>> = { team: ALL_DATA }) {
  serveStats(fake, served)
  await at({ tab: 'statistics', view: 'all' })
  await waitFor(() => expect(calls('stats_query').length).toBeGreaterThan(0))
}

describe('Statistics ▸ All data is a picture first (P20)', () => {
  it('T10-A2 the summary strip: Plays, Turns, Accuracy, Points', async () => {
    await allData()
    const plays = await screen.findByRole('group', { name: 'Plays' })
    expect(plays.textContent).toContain('1')
    expect(tile('Turns').textContent).toContain('7')
    expect(tile('Accuracy').textContent).toContain('57%')
    expect(tile('Points').textContent).toContain('110')

    // A column not asked for is not a zero: Points off, its tile is an em dash.
    fireEvent.click(screen.getByRole('button', { name: STATS.filters.moreOptions }))
    fireEvent.click(screen.getByRole('checkbox', { name: STATS.metrics['points'] ?? 'Points' }))
    await waitFor(() => expect(tile('Points').textContent).toContain(STATS.table.none))
  })

  it('T10-A3 the chart comes before the table, and a picker chooses what it draws', async () => {
    await allData()
    const chart = await screen.findByRole('img', { name: STATS.chart.label })
    const table = screen.getByRole('table', { name: STATS.table.label })
    expect(chart.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()

    const offered = [...selectOf(STATS.chart.metric).options].map((o) => o.value).filter(Boolean)
    expect(offered).toEqual(['turns', 'correct', 'accuracy', 'points'])
    expect(captionOf()).toBe('Turns')
    choose(STATS.chart.metric, 'points')
    await waitFor(() => expect(captionOf()).toBe('Points'))
  })

  it('T10-A4 the chart kind follows what is grouped', async () => {
    const one = (key: string, label: string): Served => ({ rows: [{ key, label, by: { turns: 2, correct: 1, incorrect: 1, accuracy: 0.5, points: 10 } }], totals: { turns: 2, points: 10 } })
    await allData({ team: ALL_DATA, domain: one('dom-1', 'Geography'), day: one('2025-09-04', '2025-09-04'), difficulty: one('10', '1–10') })
    const kindOf = () => document.querySelector('[data-stats-chart]')?.getAttribute('data-stats-kind')
    const groupOf = () => document.querySelector('[data-stats-chart]')?.getAttribute('data-stats-chart')
    await waitFor(() => expect(kindOf()).toBe('ranking'))
    for (const [dimension, kind] of [
      ['domain', 'ranking'],
      ['day', 'timeline'],
      ['difficulty', 'bands'],
    ] as const) {
      choose(STATS.filters.groupBy, dimension)
      await waitFor(() => expect(groupOf()).toBe(dimension))
      expect(kindOf()).toBe(kind)
    }

    choose(STATS.filters.groupBy, 'team')
    await waitFor(() => expect(groupOf()).toBe('team'))
    expect(kindOf()).toBe('ranking')
    fireEvent.click(screen.getByRole('button', { name: STATS.filters.moreOptions }))
    fireEvent.click(screen.getByRole('checkbox', { name: STATS.metrics['incorrect'] ?? 'Wrong' }))
    await waitFor(() => expect(kindOf()).toBe('verdicts'))
  })

  it('T10-A8 the verdicts stack asks for Partial too; the table keeps the columns chosen', async () => {
    const verdicts: Served = {
      rows: [
        { key: 'team-alpha', label: 'Alpha', by: { turns: 4, correct: 2, partial: 1, incorrect: 1, accuracy: 0.5, points: 70 } },
        { key: 'team-beta', label: 'Beta', by: { turns: 3, correct: 1, partial: 0, incorrect: 2, accuracy: 0.333, points: 20 } },
      ],
      totals: { turns: 7, correct: 3, partial: 1, incorrect: 3, accuracy: 0.429, points: 90 },
    }
    await allData({ team: verdicts })
    const kindOf = () => document.querySelector('[data-stats-chart]')?.getAttribute('data-stats-kind')
    await waitFor(() => expect(kindOf()).toBe('ranking'))
    // Without Wrong there is no stack, and nothing asks for Partial.
    expect(statsQueries().at(-1)?.metrics).not.toContain('partial')

    fireEvent.click(screen.getByRole('button', { name: STATS.filters.moreOptions }))
    fireEvent.click(screen.getByRole('checkbox', { name: STATS.metrics['incorrect'] ?? 'Wrong' }))
    await waitFor(() => expect(kindOf()).toBe('verdicts'))
    // A stack without Partial falls short of the turns in a game with partial credit.
    expect(statsQueries().at(-1)?.metrics).toEqual(['turns', 'correct', 'incorrect', 'partial', 'accuracy', 'points'])
    const table = screen.getByRole('table', { name: STATS.table.label })
    expect(within(table).getByRole('columnheader', { name: 'Wrong' })).toBeTruthy()
    // Partial is the chart's: the operator did not choose it as a column.
    expect(within(table).queryByRole('columnheader', { name: 'Partial' })).toBeNull()

    // Chosen, it is a column like any other.
    fireEvent.click(screen.getByRole('checkbox', { name: STATS.metrics['partial'] ?? 'Partial' }))
    await waitFor(() =>
      expect(within(screen.getByRole('table', { name: STATS.table.label })).getByRole('columnheader', { name: 'Partial' })).toBeTruthy(),
    )
    expect(statsQueries().at(-1)?.metrics).toEqual(['turns', 'correct', 'incorrect', 'partial', 'accuracy', 'points'])
  })

  it('T10-A5 a table of 120 rows shows 50 and “Show all 120”; the card view too', async () => {
    const many: Served = {
      rows: Array.from({ length: 120 }, (_, i) => ({ key: `team-${i}`, label: `Team ${i}`, by: { turns: 200 - i, correct: 1, accuracy: 0.5, points: 10 } })),
      totals: { turns: 16_860, points: 1200 },
    }
    await allData({ team: many })
    const table = await screen.findByRole('table', { name: STATS.table.label })
    await waitFor(() => expect(table.querySelectorAll('tbody [data-stats-row]')).toHaveLength(50))
    expect(table.querySelector('[data-stats-row="__totals"]')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: STATS.table.showAll(120) }))
    await waitFor(() => expect(table.querySelectorAll('tbody [data-stats-row]')).toHaveLength(120))
    expect(screen.queryByRole('button', { name: STATS.table.showAll(120) })).toBeNull()

    act(() => useChromeStore.getState().setView('statistics', 'grid'))
    await waitFor(() => expect(screen.queryByRole('table', { name: STATS.table.label })).toBeNull())
    expect(document.querySelectorAll('[data-all-data-stats] [data-stats-row]')).toHaveLength(50)
    expect(screen.getByRole('button', { name: STATS.table.showAll(120) })).toBeTruthy()
  })

  it('T10-A6 no resolved turn: the empty state, no chart, no summary', async () => {
    await allData({ team: { rows: [], totals: {}, playCount: 0, turnCount: 0 } })
    expect(await screen.findByText(STATS.empty.body)).toBeTruthy()
    expect(screen.queryByRole('img', { name: STATS.chart.label })).toBeNull()
    expect(screen.queryByRole('group', { name: 'Plays' })).toBeNull()
  })
})

// ------------------------------------------------- Statistics, pictures that agree (P20 review)

type Datum = number | null | { value: number | null }
interface DrawnOption {
  series: { name?: string; data: Datum[]; lineStyle?: { color?: string } }[]
}

/** The last picture the chart of this kind was handed. */
function lastDrawn(kind: string): DrawnOption | undefined {
  const el = document.querySelector(`[data-stats-kind="${kind}"]`)
  return el ? (drawn.get(el)?.at(-1) as DrawnOption | undefined) : undefined
}
const valueOf = (d: Datum | undefined) => (d !== null && typeof d === 'object' ? d.value : d)
/** Where each line of the race ends, by team name. */
const raceEnds = () => Object.fromEntries((lastDrawn('race')?.series ?? []).map((s) => [s.name, valueOf(s.data.at(-1))]))
/** Each line's colour, by team name. */
const raceColours = () => Object.fromEntries((lastDrawn('race')?.series ?? []).map((s) => [s.name, s.lineStyle?.color]))
/** The swatch on a team's leaderboard row, as written. */
const swatchOf = (id: string) =>
  leaderboardRows()
    .find((row) => row.getAttribute('data-stats-row') === id)
    ?.querySelector<HTMLElement>('th[scope="row"] span[aria-hidden]')?.style.background ?? ''

/**
 * A colour as it is painted, in one spelling: a whole `var(--name)` read off
 * the root, then written through a style so `#2563eb` and `rgb(37, 99, 235)`
 * compare equal — a swatch and a race line are the same colour however each
 * was written.
 */
function painted(colour: string | undefined): string {
  const written = colour?.trim() ?? ''
  const token = /^var\((--[\w-]+)\)$/.exec(written)?.[1]
  const value = token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : written
  const probe = document.createElement('span')
  probe.style.color = value
  return probe.style.color || value
}

/** Only the charts get a width: it is what lets one draw, and nothing else on the page should change. */
function widenCharts() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.hasAttribute('data-stats-chart') ? 640 : 0
    },
  })
}

/**
 * The colours Studio's stylesheet defines (`design-studio/globals.css`, the
 * HeroUI theme), each set to a distinct rgb, so a token the page hands the
 * chart resolves as it does in the app. jsdom loads no stylesheet, and a
 * `.css?raw` import is empty under vitest, so the names are written out.
 */
const STUDIO_COLOURS = [
  'accent', 'accent-foreground', 'background', 'border', 'danger', 'danger-foreground', 'default', 'default-foreground',
  'field-background', 'field-foreground', 'field-placeholder', 'focus', 'foreground', 'muted', 'overlay', 'overlay-foreground',
  'scrollbar', 'segment', 'segment-foreground', 'separator', 'success', 'success-foreground', 'surface', 'surface-foreground',
  'surface-secondary', 'surface-secondary-foreground', 'surface-tertiary', 'surface-tertiary-foreground', 'warning', 'warning-foreground',
] as const

function paintStudioTokens(): () => void {
  const names = STUDIO_COLOURS.map((name) => `--${name}`)
  const root = document.documentElement
  names.forEach((name, i) => root.style.setProperty(name, `rgb(${i + 1}, ${100 + i}, ${200 - i})`))
  return () => names.forEach((name) => root.style.removeProperty(name))
}

describe('Statistics, pictures that agree (P20 review)', () => {
  let unpaint: (() => void) | null = null
  beforeEach(() => {
    drawn.clear()
    widenCharts()
  })
  afterEach(() => {
    delete (HTMLElement.prototype as { clientWidth?: number }).clientWidth
    unpaint?.()
    unpaint = null
    drawn.clear()
  })

  it('T10-L11 after a reveal, the race, the leaderboard and the tiles keep the last pair until the answer for the new count arrives', async () => {
    const by: Partial<Record<StatsDimension, Served>> = { team: BY_TEAM, domain: BY_DOMAIN, difficulty: BY_DIFFICULTY }
    await live(openPlay(ALPHA_BETA), by)
    await waitFor(() => expect(raceEnds()).toEqual({ Alpha: 20, Beta: 90 }))
    const before = leaderboardRows().map((row) => row.textContent)
    expect(tile('Questions').textContent).toContain('7 / 12')

    // The next by-team answer is held back, as one IPC behind play-state is.
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let held = 0
    const inner = fake.invoke.bind(fake)
    fake.invoke = (async (name: Parameters<FakeHost['invoke']>[0], args?: Record<string, unknown>) => {
      if (name === 'stats_query' && (args?.['query'] as StatsQuery | undefined)?.groupBy === 'team') {
        held += 1
        await gate
      }
      return inner(name, args)
    }) as FakeHost['invoke']

    // Alpha answers right for 80 and takes the lead; play-state says so at once.
    by.team = {
      rows: [
        { key: 'team-alpha', label: 'Alpha', by: { turns: 5, correct: 2, accuracy: 0.4, points: 100, fastest_lock_ms: 9100 } },
        { key: 'team-beta', label: 'Beta', by: { turns: 3, correct: 3, accuracy: 1, points: 90, fastest_lock_ms: 8400 } },
      ],
      totals: { turns: 8, correct: 5, accuracy: 0.625, points: 190, fastest_lock_ms: 8400 },
      turns: [{ ...FAKE_LEDGER[0]!, teamId: 'team-alpha', teamName: 'Alpha', points: 80, bonus: 0, atMs: 5_000 }],
    }
    const after = openPlay(
      [
        { ...ALPHA_BETA[0]!, score: 100, rank: 1, turnsTaken: 5 },
        { ...ALPHA_BETA[1]!, rank: 2 },
      ],
      { remaining: 4 },
    )
    act(() => load({ ...after, operator: { ...after.operator, eventCount: 13 } }))
    await waitFor(() => expect(held).toBeGreaterThan(0))
    await act(async () => {})

    // Still the pair at 12 events: the ranking, its figures, where each line ends, and the tiles.
    expect(leaderboardRows().map((row) => row.textContent)).toEqual(before)
    expect(raceEnds()).toEqual({ Alpha: 20, Beta: 90 })
    expect(within(tile('Leading')).getByText('Beta')).toBeTruthy()
    expect(tile('Questions').textContent).toContain('7 / 12')

    await act(async () => release())
    await waitFor(() => expect(leaderboardRows().map((row) => row.getAttribute('data-stats-row'))).toEqual(['team-alpha', 'team-beta']))
    // …and the pair at 13 arrives whole: one render, every figure from it.
    expect(leaderboardRows()[0]?.textContent).toContain('100')
    expect(raceEnds()).toEqual({ Alpha: 100, Beta: 90 })
    expect(within(tile('Leading')).getByText('Alpha')).toBeTruthy()
    expect(tile('Questions').textContent).toContain('8 / 12')
  })

  it('T10-L12 a team in a Stage theme colour still has a swatch and a race line, each its own', async () => {
    unpaint = paintStudioTokens()
    await live(
      openPlay([
        { ...ALPHA_BETA[0]!, color: 'var(--state-incorrect)' },
        { ...ALPHA_BETA[1]!, color: 'var(--state-info)' },
      ]),
    )
    const alpha = swatchOf('team-alpha')
    const beta = swatchOf('team-beta')
    expect(alpha).not.toBe('')
    expect(beta).not.toBe('')
    // A Studio colour, never the Stage token Studio cannot paint.
    expect(alpha).not.toContain('--state-')
    expect(beta).not.toContain('--state-')
    expect(alpha).not.toBe(beta)

    await waitFor(() => expect(Object.keys(raceColours())).toEqual(['Alpha', 'Beta']))
    const lines = raceColours()
    expect(lines['Alpha']).toBeTruthy()
    expect(lines['Beta']).toBeTruthy()
    expect(lines['Alpha']).not.toBe(lines['Beta'])
    expect(JSON.stringify(lines)).not.toContain('var(')
    // The line is the swatch's colour, as Studio paints it.
    const resolve = (background: string) => {
      const token = /^var\((--[\w-]+)\)$/.exec(background)?.[1]
      return token ? getComputedStyle(document.documentElement).getPropertyValue(token).trim() : background
    }
    expect(lines['Alpha']).toBe(resolve(alpha))
    expect(lines['Beta']).toBe(resolve(beta))
  })

  it('T10-L13 a Stage state colour is drawn in the Studio colour of the same meaning: the Demo’s Red is danger, its Blue is accent', async () => {
    unpaint = paintStudioTokens()
    // The shipped Demo's roster (`crates/host/src/catalog/seed.rs`).
    const redBlue: Served = {
      rows: [
        { key: 'team-red', label: 'Red', by: { turns: 4, correct: 1, accuracy: 0.25, points: 20, fastest_lock_ms: 9100 } },
        { key: 'team-blue', label: 'Blue', by: { turns: 3, correct: 3, accuracy: 1, points: 90, fastest_lock_ms: 8400 } },
      ],
      totals: { turns: 7, correct: 4, accuracy: 0.571, points: 110, fastest_lock_ms: 8400 },
    }
    await live(
      openPlay([
        { id: 'team-red', name: 'Red', score: 20, rank: 2, turnsTaken: 4, color: 'var(--state-incorrect)' },
        { id: 'team-blue', name: 'Blue', score: 90, rank: 1, turnsTaken: 3, color: 'var(--state-info)' },
      ]),
      { team: redBlue, domain: BY_DOMAIN, difficulty: BY_DIFFICULTY },
    )
    const danger = painted('var(--danger)')
    const accent = painted('var(--accent)')
    expect(danger).not.toBe(accent)

    expect(painted(swatchOf('team-red'))).toBe(danger)
    expect(painted(swatchOf('team-blue'))).toBe(accent)
    await waitFor(() => expect(Object.keys(raceColours())).toEqual(['Red', 'Blue']))
    expect(painted(raceColours()['Red'])).toBe(danger)
    expect(painted(raceColours()['Blue'])).toBe(accent)
  })

  it('T10-L14 a team Studio cannot paint never takes a colour another team already shows', async () => {
    unpaint = paintStudioTokens()
    // Studio's accent is a blue, as HeroUI's is: here, Alpha's very blue.
    document.documentElement.style.setProperty('--accent', 'rgb(37, 99, 235)')
    await live(openPlay([{ ...ALPHA_BETA[0]!, color: '#2563eb' }, { ...ALPHA_BETA[1]!, color: 'var(--ink)' }]))

    const alpha = painted(swatchOf('team-alpha'))
    const beta = painted(swatchOf('team-beta'))
    expect(alpha).toBe('rgb(37, 99, 235)')
    expect(beta).not.toBe('')
    expect(beta).not.toBe(alpha)
    await waitFor(() => expect(Object.keys(raceColours())).toEqual(['Alpha', 'Beta']))
    const lines = raceColours()
    expect(painted(lines['Beta'])).not.toBe(painted(lines['Alpha']))
    expect(painted(lines['Beta'])).toBe(beta)
  })

  it('T10-L16 two Stage state colours that share a Studio meaning are still two colours', async () => {
    unpaint = paintStudioTokens()
    // Stage's leader gold and accent yellow both mean warning in Studio.
    await live(openPlay([{ ...ALPHA_BETA[0]!, color: 'var(--state-leader)' }, { ...ALPHA_BETA[1]!, color: 'var(--state-accent)' }]))

    const alpha = painted(swatchOf('team-alpha'))
    const beta = painted(swatchOf('team-beta'))
    expect(alpha).not.toBe('')
    expect(beta).not.toBe('')
    expect(beta).not.toBe(alpha)
  })

  it('T10-L15 a failed answer is never resurrected: the count after it does not bring back the pair from before', async () => {
    await live(openPlay(ALPHA_BETA))
    await waitFor(() => expect(raceEnds()).toEqual({ Alpha: 20, Beta: 90 }))
    const before = leaderboardRows().map((row) => row.textContent)
    expect(within(tile('Leading')).getByText('Beta')).toBeTruthy()

    // The by-team answers from here on: the next one fails, the one after is held back.
    let mode: 'fail' | 'hold' = 'fail'
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => {
      release = resolve
    })
    let failed = 0
    let held = 0
    const inner = fake.invoke.bind(fake)
    fake.invoke = (async (name: Parameters<FakeHost['invoke']>[0], args?: Record<string, unknown>) => {
      if (name === 'stats_query' && (args?.['query'] as StatsQuery | undefined)?.groupBy === 'team') {
        if (mode === 'fail') {
          failed += 1
          throw new Error('stats_query failed')
        }
        held += 1
        await gate
      }
      return inner(name, args)
    }) as FakeHost['invoke']

    // Alpha takes the lead; play-state says so at once.
    const alphaLeads = (eventCount: number): PlayStateForMain => {
      const play = openPlay(
        [
          { ...ALPHA_BETA[0]!, score: 100, rank: 1, turnsTaken: 5 },
          { ...ALPHA_BETA[1]!, rank: 2 },
        ],
        { remaining: 4 },
      )
      return { ...play, operator: { ...play.operator, eventCount } }
    }

    // Count 13: its answer fails, the retry too. Live draws the Play alone.
    act(() => load(alphaLeads(13)))
    await waitFor(() => expect(leaderboardRows()).toHaveLength(0), { timeout: 5_000 })
    expect(failed).toBeGreaterThan(0)
    expect(within(tile('Leading')).getByText('Alpha')).toBeTruthy()

    // Count 14: its answer is on its way, and TanStack offers count 12's as placeholder.
    mode = 'hold'
    act(() => load(alphaLeads(14)))
    await waitFor(() => expect(held).toBeGreaterThan(0))
    await act(async () => {})

    // Not the pair from before the failure: not its ranking, not its race, not its leader.
    expect(leaderboardRows().map((row) => row.textContent)).not.toEqual(before)
    expect(raceEnds()).not.toEqual({ Alpha: 20, Beta: 90 })
    expect(within(tile('Leading')).getByText('Alpha')).toBeTruthy()

    // …and the answer for 14, when it comes, is drawn with the Play at 14.
    await act(async () => release())
    await waitFor(() => expect(leaderboardRows().map((row) => row.getAttribute('data-stats-row'))).toEqual(['team-alpha', 'team-beta']))
    expect(within(tile('Leading')).getByText('Alpha')).toBeTruthy()
  })

  it('T10-A9 All data’s picker sits in the chart’s own panel, not on a row above it', async () => {
    await allData()
    const chart = await screen.findByRole('img', { name: STATS.chart.label })
    const panel = chart.closest<HTMLElement>('[data-slot="surface"]')
    expect(panel).not.toBeNull()
    expect(panel?.contains(selectOf(STATS.chart.metric))).toBe(true)
    expect(within(panel!).getByRole('button', { name: new RegExp(`${STATS.chart.metric}$`) })).toBeTruthy()
  })
})

describe('the Statistics window and tab (P20)', () => {
  afterEach(() => window.history.replaceState({}, '', '/'))

  it('T10-W1 the Statistics window asks no workspace_list', async () => {
    load(openPlay(ALPHA_BETA))
    window.history.pushState({}, '', '/?stats')
    render(<App />)
    await waitFor(() => expect(calls('stats_query').length).toBeGreaterThan(0))
    expect(calls('workspace_list')).toHaveLength(0)
    expect(document.querySelector('[data-stats-window]')).not.toBeNull()
  })

  it('T10-W2 the window is full width; the tab keeps a bounded column', async () => {
    load(openPlay(ALPHA_BETA))
    window.history.pushState({}, '', '/?stats')
    const { unmount } = render(<App />)
    const layout = await waitFor(() => {
      const found = document.querySelector('[data-stats-window] [data-layout="settings"]')
      if (!found) throw new Error('no layout yet')
      return found
    })
    expect(layout.querySelector('.max-w-6xl')).toBeNull()
    unmount()

    window.history.replaceState({}, '', '/')
    await at({ tab: 'statistics', view: 'live' })
    await waitFor(() => expect(document.querySelector('[data-layout="settings"] .max-w-6xl')).not.toBeNull())
  })

  it('T10-W3 the tab still names the workspace it counts, from the cache, and follows a rename', async () => {
    render(<App />)
    await waitFor(() => expect(calls('workspace_list').length).toBeGreaterThan(0))
    await act(async () => {})
    const before = calls('workspace_list').length
    await act(async () => {
      await useNavStore.getState().go({ tab: 'statistics', view: 'live' })
    })
    const first = fake.workspaces.find((w) => w.id === fake.currentWorkspace)
    expect(await screen.findByText(new RegExp(`Plays in ${first?.name ?? WORKSPACE.unnamed}`))).toBeTruthy()
    expect(calls('workspace_list')).toHaveLength(before)

    await act(async () => {
      await fake.invoke('workspace_rename', { id: fake.currentWorkspace, name: 'Friday club' })
    })
    expect(await screen.findByText(/Plays in Friday club/)).toBeTruthy()
    expect(calls('workspace_list')).toHaveLength(before)
  })
})

describe('the Questions list says difficulty in one pill (P20)', () => {

  it('in the table: the band and the number after the stem, and no number column before it', async () => {
    await at({ tab: 'library' })
    const stem = await screen.findByText('Which empire built the road network that reached Britain?')
    const row = stem.closest('[role="button"], [role="row"]') as HTMLElement
    expect(within(row).getByText('Easy · 20')).toBeTruthy()
    expect(within(row).queryByText('Easy')).toBeNull()
    expect(document.querySelector('[data-list-header] [data-lead]')).toBeNull()
    // The chips hide on a narrow list (a row open beside it); the difficulty must not (class is the rule).
    const chipBox = Array.from(row.querySelectorAll<HTMLElement>('div')).find((el) => el.className.includes('@lg/list:flex'))
    expect(chipBox).toBeDefined()
    expect(chipBox?.contains(within(row).getByText('Easy · 20')) ?? false).toBe(false)
  })

  it('on a card: the pill is the first chip', async () => {
    useChromeStore.getState().setView('library', 'grid')
    await at({ tab: 'library' })
    const stem = await screen.findByText('Which empire built the road network that reached Britain?')
    const card = stem.closest('[role="button"]') as HTMLElement
    const chip = within(card).getByText('Easy · 20')
    expect(chip).toBeTruthy()
    const chips = chip.closest('.flex-wrap') as HTMLElement
    expect(chips.textContent?.startsWith('Easy · 20')).toBe(true)
  })
})
