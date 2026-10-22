import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * P20: an editor's Cancel · Save sit in its header beside the title, which
 * stays at the top while the form scrolls — no bar pinned across the foot of
 * the page.
 */
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

describe.each([
  ['a new team', { tab: 'teams', mode: 'new' } as Route, 'New team'],
  ['a team', { tab: 'teams', id: 'team-alpha', mode: 'edit' } as Route, 'Alpha'],
  ['a new question', { tab: 'library', mode: 'new' } as Route, 'New question'],
  ['a new operator', { tab: 'operators', mode: 'new' } as Route, 'New operator'],
])('%s', (_, route, title) => {
  it('has Cancel and Save in its header, beside the title, and no bar at the foot', async () => {
    await at(route)
    const heading = await screen.findByRole('heading', { level: 1, name: title })
    const header = heading.closest('header') as HTMLElement
    const save = screen.getByRole('button', { name: 'Save' })
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    expect(header.contains(save)).toBe(true)
    expect(header.contains(cancel)).toBe(true)
    // The header's slot stays at the top while the form scrolls (class is the rule).
    expect((header.parentElement as HTMLElement).className).toContain('sticky')
    // Nothing is pinned to the foot of the page any more.
    expect(document.querySelector('.sticky.bottom-0')).toBeNull()
  })
})
