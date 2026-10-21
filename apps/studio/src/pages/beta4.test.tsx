import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'
import { LIST, PICKER } from '@/copy'
import { PREVIEW } from '@/copy/preview'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { CatalogItem, PlayRecord, Question, Team } from '@/host/types'
import { acceptsDifficulty } from '@/molecules'
import { playNumbers } from '@/organisms/PlaysSection'

/** beta.4 in Studio: the Game page's pickers, its menu, the Games bulk bar, Plays by name. */
let fake: FakeHost

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [] })
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
const team = (id: string, name: string, extra: Partial<Team> = {}): CatalogItem => ({
  kind: 'team',
  item: { id, origin: 'operator', name, shortCode: name.slice(0, 4).toUpperCase(), color: '#111111', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 1, updatedAt: 1, archivedAt: null, ...extra },
})
const memberships = () => fake.calls.filter((c) => c.name === 'recipe_set_membership')
const enabled = async (name: string) => {
  const button = await screen.findByRole('button', { name }, { timeout: 5000 })
  await waitFor(() => expect((button as HTMLButtonElement).disabled || button.getAttribute('aria-disabled') === 'true').toBe(false))
  return button
}

describe('Add teams… (beta.4)', () => {
  it('a search that hides the chosen teams keeps them, and appends what it adds', async () => {
    fake.seed([team('team-echo', 'Echo')])
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' } as Route)
    fireEvent.click(await enabled(PICKER.addTeams))
    const dialog = await screen.findByRole('dialog')
    fireEvent.change(within(dialog).getByRole('searchbox'), { target: { value: 'Echo' } })
    await waitFor(() => expect(within(dialog).queryByRole('checkbox', { name: 'Alpha' })).toBeNull(), { timeout: 2000 })
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Echo' }))
    fireEvent.click(within(dialog).getByRole('button', { name: PICKER.apply }))
    await waitFor(() => expect(memberships()).toHaveLength(1))
    expect((memberships()[0]?.args as { teams: string[] }).teams).toEqual(['team-alpha', 'team-bravo', 'team-charlie', 'team-delta', 'team-echo'])
  })

  it('Cancel writes nothing, and the next opening starts from the game', async () => {
    fake.seed([team('team-echo', 'Echo')])
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' } as Route)
    fireEvent.click(await enabled(PICKER.addTeams))
    let dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Echo' }))
    fireEvent.click(within(dialog).getByRole('button', { name: PICKER.cancel }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(memberships()).toHaveLength(0)
    fireEvent.click(await enabled(PICKER.addTeams))
    dialog = await screen.findByRole('dialog')
    const echo = await within(dialog).findByRole('checkbox', { name: 'Echo' })
    expect((echo as HTMLInputElement).checked).toBe(false)
  })

  it('an archived team on the roster is named, marked, and said in the Rules preview', async () => {
    const delta = fake.library.get('team:team-delta')
    if (delta?.kind !== 'team') throw new Error('delta')
    fake.library.set('team:team-delta', { kind: 'team', item: { ...delta.item, archivedAt: 5 } })
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' } as Route)
    expect(await screen.findByText('Delta', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getAllByText(LIST.archived).length).toBeGreaterThan(0)
    expect(PREVIEW.warning({ code: 'archivedOnGame', teams: ['Delta'], domains: [], questions: [] })).toContain('the team Delta')
    expect(((await fake.invoke('rules_preview', { recipeId: 'recipe-demo' })) as { warnings: { code: string }[] }).warnings[0]?.code).toBe('archivedOnGame')
    await expect(fake.invoke('play_load', { recipeId: 'recipe-demo', playId: 'p' })).rejects.toBeTruthy()
  })
})

describe('Choose questions… (beta.4)', () => {
  const q = (id: string, difficulty: number, groupId: string | null = null) => ({ id, difficulty, groupId })
  /** A domain "Bible" of `rows`, in a group "Old" when given. */
  const seedDomain = (rows: { id: string; difficulty: number; groupId: string | null }[]) => {
    const items: CatalogItem[] = rows.map(({ id, difficulty }) => ({
      kind: 'question',
      item: { id, origin: 'operator', stem: `Q ${id}?`, mediaAssetId: null, options: [{ id: `${id}-a`, text: 'A', correct: true }, { id: `${id}-b`, text: 'B', correct: false }], difficulty, explanation: null, createdAt: 1, updatedAt: 1, archivedAt: null } satisfies Question,
    }))
    items.push({
      kind: 'domain',
      item: { id: 'dom-bible', origin: 'operator', name: 'Bible', code: 'BIB', description: null, questions: rows.map((r, i) => ({ questionId: r.id, sortKey: i, groupId: r.groupId })), createdAt: 1, updatedAt: 1, archivedAt: null },
    })
    fake.seed(items)
    fake.domainGroups.set('dom-bible', [{ id: 'grp-old', domainId: 'dom-bible', name: 'Old', sortKey: 0 }])
    const recipe = fake.recipes.get('recipe-demo')
    if (!recipe) throw new Error('recipe')
    fake.recipes.set('recipe-demo', { ...recipe, board: [...recipe.board, { domainId: 'dom-bible', questionIds: [] }] })
  }
  const openBible = async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    const buttons = await screen.findAllByRole('button', { name: PICKER.chooseQuestions }, { timeout: 5000 })
    const last = buttons[buttons.length - 1] as HTMLElement
    await waitFor(() => expect(last.getAttribute('aria-disabled') === 'true' || (last as HTMLButtonElement).disabled).toBe(false))
    fireEvent.click(last)
    return screen.findByRole('dialog')
  }
  const boardOf = () => (memberships().at(-1)?.args as { board: { domainId: string; questionIds: string[] }[] }).board.find((b) => b.domainId === 'dom-bible')?.questionIds

  it('select all in a group takes one question per difficulty, the first of each', async () => {
    seedDomain([q('b1', 10, 'grp-old'), q('b2', 10, 'grp-old'), q('b3', 20, 'grp-old')])
    const dialog = await openBible()
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: PICKER.selectGroup('Old') }))
    expect(within(dialog).getByText(PICKER.chosen(2))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: PICKER.apply }))
    await waitFor(() => expect(boardOf()).toEqual(['b1', 'b3']))
  })

  it('a group past one page is selected whole', async () => {
    const rows = Array.from({ length: 120 }, (_, i) => q(`p${i}`, (i % 100) + 1, 'grp-old'))
    seedDomain(rows)
    const recipe = fake.recipes.get('recipe-demo')
    if (recipe) fake.recipes.set('recipe-demo', { ...recipe, settings: { ...recipe.settings, board: { allow_repeated_difficulty: true } } })
    const dialog = await openBible()
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: PICKER.selectGroup('Old') }, { timeout: 5000 }))
    expect(within(dialog).getByText(PICKER.chosen(120))).toBeTruthy()
  })
})

