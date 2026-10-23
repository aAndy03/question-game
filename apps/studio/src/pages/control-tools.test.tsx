import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { CHROME, CONTROL, UNLOAD } from '@/copy'
import { createFakeHost } from '@/host/fake'
import { demoLibrary, demoPlay, demoRecipe } from '@/host/devFake'
import type { FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * P21.4. Control's audio, *Reset layout* and settings float are in the top
 * bar beside the theme and the operator, and only while Control is open; the
 * display pickers left Control for the status bar's displays.
 */
describe("Control's tools in the top bar (P21.4)", () => {
  let fake: FakeHost
  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    receivePlayState(null)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const go = async (tab: 'control' | 'teams') => {
    await act(async () => {
      await useNavStore.getState().go(tab === 'control' ? { tab: 'control' } : { tab: 'teams' })
    })
  }

  it('shows them on Control only, in the header', async () => {
    render(<App />)
    await go('teams')
    expect(document.querySelector('[data-control-tools]')).toBeNull()

    await go('control')
    const tools = await screen.findByRole('button', { name: CONTROL.resetLayout })
    expect(tools.closest('header')).not.toBeNull()
    expect(screen.getByRole('button', { name: CHROME.mute }).closest('header')).not.toBeNull()
    expect(screen.getByRole('button', { name: CONTROL.settings }).closest('header')).not.toBeNull()

    await go('teams')
    expect(document.querySelector('[data-control-tools]')).toBeNull()
  })

  it('puts Unload game beside the play pill, on Control, and nowhere when nothing is loaded (P21.5)', async () => {
    render(<App />)
    await go('control')
    await screen.findByRole('button', { name: CONTROL.resetLayout })
    expect(screen.queryByRole('button', { name: UNLOAD.action }), 'no game, nothing to unload').toBeNull()
  })

  it('offers Unload game in the header while a game is loaded', async () => {
    const play = demoPlay('question-issued')
    fake.playState = play
    receivePlayState(play)
    render(<App />)
    await go('control')
    const unload = await screen.findByRole('button', { name: UNLOAD.action })
    expect(unload.closest('header')).not.toBeNull()
    await go('teams')
    expect(screen.queryByRole('button', { name: UNLOAD.action })).toBeNull()
  })

  it('leaves no display pickers on Control', async () => {
    render(<App />)
    await go('control')
    await screen.findByRole('button', { name: CONTROL.resetLayout })
    expect(screen.queryByText(CONTROL.stageDisplay)).toBeNull()
    expect(screen.queryByText(CONTROL.statsDisplay)).toBeNull()
    expect(document.querySelector('[data-control-top]')).toBeNull()
  })
})
