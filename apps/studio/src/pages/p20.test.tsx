import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoPlay, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

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
