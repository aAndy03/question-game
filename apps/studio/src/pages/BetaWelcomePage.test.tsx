import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { BETA_WELCOME } from '@/copy/beta'
import { BetaWelcomePage } from './BetaWelcomePage'

/**
 * P13.1. questiongame Beta's first launch: one sentence about its own
 * library, then Copy my stable library or Start empty.
 */

let fake: FakeHost
const calls = (name: string) => fake.calls.filter((c) => c.name === name).length
const EN = BETA_WELCOME.en

function mount(onDone = vi.fn()) {
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <BetaWelcomePage onDone={onDone} />
    </QueryClientProvider>,
  )
  return onDone
}

beforeEach(() => {
  fake = createFakeHost()
  fake.channel = 'beta'
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe('the Beta welcome (WEL06–WEL15)', () => {
  it('says Beta keeps its own library, and offers both choices', async () => {
    mount()
    expect(await screen.findByText(EN.body)).toBeTruthy()
    expect(await screen.findByRole('button', { name: EN.copy })).toBeTruthy()
    expect(screen.getByRole('button', { name: EN.empty })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1)
  })

  it('offers only Start empty when there is no stable library', async () => {
    fake.betaStable = 'missing'
    mount()
    await screen.findByRole('button', { name: EN.empty })
    await waitFor(() => expect(calls('beta_welcome_get')).toBeGreaterThan(0))
    expect(screen.queryByRole('button', { name: EN.copy })).toBeNull()
  })

  it('says to close questiongame first while it is running', async () => {
    fake.betaStable = 'running'
    mount()
    expect(await screen.findByText(EN.running)).toBeTruthy()
    const copy = screen.getByRole('button', { name: EN.copy })
    expect(copy.hasAttribute('disabled') || copy.getAttribute('aria-disabled') === 'true').toBe(true)
    fake.betaStable = 'available'
    fireEvent.click(screen.getByRole('button', { name: EN.tryAgain }))
    await waitFor(() => expect(screen.queryByText(EN.running)).toBeNull())
  })

  it('Start empty ends the welcome and copies nothing', async () => {
    const onDone = mount()
    fireEvent.click(await screen.findByRole('button', { name: EN.empty }))
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(calls('beta_welcome_done')).toBe(1)
    expect(calls('beta_copy_stable_library')).toBe(0)
  })

  it('Copy copies once, however often it is pressed, then ends the welcome', async () => {
    // Answers a task later, as the real IPC does, so the second press lands mid-copy.
    setHostTransport({
      invoke: (name, args) => new Promise((ok, no) => setTimeout(() => fake.invoke(name, args).then(ok as never, no), 30)),
      listen: (name, handler) => fake.listen(name, handler),
    })
    const onDone = mount()
    const copy = await screen.findByRole('button', { name: EN.copy })
    fireEvent.click(copy)
    fireEvent.click(copy)
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
    expect(calls('beta_copy_stable_library')).toBe(1)
  })

  it('a refused copy says why and keeps both ways on', async () => {
    const onDone = mount()
    const copy = await screen.findByRole('button', { name: EN.copy })
    fake.betaStable = 'running'
    fireEvent.click(copy)
    expect(await screen.findByText(EN.running)).toBeTruthy()
    expect(screen.getByRole('button', { name: EN.tryAgain })).toBeTruthy()
    expect(screen.getByRole('button', { name: EN.empty })).toBeTruthy()
    expect(onDone).not.toHaveBeenCalled()
  })

  it('a library that already holds work counts as done (CMD18)', async () => {
    const onDone = mount()
    const copy = await screen.findByRole('button', { name: EN.copy })
    fake.seed([{ kind: 'team', item: { id: 't', name: 'T', shortCode: 'T', color: null, logoAssetId: null, detail: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } } as never])
    fireEvent.click(copy)
    await waitFor(() => expect(onDone).toHaveBeenCalledOnce())
  })

  it('speaks Romanian when asked', async () => {
    mount()
    fireEvent.click(await screen.findByRole('radio', { name: 'Română' }))
    expect(await screen.findByText(BETA_WELCOME.ro.body)).toBeTruthy()
    expect(screen.getByRole('button', { name: BETA_WELCOME.ro.copy })).toBeTruthy()
  })
})
