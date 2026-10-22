import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useChromeStore } from '@/chrome/chrome'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { BETA_CHIP } from '@/copy/beta'
import { SidebarNav } from './SidebarNav'

/** P13.1 (CHIP01, CHIP02, CHIP04): questiongame Beta always says so. */
let fake: FakeHost

const mount = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SidebarNav />
    </QueryClientProvider>,
  )

beforeEach(() => {
  fake = createFakeHost()
  setHostTransport(fake)
})
afterEach(() => {
  act(() => useChromeStore.getState().setSidebar('expanded'))
  setHostTransport(null)
})

describe('the Beta chip', () => {
  it('names questiongame Beta in the sidebar header', async () => {
    fake.channel = 'beta'
    mount()
    const chip = await screen.findByLabelText(BETA_CHIP.name)
    expect(chip.textContent).toBe(BETA_CHIP.label)
  })

  it('is there in the icon rail too', async () => {
    fake.channel = 'beta'
    act(() => useChromeStore.getState().setSidebar('rail'))
    mount()
    expect(await screen.findByLabelText(BETA_CHIP.name)).toBeTruthy()
  })

  it('is absent from every other build', async () => {
    for (const channel of ['stable', 'dev'] as const) {
      fake.channel = channel
      const { unmount } = mount()
      await waitFor(() => expect(fake.calls.some((c) => c.name === 'app_info')).toBe(true))
      expect(screen.queryByLabelText(BETA_CHIP.name)).toBeNull()
      expect(document.querySelector('[data-beta-chip]')).toBeNull()
      unmount()
    }
  })
})

describe('the hidden sidebar’s edge (P20)', () => {
  it('shows nothing at rest: no gradient, and its bar only on hover or focus (class is the rule)', () => {
    act(() => useChromeStore.getState().setSidebar('hidden'))
    mount()
    const edge = screen.getByRole('button', { name: 'Show sidebar' })
    expect(edge.getAttribute('style') ?? '').not.toContain('gradient')
    const bar = edge.querySelector('span') as HTMLElement
    expect(bar.className).toContain('opacity-0')
    expect(bar.className).toContain('group-hover:opacity-100')
    expect(bar.className).toContain('group-focus-visible:opacity-100')
    expect(bar.getAttribute('style')).not.toContain('gradient')
  })

  it('brings the sidebar back at its default size when pressed, and does not slide it in on hover', () => {
    act(() => useChromeStore.getState().setSidebar('hidden'))
    mount()
    const edge = screen.getByRole('button', { name: 'Show sidebar' })
    act(() => {
      edge.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }))
    })
    expect(useChromeStore.getState().prefs[useChromeStore.getState().operatorId]?.sidebar ?? 'hidden').toBe('hidden')
    act(() => edge.click())
    expect(screen.queryByRole('button', { name: 'Show sidebar' })).toBeNull()
    expect(screen.getByRole('navigation').getAttribute('aria-label')).toBeTruthy()
  })
})
