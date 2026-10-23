import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoMonitors, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { useWindowsStore } from '@/chrome/windows'
import { SETTINGS } from '@/copy/settings'

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

  // One row per display (the redesign): `data-stage` is its Stage state.
  const cards = () => [...document.querySelectorAll<HTMLElement>('[data-display-row]')]
  const cardFor = (key: string) => {
    const card = cards().find((c) => c.dataset['displayRow'] === key)
    if (!card) throw new Error(`no row for ${key}`)
    return card
  }
  const button = (card: HTMLElement, label: string) =>
    [...card.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label) ?? null

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
    expect(cardFor('primary').dataset['stage']).toBe('free')

    // The first Send is the pacer: the window that has always existed.
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('primary').dataset['stage']).toBe('stage'))
    expect(fake.calls.some((c) => c.name === 'stage_set_monitor')).toBe(true)

    // The second is a mirror — the same picture, on another display.
    await act(async () => button(cardFor('tv@1920x1080'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['stage']).toBe('mirror'))
    expect(fake.calls.some((c) => c.name === 'stage_add_mirror')).toBe(true)
    expect(cardFor('tv@1920x1080').textContent).toContain('Mirroring')
  })

  it('moves the pacer from another card, now that Control has no Stage picker (P21.4)', async () => {
    await openMonitors()
    expect(button(cardFor('tv@1920x1080'), 'Move Stage here'), 'no Stage yet, nothing to move').toBeNull()
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('primary').dataset['stage']).toBe('stage'))

    await act(async () => button(cardFor('tv@1920x1080'), 'Move Stage here')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['stage']).toBe('stage'))
    expect(cardFor('primary').dataset['stage']).toBe('free')
    const moves = fake.calls.filter((c) => c.name === 'stage_set_monitor')
    expect(moves.at(-1)?.args).toEqual({ monitorId: 'tv@1920x1080' })
    expect(fake.calls.some((c) => c.name === 'stage_add_mirror'), 'a move is not a mirror').toBe(false)
  })

  it('takes a mirror away again, and never the pacer', async () => {
    await openMonitors()
    await act(async () => button(cardFor('primary'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('primary').dataset['stage']).toBe('stage'))
    await act(async () => button(cardFor('tv@1920x1080'), 'Send Stage here')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['stage']).toBe('mirror'))

    // The pacer's card offers no Remove: it is *moved* with the display
    // picker, so the operator cannot end up with no Stage at all.
    expect(button(cardFor('primary'), 'Remove Stage')).toBeNull()

    await act(async () => button(cardFor('tv@1920x1080'), 'Remove Stage')!.click())
    await waitFor(() => expect(cardFor('tv@1920x1080').dataset['stage']).toBe('free'))
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

    await waitFor(() => expect(cardFor('primary').dataset['stage']).toBe('stage'))
    // The remembered display is a pick, not a place — and it is *connected*,
    // so it must not be dressed as missing. `free` offers Send Stage here,
    // which is what the operator wants from it.
    expect(cardFor('tv@1920x1080').dataset['stage']).toBe('free')
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
    expect(cardFor('primary').dataset['stage']).toBe('free')
    expect(cardFor('tv@1920x1080').dataset['stage']).toBe('free')
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
      expect(card.textContent, `${card.dataset['displayRow']} is in the list, so it is connected`).not.toContain(
        'Not connected',
      )
    }
  })

})

/**
 * The redesign's promise: two displays and seven read the same way. A row per
 * display left to right as they stand, a map tile per display, and the status
 * bar saying where each window is — names, not just a count.
 */
