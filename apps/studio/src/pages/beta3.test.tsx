import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { CONFIRM, TEAM } from '@/copy'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { CatalogItem, Team } from '@/host/types'

/** beta.3 in Studio: twin names said, theme colours shown as swatches, archive confirms naming games. */
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
afterEach(() => setHostTransport(null))

async function at(route: Route) {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go(route)
  })
}

describe('twin names (beta.3)', () => {
  it('a new team named like one already here says so, and saves anyway', async () => {
    await at({ tab: 'teams', mode: 'new' } as Route)
    const name = await screen.findByRole('textbox', { name: new RegExp(`^${TEAM.name}`) })
    fireEvent.change(name, { target: { value: ' alpha ' } })
    expect(await screen.findByText(CONFIRM.twinTeam(' alpha '))).toBeTruthy()
    fireEvent.change(name, { target: { value: 'Echo' } })
    await waitFor(() => expect(screen.queryByText(/Another team in this workspace/)).toBeNull())
  })
})

describe('a theme colour (beta.3, seen in the real app)', () => {
  it('is a checked swatch, and the text field shows no raw token', async () => {
    const red: CatalogItem = {
      kind: 'team',
      item: { id: 'seed-team-red', origin: 'seed', name: 'Red', shortCode: 'RED', color: 'var(--state-incorrect)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } satisfies Team,
    }
    fake.seed([red])
    await at({ tab: 'teams', id: 'seed-team-red', mode: 'edit' } as Route)
    const swatch = await screen.findByRole('radio', { name: TEAM.themeColour })
    expect(swatch.getAttribute('aria-checked')).toBe('true')
    const field = screen.getByRole('textbox', { name: TEAM.color }) as HTMLInputElement
    expect(field.value).toBe('')
    expect(document.body.textContent).not.toContain('var(--state-incorrect)')
  })
})

describe('the archive confirm names what uses the rows (beta.3)', () => {
  it('for many teams at once, and the a-a wording is gone', async () => {
    await at({ tab: 'teams' } as Route)
    for (const name of ['Alpha', 'Bravo']) fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${name}` }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('button', { name: /^Archive/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(/the game Season opener/)).toBeTruthy()
    expect(dialog.textContent).not.toMatch(/\ba a\b/)
  })
})

describe('the question editor writes once (beta.3)', () => {
  it('a refused membership leaves the question unsaved, and says nothing is saved', async () => {
    const { toast } = await import('@/chrome/toast')
    const { vi } = await import('vitest')
    const spy = vi.spyOn(toast, 'success')
    const d = fake.library.get('domain:dom-tech')
    if (d?.kind === 'domain') fake.library.set('domain:dom-tech', { kind: 'domain', item: { ...d.item, questions: d.item.questions.map((m) => ({ ...m, groupId: 'grp-elsewhere' })) } })
    await at({ tab: 'library', questionId: 'q-h1', mode: 'edit', domainId: 'dom-history' } as Route)
    const stem = await screen.findByDisplayValue('Which empire built the road network that reached Britain?')
    fireEvent.change(stem, { target: { value: 'Which empire built the roads?' } })
    // Also into Technology, which the host refuses (a member in another domain's group):
    // the whole save is refused, the question with it.
    fireEvent.click(await screen.findByRole('checkbox', { name: /Technology/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_upsert_many')).toBe(true))
    const q = fake.library.get('question:q-h1')
    expect(q?.kind === 'question' ? q.item.stem : '').toBe('Which empire built the road network that reached Britain?')
    expect(spy).not.toHaveBeenCalledWith('Question saved')
    spy.mockRestore()
  })

  it('a change of domain alone does not ask about the copies', async () => {
    fake.families.set('question:q-h1', 9)
    fake.families.set('question:q-copy', 9)
    const h1 = fake.library.get('question:q-h1')
    if (h1?.kind === 'question') fake.library.set('question:q-h1', { kind: 'question', item: { ...h1.item, familyId: 9 } })
    await at({ tab: 'library', questionId: 'q-h1', mode: 'edit', domainId: 'dom-history' } as Route)
    await screen.findByDisplayValue('Which empire built the road network that reached Britain?')
    fireEvent.click(await screen.findByRole('checkbox', { name: /Technology/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_upsert_many')).toBe(true))
    expect(fake.calls.some((c) => c.name === 'catalog_propagation_preview')).toBe(false)
    expect(screen.queryByText('This row has copies')).toBeNull()
  })
})
