import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { createFakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/** Stable 1.1 (U-02): the same toolbar, in the same order, on every library tab. */

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useChromeStore.setState({ listState: {}, prefs: {}, archiveScope: {} })
  receivePlayState(null)
  const fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe.each(['teams', 'games', 'operators'] as const)('the %s tab', (tab) => {
  it('puts Search · Filters · Sort · (Group) · View · Status in that order', async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab } as Route)
    })
    const bar = (await screen.findAllByRole('searchbox'))[0]!.closest('[data-list-toolbar]') as HTMLElement
    const group = within(bar).queryByRole('button', { name: /^Group: / })
    expect(group === null).toBe(tab === 'operators')
    const order = [
      within(bar).getByRole('searchbox'),
      within(bar).getByRole('button', { name: /^Filters/ }),
      within(bar).getByRole('button', { name: /^Sort: / }),
      ...(group ? [group] : []),
      within(bar).getByRole('radiogroup', { name: /View/ }),
      within(bar).getByRole('tablist', { name: 'Archive scope' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
    expect(within(bar).getByRole('tab', { name: 'All' })).toBeTruthy()
  })
})
