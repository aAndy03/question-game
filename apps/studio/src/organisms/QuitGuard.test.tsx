import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { useQuitStore } from '@/chrome/quit'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { QUIT } from '@/copy'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'

/** P12.2: Studio's answer to the host's `close-requested`. */

const OPEN_PLAY = {
  ...EMPTY_PLAY_STATE,
  playId: 'p1',
  status: 'loaded' as const,
  operator: {
    recipeId: 'recipe-demo',
    legalTokenTargets: [],
    defaultNextTeamId: null,
    consecutiveCorrect: 0,
    isRehearsal: false,
    canUndo: false,
    canRedo: false,
    eventCount: 1,
    showGiveToken: false,
    overrideAfterLock: 'refuse_until_reveal' as const,
    disabled: [],
  },
}

function mount(): FakeHost {
  const fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
  return fake
}

async function requestClose() {
  await act(async () => {
    useQuitStore.getState().request()
  })
}

describe('QuitGuard', () => {
  beforeEach(() => {
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    useQuitStore.setState({ requested: 0 })
    receivePlayState(null)
  })
  afterEach(() => setHostTransport(null))

  it('quits at once with nothing unsaved and no game loaded', async () => {
    const fake = mount()
    render(<App />)
    await requestClose()
    await waitFor(() => expect(fake.quits).toBe(1))
    expect(fake.closeCancels).toBe(0)
  })

  it('asks when a game is loaded; Keep working cancels the close', async () => {
    const fake = mount()
    // Before render: the bridge's `get_state` answers on mount.
    fake.playState = OPEN_PLAY
    render(<App />)
    await requestClose()
    fireEvent.click(await screen.findByRole('button', { name: QUIT.keepWorking }))
    await waitFor(() => expect(fake.closeCancels).toBe(1))
    expect(fake.quits).toBe(0)
  })

  it('asks when a game is loaded; Quit quits', async () => {
    const fake = mount()
    // Before render: the bridge's `get_state` answers on mount.
    fake.playState = OPEN_PLAY
    render(<App />)
    await requestClose()
    fireEvent.click(await screen.findByRole('button', { name: QUIT.quit }))
    await waitFor(() => expect(fake.quits).toBe(1))
    expect(fake.closeCancels).toBe(0)
  })

  it('a dirty editor that says Keep editing cancels the close', async () => {
    const fake = mount()
    render(<App />)
    useNavStore.getState().setGuard(() => false)
    await requestClose()
    await waitFor(() => expect(fake.closeCancels).toBe(1))
    expect(fake.quits).toBe(0)
  })
})