describe('Settings ▸ Monitors, with seven displays', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost({ monitors: demoMonitors(7) })
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useWindowsStore.setState({ statsOpen: null, stageOn: null, stageMirrors: [] })
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const rows = () => [...document.querySelectorAll<HTMLElement>('[data-display-list] [data-display-row]')]
  const rowFor = (key: string) => {
    const row = rows().find((c) => c.dataset['displayRow'] === key)
    if (!row) throw new Error(`no row for ${key}`)
    return row
  }
  const button = (row: HTMLElement, label: string) =>
    [...row.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent?.trim()) === label) ?? null

  async function openMonitors() {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'monitors' })
    })
    await waitFor(() => expect(rows().length).toBe(7))
  }

  it('lists every display left to right as they stand, each on the map', async () => {
    await openMonitors()
    // The prompter stands left of the laptop: it is first, whatever order the
    // host enumerated them in; the 4K panel on the far right is last.
    expect(rows().map((r) => r.dataset['displayRow'])).toEqual([
      'prompter@1080x1920',
      'primary',
      'projector@1024x768',
      'tv@1920x1080',
      'capture@1920x1080',
      'dell@3440x1440',
      'lg@3840x2160',
    ])
    const map = document.querySelector('[data-display-map]')
    expect(map?.getAttribute('aria-label')).toContain('Prompter, Built-in display')
    expect(map?.querySelectorAll('[data-display-map-tile]').length).toBe(7)
    // What each row says about its panel: mode, scaling only when it is not 1,
    // Primary on one, the Windows duplicate where there is one.
    expect(rowFor('lg@3840x2160').textContent).toContain('3840×2160')
    expect(rowFor('lg@3840x2160').textContent).toContain('200% scaling')
    expect(rowFor('dell@3440x1440').textContent).not.toContain('scaling')
    expect(rows().filter((r) => r.textContent?.includes('Primary')).map((r) => r.dataset['displayRow'])).toEqual(['primary'])
    expect(rowFor('capture@1920x1080').querySelector('[data-monitor-also-on]')?.textContent).toContain('NINJA V')
    expect(document.body.textContent).not.toContain(SETTINGS.monitors.single)
  })

  it('sends one pacer and any number of mirrors, and the status bar names them', async () => {
    await openMonitors()
    await act(async () => button(rowFor('dell@3440x1440'), 'Send Stage here')!.click())
    await waitFor(() => expect(rowFor('dell@3440x1440').dataset['stage']).toBe('stage'))
    for (const key of ['projector@1024x768', 'lg@3840x2160']) {
      await act(async () => button(rowFor(key), 'Send Stage here')!.click())
      await waitFor(() => expect(rowFor(key).dataset['stage']).toBe('mirror'))
    }
    expect(fake.calls.filter((c) => c.name === 'stage_add_mirror').length).toBe(2)
    // The pacer is marked and never removable; every free row may move it.
    expect(button(rowFor('dell@3440x1440'), 'Remove Stage')).toBeNull()
    expect(button(rowFor('prompter@1080x1920'), 'Move Stage here')).not.toBeNull()
    // Statistics never shares a display with Stage, mirror included.
    expect(button(rowFor('projector@1024x768'), 'Show Statistics here')).toBeNull()
    expect(rowFor('projector@1024x768').dataset['statsState']).toBe('blocked')

    expect(screen.getByRole('button', { name: 'Displays: 7 displays · Stage on DELL U3423WE and 2 more' })).toBeTruthy()
    const glyphs = [...document.querySelectorAll<HTMLElement>('[data-display-glyph]')]
    expect(glyphs.map((g) => g.dataset['displayGlyph'])).toEqual(rows().map((r) => r.dataset['displayRow']))
    expect(glyphs.filter((g) => g.dataset['stage']).map((g) => `${g.dataset['displayGlyph']}:${g.dataset['stage']}`)).toEqual([
      'projector@1024x768:mirror',
      'dell@3440x1440:stage',
      'lg@3840x2160:mirror',
    ])
  })

  it('names the remembered display, and Use primary forgets it', async () => {
    await openMonitors()
    await act(async () => button(rowFor('dell@3440x1440'), 'Send Stage here')!.click())
    await waitFor(() => expect(document.body.textContent).toContain('Remembered: DELL U3423WE'))
    const usePrimary = screen.getByRole('button', { name: SETTINGS.monitors.usePrimary })
    await act(async () => usePrimary.click())
    // The pacer, never the mirror path (§9, P11.11).
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'stage_set_monitor').at(-1)?.args).toEqual({ monitorId: null }))
    await waitFor(() => expect(rowFor('primary').dataset['stage']).toBe('stage'))
  })

  it('lights a display on the map while its row is pointed at, and back', async () => {
    await openMonitors()
    const tile = () => document.querySelector('[data-display-map-tile="capture@1920x1080"] [data-display-tile]')!
    expect(tile().className).not.toContain('ring-2')
    fireEvent.pointerEnter(rowFor('capture@1920x1080'))
    expect(tile().className).toContain('ring-2')
    fireEvent.pointerLeave(rowFor('capture@1920x1080'))
    expect(tile().className).not.toContain('ring-2')
    fireEvent.pointerEnter(document.querySelector('[data-display-map-tile="capture@1920x1080"]')!)
    expect(rowFor('capture@1920x1080').className).toContain('bg-[')
  })
})

describe('Settings ▸ Monitors, with one display', () => {
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  it('says how one display works, and draws no map', async () => {
    const fake = createFakeHost({ monitors: demoMonitors(1) })
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useWindowsStore.setState({ statsOpen: null, stageOn: null, stageMirrors: [] })
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'monitors' })
    })
    await waitFor(() => expect(document.querySelectorAll('[data-display-row]').length).toBe(1))
    expect(document.body.textContent).toContain(SETTINGS.monitors.single)
    expect(document.querySelector('[data-display-map]')).toBeNull()
  })
})
