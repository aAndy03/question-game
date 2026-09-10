import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { useWindowsStore } from '@/chrome/windows'

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
    // Where the windows are is module state fed by an event, so it outlives a
    // test the way it outlives a route change. Left alone, one test's mirror
    // is the next test's starting position.
    useWindowsStore.setState({ statsOpen: null, stageOn: null, stageMirrors: [] })
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

  /** The host's own list, so an emitted event does not blank the cards. */
  const monitorList = () => fake.invoke<unknown[]>('monitors_list', undefined)

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

  /**
   * The bug this file was written for.
   *
   * Stage opens fullscreen on **primary** at Control Load. The host reported
   * that as `stageOn: null` — the same value it uses for "there is no Stage" —
   * and Studio read the remembered *pick* instead of the *place*. So the card
   * for a remembered display claimed Stage was on it, the primary display's
   * card said nothing, and the show was on neither of the two.
   */
  it('shows Stage on the display it is actually on, not the one remembered', async () => {
    // An earlier session remembered the TV.
    await fake.invoke('stage_set_monitor', { monitorId: 'tv@1920x1080' })
    await openMonitors()

    // But Stage is fullscreen on primary — which is exactly what Control Load
    // does, and what the remembered pick has not yet overridden.
    await act(async () => {
      fake.emit('monitors-changed', {
        monitors: await monitorList(),
        stageMonitorId: 'tv@1920x1080',
        stageMirrors: [],
        stageOn: 'primary',
        stageOpen: true,
        statsMonitorId: null,
        statsOpen: false,
      })
    })

    await waitFor(() => expect(cardFor('primary').dataset['monitorCard']).toBe('stage'))
    // The remembered display is a pick, not a place — and it is *connected*,
    // so it must not be dressed as missing. `free` offers Send Stage here,
    // which is what the operator wants from it.
    expect(cardFor('tv@1920x1080').dataset['monitorCard']).toBe('free')
    expect(
      cardFor('tv@1920x1080').textContent,
      'a connected display is never labelled Not connected',
    ).not.toContain('Not connected')
    expect(document.body.textContent).toContain('Stage stands on: Built-in display')
  })

  /** No window at all is not the same as a window on primary. */
  it('shows no Stage anywhere before one is opened', async () => {
    await openMonitors()
    await act(async () => {
      fake.emit('monitors-changed', {
        monitors: await monitorList(),
        stageMonitorId: null,
        stageMirrors: [],
        stageOn: null,
        stageOpen: false,
        statsMonitorId: null,
        statsOpen: false,
      })
    })
    expect(cardFor('primary').dataset['monitorCard']).toBe('free')
    expect(cardFor('tv@1920x1080').dataset['monitorCard']).toBe('free')
  })


  /**
   * `monitors_list` reports connected displays and nothing else, so **no card
   * may ever say "Not connected"** — that state is for a pick whose display is
   * gone, and a card is only drawn for one that is here. Saying it of a
   * plugged-in display sent the operator looking for a cable fault that did
   * not exist.
   */
  it('never labels a display it is drawing as disconnected', async () => {
    await fake.invoke('stage_set_monitor', { monitorId: 'tv@1920x1080' })
    await openMonitors()
    await act(async () => {
      fake.emit('monitors-changed', {
        monitors: await monitorList(),
        stageMonitorId: 'tv@1920x1080',
        stageMirrors: [],
        stageOn: 'primary',
        stageOpen: true,
        statsMonitorId: null,
        statsOpen: false,
      })
    })
    for (const card of cards()) {
      expect(card.textContent, `${card.dataset['monitorKey']} is in the list, so it is connected`).not.toContain(
        'Not connected',
      )
    }
  })

})