describe('the difficulty dialog (beta.4)', () => {
  it('takes a whole number 1–100 that is not the one set', () => {
    for (const bad of [null, 0, 101, 2.5, -3, 20]) expect(acceptsDifficulty(bad, 20)).toBe(false)
    for (const good of [1, 100, 21]) expect(acceptsDifficulty(good, 20)).toBe(true)
    expect(acceptsDifficulty(20, null)).toBe(true)
  })
})

describe('Plays by name (beta.4)', () => {
  const play = (id: string, startedAtMs: number): PlayRecord =>
    ({ id, recipeId: 'r', operatorId: null, status: 'ended', startedAtMs, endedAtMs: null, eventCount: 0, questionsConsumed: 0, scores: {} }) as unknown as PlayRecord
  it('numbers them by start time, then id, and closes up when one is gone', () => {
    const n = playNumbers([play('play-c', 30), play('play-a', 10), play('play-b', 10)])
    expect([n.get('play-a'), n.get('play-b'), n.get('play-c')]).toEqual([1, 2, 3])
    expect(playNumbers([play('play-a', 10), play('play-c', 30)]).get('play-c')).toBe(2)
  })
})

describe('the Games bulk bar (beta.4)', () => {
  it('leaves the playing game out of Archive, and says so', async () => {
    const second = demoRecipe()
    fake.seed([], [{ ...second, id: 'recipe-two', name: 'Second show' }])
    await at({ tab: 'games' } as Route)
    act(() =>
      receivePlayState({
        ...EMPTY_PLAY_STATE,
        playId: 'p1',
        status: 'playing',
        operator: { recipeId: 'recipe-demo', legalTokenTargets: [], defaultNextTeamId: null, consecutiveCorrect: 0, isRehearsal: false, canUndo: false, canRedo: false, eventCount: 1, showGiveToken: false, overrideAfterLock: 'refuse_until_reveal', disabled: [] },
      } as never),
    )
    for (const name of ['Season opener', 'Second show']) fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${name}` }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('button', { name: /^Archive/ }))
    const confirm = await screen.findByRole('alertdialog')
    expect(within(confirm).getByText(/Archive this game/)).toBeTruthy()
    expect(screen.getByText(/Season opener is playing/)).toBeTruthy()
  })
})

describe('Apply to original follows the copies (beta.4)', () => {
  it('asks the editors’ question, and Also update sends alsoCopies', async () => {
    const h1 = fake.library.get('question:q-h1')
    if (h1?.kind !== 'question') throw new Error('q-h1')
    fake.library.set('question:q-h1', { kind: 'question', item: { ...h1.item, familyId: 9 } })
    fake.seed([{ kind: 'question', item: { ...h1.item, id: 'q-copy', familyId: 9 } }])
    fake.families.set('question:q-h1', 9)
    fake.families.set('question:q-copy', 9)
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    fireEvent.click(await screen.findByRole('button', { name: /^Difficulty of Which empire built the road/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog')
    const field = within(dialog).getByRole('textbox')
    fireEvent.change(field, { target: { value: '30' } })
    fireEvent.blur(field)
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Apply to original' }))
    fireEvent.click(await screen.findByRole('button', { name: /^Also update/ }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'recipe_set_overlay')).toBe(true))
    const call = fake.calls.find((c) => c.name === 'recipe_set_overlay')
    expect(call?.args).toMatchObject({ scope: 'original', alsoCopies: true })
    const copy = fake.library.get('question:q-copy')
    expect(copy?.kind === 'question' ? copy.item.difficulty : null).toBe(30)
  })
})

describe('the beta.4 review', () => {
  it('a roster refusal goes when the archived team comes off the roster', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' } as Route)
    act(() => {
      useNoticeStore.getState().pushError('play_refused', 'recipe.recipe-demo.roster.team.team-delta: the roster has the archived team Delta; restore it or take it off the roster', 'recipe.recipe-demo.roster.team.team-delta')
    })
    expect(await screen.findByText(/the roster has the archived team Delta/)).toBeTruthy()
    // The text is the reason, not the routing path.
    expect(document.body.textContent).not.toContain('roster.team.team-delta')
    const removes = await screen.findAllByRole('button', { name: 'Remove from roster' })
    fireEvent.click(removes[3] as HTMLElement)
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(0))
  })

  it('Apply to original of the value this game asks promotes it', async () => {
    await at({ tab: 'games', id: 'recipe-demo', section: 'board' } as Route)
    fireEvent.click(await screen.findByRole('button', { name: /^Difficulty of Which two of these were signatories/ }, { timeout: 5000 }))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Apply to original' }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'recipe_set_overlay')).toBe(true))
    expect(fake.calls.find((c) => c.name === 'recipe_set_overlay')?.args).toMatchObject({ scope: 'original', target: { patch: { difficulty: 70 } } })
  })

  it('a refused Apply keeps the picker open with its ticks', async () => {
    fake.seed([team('team-echo', 'Echo')])
    // The fake as it is, except that it refuses the roster write.
    const real = fake.invoke.bind(fake)
    ;(fake as { invoke: unknown }).invoke = (name: string, args?: Record<string, unknown>) =>
      name === 'recipe_set_membership' ? Promise.reject({ code: 'catalog', message: 'recipe.recipe-demo: refused' }) : real(name as never, args)
    await at({ tab: 'games', id: 'recipe-demo', section: 'roster' } as Route)
    fireEvent.click(await enabled(PICKER.addTeams))
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(await within(dialog).findByRole('checkbox', { name: 'Echo' }))
    fireEvent.click(within(dialog).getByRole('button', { name: PICKER.apply }))
    await waitFor(() => expect(useNoticeStore.getState().notices.length).toBeGreaterThan(0))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect((within(dialog).getByRole('checkbox', { name: 'Echo' }) as HTMLInputElement).checked).toBe(true)
  })

  it('Move from the Game page is off while the game plays', async () => {
    await at({ tab: 'games', id: 'recipe-demo' } as Route)
    act(() =>
      receivePlayState({
        ...EMPTY_PLAY_STATE,
        playId: 'p1',
        status: 'playing',
        operator: { recipeId: 'recipe-demo', legalTokenTargets: [], defaultNextTeamId: null, consecutiveCorrect: 0, isRehearsal: false, canUndo: false, canRedo: false, eventCount: 1, showGiveToken: false, overrideAfterLock: 'refuse_until_reveal', disabled: [] },
      } as never),
    )
    fireEvent.click(await screen.findByRole('button', { name: 'More actions' }, { timeout: 5000 }))
    const move = await screen.findByRole('menuitem', { name: /Move to/ })
    expect(move.getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: /Copy to/ }).getAttribute('aria-disabled')).not.toBe('true')
  })
})
