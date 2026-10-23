import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * beta.8: the selection outlives the view. A search, another domain, a filter
 * hides rows without unticking them; what the strip counts and acts on is the
 * whole selection; a row that leaves the tab (archived out of Active) drops.
 */
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

const strip = () => document.querySelector<HTMLElement>('[data-bulk-strip]')!
const tick = (name: RegExp) => fireEvent.click(screen.getByRole('checkbox', { name }))

describe('the selection outlives the view (beta.8)', () => {
  it('keeps a question ticked under one domain when another is picked, and acts on both', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', domainId: 'dom-history' })
    })
    tick(await screen.findByRole('checkbox', { name: /^Select Which city/ }).then(() => /^Select Which city/))
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', domainId: 'dom-tech' })
    })
    tick(await screen.findByRole('checkbox', { name: /^Select What does the L/ }).then(() => /^Select What does the L/))
    expect(within(strip()).getByText('2 selected (1 on this page)')).toBeTruthy()
    expect(within(strip()).getByRole('button', { name: 'Archive 2' })).toBeTruthy()
  })

  it('keeps the ticks through a search, and the header tick takes off only what is shown', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library' })
    })
    tick(await screen.findByRole('checkbox', { name: /^Select Which city/ }).then(() => /^Select Which city/))
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search' }), { target: { value: 'HTML' } })
    await waitFor(() => expect(within(strip()).getByText('1 selected (0 on this page)')).toBeTruthy())
    tick(await screen.findByRole('checkbox', { name: /^Select What does the L/ }).then(() => /^Select What does the L/))
    expect(within(strip()).getByText('2 selected (1 on this page)')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Select all' }))
    expect(within(strip()).getByText('1 selected (0 on this page)')).toBeTruthy()
  })

  it('drops a ticked question that is archived out of Active', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library' })
    })
    tick(await screen.findByRole('checkbox', { name: /^Select Which city/ }).then(() => /^Select Which city/))
    tick(/^Select What does the L/)
    const city = [...fake.library.values()].find((r) => r.kind === 'question' && (r.item as { stem: string }).stem.startsWith('Which city'))!
    await act(async () => {
      await fake.invoke('catalog_archive', { kind: 'question', id: city.item.id })
    })
    await waitFor(() => expect(within(strip()).getByText('1 selected')).toBeTruthy())
  })
})
