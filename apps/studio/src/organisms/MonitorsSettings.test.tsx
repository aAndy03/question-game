import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'

/**
 * P11.11. Two audience displays and no HDMI splitter, so the app is the
 * splitter. The card is where a display becomes a Stage display and back.
 *
 * The operator never has to know the word "pacer": they send Stage somewhere,
 * and the app works out that the first one paces and the rest mirror.
 */
describe('Settings ▸ Monitors, with several displays', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const cards = () => [...document.querySelectorAll<HTMLElement>('[data-monitor-card]')]
  const cardFor = (key: string) => {
    const card = cards().find((c) => c.dataset['monitorKey'] === key)
    if (!card) throw new Error(`no card for ${key}`)
    return card
  }
  const button = (card: HTMLElement, label: string) =>
    [...card.querySelectorAll('button')].find((b) => b.textContent?.trim() === label) ?? null

  async function openMonitors() {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'monitors' })
    })
    // The cards, not the name: the display picker lists the same names, so a
    // text query finds two of everything.
    await screen.findByLabelText('Sections')
    await waitFor(() => expect(cards().length).toBe(2))
  }

  it('makes the first display the pacer and the next a mirror', async () => {
    await openMonitors()
    expect(cardFor('primary').dataset['monitorCard']).toBe('free')

    // The first Send is the pacer: the window that has always existed.
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('primary').dataset['monitorCard']).toBe('stage'))
    expect(fake.calls.some((c) => c.name === 'stage_set_monitor')).toBe(true)

    // The second is a mirror — the same picture, on another display.
    await act(async () => button(cardFor('tv@1920x1080'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['monitorCard']).toBe('mirror'))
    expect(fake.calls.some((c) => c.name === 'stage_add_mirror')).toBe(true)
    expect(cardFor('tv@1920x1080').textContent).toContain('Mirroring')
  })

  it('takes a mirror away again, and never the pacer', async () => {
    await openMonitors()
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('primary').dataset['monitorCard']).toBe('stage'))
    await act(async () => button(cardFor('tv@1920x1080'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['monitorCard']).toBe('mirror'))

    // The pacer's card offers no Remove: it is *moved* with the display
    // picker, so the operator cannot end up with no Stage at all.
    expect(button(cardFor('primary'), 'Remove Stage')).toBeNull()

    await act(async () => button(cardFor('tv@1920x1080'), 'Remove Stage')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['monitorCard']).toBe('free'))
    expect(fake.calls.some((c) => c.name === 'stage_remove_mirror')).toBe(true)
  })

  /**
   * The settings document has no host event of its own, so a command that
   * writes it must invalidate the query. One missing from that list looks like
   * it did nothing: the host is right, the store is stale, and the card the
   * operator just pressed springs back.
   */
  it('refreshes the settings the card reads', async () => {
    await openMonitors()
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await act(async () => button(cardFor('tv@1920x1080'), 'Send Stage here')!.click())
    await waitFor(() =>
      expect(fake.calls.filter((c) => c.name === 'settings_get').length).toBeGreaterThan(1),
    )
  })
})
