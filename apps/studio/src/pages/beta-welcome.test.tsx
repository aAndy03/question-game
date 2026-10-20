import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { resetUpdateCheck } from '@/host/updates'
import { resetWhatsNew } from '@/host/whatsNew'
import { BETA_CHIP, BETA_WELCOME } from '@/copy/beta'
import { FIRST_RUN } from '@/copy/firstRun'
import { WHATS_NEW_COPY } from '@/copy/whatsNew'

/**
 * P13.1. questiongame Beta's welcome comes before first run, holds back the
 * update check and *What's new* until it is answered, and never appears on
 * stable.
 */
let fake: FakeHost
const asked = (name: string) => fake.calls.some((c) => c.name === name)

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  receivePlayState(null)
  resetUpdateCheck()
  resetWhatsNew()
  fake = createFakeHost()
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe('questiongame Beta’s first launch (WEL06, WEL10, WEL16)', () => {
  it('welcomes before first run, and a copy goes straight to the shell with What’s new', async () => {
    fake.channel = 'beta'
    render(<App />)
    expect(await screen.findByText(BETA_WELCOME.en.body)).toBeTruthy()
    expect(screen.queryByText(FIRST_RUN.paths.title)).toBeNull()
    expect(asked('whats_new_get')).toBe(false)
    expect(asked('update_check')).toBe(false)

    fireEvent.click(screen.getByRole('button', { name: BETA_WELCOME.en.copy }))
    expect(await screen.findByRole('dialog', { name: WHATS_NEW_COPY.en.title('1.0.2') })).toBeTruthy()
    expect(screen.queryByText(FIRST_RUN.paths.title)).toBeNull()
    expect(screen.getByLabelText(BETA_CHIP.name)).toBeTruthy()
  })

  it('Start empty leads into first run', async () => {
    fake.channel = 'beta'
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: BETA_WELCOME.en.empty }))
    expect(await screen.findAllByText(FIRST_RUN.paths.title)).not.toHaveLength(0)
    expect(screen.queryByText(BETA_WELCOME.en.body)).toBeNull()
  })

  it('a welcome the host cannot answer, or that the browser holds back offline, never blanks Studio (review)', async () => {
    const { onlineManager } = await import('@tanstack/react-query')
    onlineManager.setOnline(false)
    try {
      fake.channel = 'dev'
      render(<App />)
      expect(await screen.findAllByText(FIRST_RUN.paths.title)).not.toHaveLength(0)
    } finally {
      onlineManager.setOnline(true)
    }
  })

  it('a refused welcome question falls through to Studio (review)', async () => {
    const real = fake.invoke.bind(fake)
    setHostTransport({
      invoke: (name, args) => (name === 'beta_welcome_get' ? Promise.reject({ code: 'window', message: 'no' }) : real(name, args)),
      listen: (name, handler) => fake.listen(name, handler),
    })
    render(<App />)
    expect(await screen.findAllByText(FIRST_RUN.paths.title, {}, { timeout: 5000 })).not.toHaveLength(0)
  })

  it('never appears on stable, which goes to first run as before', async () => {
    fake.channel = 'dev'
    render(<App />)
    expect(await screen.findAllByText(FIRST_RUN.paths.title)).not.toHaveLength(0)
    expect(screen.queryByText(BETA_WELCOME.en.body)).toBeNull()
    expect(fake.calls.filter((c) => c.name === 'beta_copy_stable_library')).toHaveLength(0)
  })
})
