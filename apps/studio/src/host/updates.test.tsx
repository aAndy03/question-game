import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from './fake'
import { setHostTransport } from './host'
import { receivePlayState } from './playState'
import { resetUpdateCheck, useUpdateCheckOnStart } from './updates'

/**
 * P12.9. Once per session, when nothing is on air, Studio asks the host
 * whether GitHub has a newer release, and says so only if it does. Offline,
 * up to date, or switched off: nothing at all.
 */
function Probe() {
  useUpdateCheckOnStart()
  return null
}

let fake: FakeHost

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <Probe />
    </QueryClientProvider>,
  )

const checks = () => fake.calls.filter((c) => c.name === 'update_check').length

beforeEach(() => {
  resetUpdateCheck()
  useNoticeStore.setState({ notices: [] })
  receivePlayState(null)
  fake = createFakeHost()
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe('the update check on start (P12.9)', () => {
  it('says a newer release exists, once, with a way to its page', async () => {
    fake.update = { current: '1.0.2', latest: '1.0.3', url: 'https://example.invalid', newer: true }
    mount()
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(1))
    const notice = useNoticeStore.getState().notices[0]!
    expect(notice.code).toBe('update.available')
    expect(notice.severity).toBe('info')
    expect(notice.actions).toEqual(['open_release', 'dismiss'])
    expect(notice.detail.version).toBe('1.0.3')
  })

  it('says nothing when this is the latest release', async () => {
    fake.update = { current: '1.0.2', latest: '1.0.2', url: null, newer: false }
    mount()
    await waitFor(() => expect(checks()).toBe(1))
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('says nothing when GitHub cannot be reached', async () => {
    fake.update = 'offline'
    mount()
    await waitFor(() => expect(checks()).toBe(1))
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })

  it('does not ask when the operator turned it off', async () => {
    fake.updatesOnStart = false
    mount()
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'settings_get')).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(checks()).toBe(0)
  })

  it('waits while a game is loaded, then asks', async () => {
    receivePlayState({ ...EMPTY_PLAY_STATE, playId: 'p1', status: 'playing' } as never)
    mount()
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'settings_get')).toBe(true))
    await new Promise((r) => setTimeout(r, 50))
    expect(checks()).toBe(0)
    act(() => receivePlayState(null))
    await waitFor(() => expect(checks()).toBe(1))
  })

  it('asks once per session, however often Studio re-renders', async () => {
    const first = mount()
    await waitFor(() => expect(checks()).toBe(1))
    first.unmount()
    mount()
    await new Promise((r) => setTimeout(r, 50))
    expect(checks()).toBe(1)
  })
})
