import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { onlineManager } from '@tanstack/react-query'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { createFakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { resetUpdateCheck } from '@/host/updates'
import { resetWhatsNew } from '@/host/whatsNew'
import { FIRST_RUN } from '@/copy/firstRun'

/**
 * Review, P13.1. Every Studio query is a call into the app's own host, so a
 * machine with no network — the normal case for a show — must draw Studio
 * exactly as one with a network does.
 */
beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  receivePlayState(null)
  resetUpdateCheck()
  resetWhatsNew()
  setHostTransport(createFakeHost())
  onlineManager.setOnline(false)
})
afterEach(() => {
  onlineManager.setOnline(true)
  setHostTransport(null)
})

describe('Studio offline', () => {
  it('draws as it does online', async () => {
    render(<App />)
    expect(await screen.findAllByText(FIRST_RUN.paths.title)).not.toHaveLength(0)
  })
})
