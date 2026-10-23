import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Notice } from '@questiongame/contract'
import { StatusBar } from './StatusBar'
import { useNoticeStore } from '@/chrome/notices'
import { setHostTransport } from '@/host/host'
import { createFakeHost } from '@/host/fake'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * P11.8. The status-bar dot reads the **health report's status**; the
 * collector renders only notices whose surface is `collector`. A health item
 * addressed to a field — `health.audio_missing_cue` carries
 * `targetPath: 'audio.cues'` — is `inline`, so it appeared in neither: the dot
 * went amber on Control Load and the panel the operator clicked was empty,
 * with no way to find out why.
 *
 * P21.3: the list is the status bar's popover, opened by the one health and
 * notices button (or the store flag a refusal sets) — these render the bar.
 */

const notice = (over: Partial<Notice> = {}): Notice => ({
  code: 'health.audio_missing_cue',
  severity: 'warn',
  targetPath: 'audio.cues',
  actions: ['open_cue_folder'],
  detail: { cue: 'lock', file: 'lock.wav' },
  ...over,
})

afterEach(() => {
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  setHostTransport(null)
  cleanup()
})

function open(notices: Notice[]) {
  setHostTransport(createFakeHost())
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  useNoticeStore.getState().replaceSource('health', notices)
  useNoticeStore.getState().setCollectorOpen(true)
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={client}>
      <StatusBar />
    </QueryClientProvider>,
  )
}

describe('the notice collector', () => {
  it('names an inline finding instead of showing an empty panel', async () => {
    open([notice()])
    expect(await screen.findByText('1 item needs attention elsewhere')).toBeTruthy()
    expect(screen.getByText('Settings ▸ Audio')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show' })).toBeTruthy()
    expect(screen.queryByText('No notices yet'), 'the panel is not empty any more').toBeNull()
  })

  it('groups several findings by where they render', async () => {
    open([
      notice(),
      notice({ detail: { cue: 'correct', file: 'correct.wav' } }),
      notice({ code: 'stage.monitor_lost', targetPath: 'stage.monitor_id', actions: ['pick_monitor'] }),
    ])
    expect(await screen.findByText('3 items need attention elsewhere')).toBeTruthy()
    // Two audio cues are one place, not two lines.
    expect(screen.getAllByText('Settings ▸ Audio')).toHaveLength(1)
    expect(screen.getByText('Settings ▸ Monitors')).toBeTruthy()
  })

  it('still says nothing when there is nothing at all', async () => {
    open([])
    expect(await screen.findByText('No notices yet')).toBeTruthy()
    expect(screen.queryByText(/needs? attention elsewhere/)).toBeNull()
  })

  it('shows a collector notice normally, alongside the elsewhere line', async () => {
    open([notice({ code: 'health.search_degraded', targetPath: null, actions: ['rebuild_search'] }), notice()])
    expect(await screen.findByText('1 item needs attention elsewhere')).toBeTruthy()
    // The non-inline one is rendered as a real notice, not a summary line.
    expect(screen.queryByText('No notices yet')).toBeNull()
  })
})

describe('the notices popover (P21.3)', () => {
  it('is a fixed size, so a long list scrolls inside it', async () => {
    open(Array.from({ length: 12 }, (_, i) => notice({ code: 'health.search_degraded', targetPath: null, actions: ['rebuild_search'], detail: { n: String(i) } })))
    const panel = await waitFor(() => {
      const el = document.querySelector('[data-notice-panel]')
      if (!el) throw new Error('no panel')
      return el
    })
    expect(panel.className).toContain('h-[min(26rem,70vh)]')
    expect(panel.className).toContain('w-[min(24rem,90vw)]')
    expect(panel.querySelector('.overflow-y-auto')).not.toBeNull()
  })

  it('opens from the one health and notices button, and the store follows', async () => {
    setHostTransport(createFakeHost())
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StatusBar />
      </QueryClientProvider>,
    )
    const trigger = screen.getByRole('button', { name: /Health: .* · Open notices/ })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: 'Notices' })
    expect(within(dialog).getByText('No notices yet')).toBeTruthy()
    expect(useNoticeStore.getState().collectorOpen).toBe(true)
  })

  it('draws the displays as Settings ▸ Monitors does', async () => {
    setHostTransport(createFakeHost())
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StatusBar />
      </QueryClientProvider>,
    )
    const trigger = await screen.findByRole('button', { name: /^Displays: 2 displays$/ }, { timeout: 5000 })
    await userEvent.click(trigger)
    const dialog = await screen.findByRole('dialog', { name: /displays/i })
    expect(dialog.querySelector('[data-display-list]')).not.toBeNull()
    expect(within(dialog).getAllByRole('button', { name: /Send Stage here/ }).length).toBe(2)
  })
})

describe('the update notice (P12.9)', () => {
  it('opens the release page by version, and leaves the collector', async () => {
    const fake = createFakeHost()
    setHostTransport(fake)
    useNoticeStore.setState({ notices: [], collectorOpen: true })
    useNoticeStore.getState().push({
      code: 'update.available',
      severity: 'info',
      targetPath: null,
      actions: ['open_release', 'dismiss'],
      detail: { version: '1.0.3' },
    })
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <StatusBar />
      </QueryClientProvider>,
    )
    const dialog = await screen.findByRole('dialog', { name: 'Notices' })
    expect(within(dialog).getByText('questiongame 1.0.3 is available.')).toBeTruthy()
    within(dialog).getByRole('button', { name: 'Open release page' }).click()
    await waitFor(() => expect(fake.openedReleases).toEqual(['1.0.3']))
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(0))
  })
})
