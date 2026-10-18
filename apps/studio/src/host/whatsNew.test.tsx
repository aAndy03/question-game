import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { useWhatsNewStore } from '@/chrome/whatsNew'
import { createFakeHost, type FakeHost } from './fake'
import { setHostTransport } from './host'
import { forgetPlayState, receivePlayState } from './playState'
import { resetWhatsNew, useWhatsNewOnStart } from './whatsNew'

/**
 * P12.10, from the final review: a show resumed at boot is a Play Studio has
 * not heard of until `get_state` answers. "No Play in the store" before then
 * is "not known yet", and What's new must not open over Control.
 */
function Probe() {
  useWhatsNewOnStart()
  return null
}

let fake: FakeHost

beforeEach(() => {
  resetWhatsNew()
  fake = createFakeHost()
  fake.whatsNewSince = '1.0.1'
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe("What's new on start (P12.10)", () => {
  it('waits for the host to say whether a game is loaded', async () => {
    forgetPlayState()
    render(<Probe />)
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'whats_new_get')).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(useWhatsNewStore.getState().open).toBeNull()
    act(() => receivePlayState(null))
    await waitFor(() => expect(useWhatsNewStore.getState().open).not.toBeNull())
  })
})
