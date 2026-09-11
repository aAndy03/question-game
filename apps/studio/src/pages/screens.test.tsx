import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EMPTY_PLAY_STATE, VIEWER_SOURCE, parseLayout, type PlayStateForMain } from '@questiongame/contract'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * P9 exit criteria:
 *   - an override saved here lands on *that* recipe with `recipe_set_layout`,
 *     once per debounce, in the contract's shape (so nothing from the handles
 *     can ride along);
 *   - the route is refused while a Play is open, with the two actions.
 */
describe('Screens', () => {
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
    vi.useRealTimers()
  })

  it('saves one recipe_set_layout for the recipe after the debounce, in the contract shape', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'screens' })
    })
    await screen.findByLabelText('Screens')

    // Stage would post its node rects; the test posts one.
    const iframe = (await waitFor(() => {
      const el = document.querySelector('iframe')
      if (!el) throw new Error('no canvas')
      return el
    })) as HTMLIFrameElement
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: VIEWER_SOURCE, type: 'ready' }, source: iframe.contentWindow }))
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: VIEWER_SOURCE, type: 'nodes', nodes: [{ id: 'idle.wordmark', x: 100, y: 100, width: 400, height: 120 }] },
          source: iframe.contentWindow,
        }),
      )
    })
    const handle = await screen.findByLabelText('idle.wordmark')
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    // Nudge with the keyboard: two presses, one save.
    fireEvent.keyDown(handle, { key: 'ArrowRight' })
    fireEvent.keyDown(handle, { key: 'ArrowRight' })

    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'recipe_set_layout')).toHaveLength(1), { timeout: 2000 })
    const call = fake.calls.find((c) => c.name === 'recipe_set_layout')!
    expect(call.args?.['id']).toBe('recipe-demo')
    const layout = call.args?.['layout'] as Record<string, unknown>
    expect(Object.keys(layout).sort()).toEqual(['decor', 'nodes', 'screens', 'text', 'version'])
    expect((layout['nodes'] as Record<string, unknown>)['idle.wordmark']).toEqual({ dx: 2, dy: 0 })
    // Round-trips through the validator unchanged: nothing foreign in it.
    expect(parseLayout(layout)).toEqual(layout)
    // Only this recipe's document was written.
    expect(fake.recipes.get('recipe-demo')?.layout).toEqual(layout)
  })

  it('is refused while a Play is open, with Go to Control and Stop playing', async () => {
    render(<App />)
    await screen.findByLabelText('Sections')
    const playing: PlayStateForMain = {
      ...EMPTY_PLAY_STATE,
      playId: 'p1',
      status: 'playing',
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
        overrideAfterLock: 'refuse_until_reveal',
        disabled: [],
      },
    }
    act(() => receivePlayState(playing))
    await act(async () => {
      await useNavStore.getState().go({ tab: 'screens' })
    })
    expect(useNavStore.getState().route.tab).not.toBe('screens')
    const notice = useNoticeStore.getState().notices[0]
    expect(notice?.actions).toEqual(['go_to_control', 'stop_playing'])
  })

  it('edits the eyebrow for the recipe language and saves it under layout.text (P11.16)', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'screens' })
    })
    await screen.findByLabelText('Screens')
    const iframe = (await waitFor(() => {
      const el = document.querySelector('iframe')
      if (!el) throw new Error('no canvas')
      return el
    })) as HTMLIFrameElement
    expect(iframe.getAttribute('src')).toContain('hold')
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: VIEWER_SOURCE, type: 'ready' }, source: iframe.contentWindow }))
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: VIEWER_SOURCE, type: 'nodes', nodes: [{ id: 'idle.eyebrow', x: 100, y: 100, width: 400, height: 40 }] },
          source: iframe.contentWindow,
        }),
      )
    })
    const handle = await screen.findByLabelText('idle.eyebrow')
    fireEvent.pointerDown(handle, { clientX: 0, clientY: 0, pointerId: 1 })
    fireEvent.pointerUp(handle, { clientX: 0, clientY: 0, pointerId: 1 })

    const field = await screen.findByLabelText('Eyebrow (every header)')
    fireEvent.change(field, { target: { value: 'HOPE CHALLENGE X AMiCUS' } })

    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'recipe_set_layout')).toHaveLength(1), { timeout: 2000 })
    const layout = fake.calls.find((c) => c.name === 'recipe_set_layout')!.args?.['layout'] as Record<string, unknown>
    expect(layout['text']).toEqual({ en: { idleEyebrow: 'HOPE CHALLENGE X AMiCUS' } })
    expect(layout['nodes']).toEqual({})
    expect(parseLayout(layout)).toEqual(layout)
  })

  it('lists the five overlays after the seven screens', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'screens' })
    })
    const tabs = await screen.findByLabelText('Screens')
    const names = Array.from(tabs.querySelectorAll('[role="tab"]')).map((t) => t.textContent)
    expect(names).toHaveLength(12)
    expect(names.slice(7)).toEqual(['Overlay · Token handoff', 'Overlay · Round advance', 'Overlay · Multiple answers', 'Overlay · Outcome', 'Overlay · Current team'])
  })
})
