import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { Notice } from '@questiongame/contract'
import { NoticeCollector } from './NoticeCollector'
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
      <NoticeCollector />
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

describe('the collector drawer (P12.8)', () => {
  // HeroUI 3.2.6 made `Drawer.Content` a full-viewport track that places the
  // dialog; a width on it pinned the right-hand panel to the left edge.
  it('sizes the panel, not the track', async () => {
    open([notice()])
    await screen.findByText('1 item needs attention elsewhere')
    const dialog = document.querySelector('.drawer__dialog')
    expect(dialog?.className).toContain('w-[26rem]')
    expect(document.querySelector('.drawer__content')?.className).not.toContain('w-[26rem]')
  })
})
