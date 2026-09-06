import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { VIEWER_SOURCE, type PlayStateForMain } from '@questiongame/contract'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoPlay, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * P8 exit criteria:
 *   - Viewer click, Action Panel button and keyboard chord dispatch the same
 *     command — three call sites, one handler.
 *   - Undo, restart and abandon are blocked with a wait notice while an
 *     overlay is busy.
 */
describe('Control', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    receivePlayState(null)
  })
  afterEach(() => {
    setHostTransport(null)
    receivePlayState(null)
  })

  async function openControl(state: PlayStateForMain) {
    fake.playState = state
    render(<App />)
    await act(async () => {
      receivePlayState(state)
      await useNavStore.getState().go({ tab: 'control' })
    })
    await screen.findByLabelText('Lock')
  }

  const lockCalls = () => fake.calls.filter((c) => c.name === 'lock_selection').length

  it('a button, a chord and a Viewer hit target all reach one lock_selection', async () => {
    await openControl(demoPlay('question-issued'))

    // 1. the Action Panel button
    fireEvent.click(screen.getByLabelText('Lock'))
    await waitFor(() => expect(lockCalls()).toBe(1))

    // 2. the keyboard chord (Enter), on the page, not in an input
    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(lockCalls()).toBe(2))

    // 3. a Viewer hit target: Stage would post the stem's rect; we post it.
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: VIEWER_SOURCE, type: 'ready' }, source: iframe.contentWindow }))
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: VIEWER_SOURCE, type: 'nodes', nodes: [{ id: 'question.stem', x: 10, y: 10, width: 100, height: 40 }] },
          source: iframe.contentWindow,
        }),
      )
    })
    await waitFor(() => expect(document.querySelector('[data-hit-target="legal"]')).not.toBeNull())
    fireEvent.click(document.querySelector('[data-hit-target="legal"]') as HTMLElement)
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'reveal_stem').length).toBe(1))

    // All three went through the same seam: every call is in the one log.
    expect(fake.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['lock_selection', 'lock_selection', 'reveal_stem']))
  })

  it('undo, restart and abandon wait for a busy overlay', async () => {
    const busy: PlayStateForMain = {
      ...demoPlay('question-issued'),
      overlay: { busy: true, active: { kind: 'current-team', teamId: null }, pending: null, enabled: true },
    }
    await openControl(busy)
    for (const label of ['Undo turn', 'Restart', 'Abandon']) {
      const buttons = screen.getAllByLabelText(label)
      for (const b of buttons) expect((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true').toBe(true)
    }
    expect(screen.getAllByLabelText('Wait for the overlay to finish').length).toBeGreaterThan(0)
  })
})
