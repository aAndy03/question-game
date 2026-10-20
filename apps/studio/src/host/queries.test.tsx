import { afterEach, describe, expect, it } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { createFakeHost } from './fake'
import { demoLibrary } from './devFake'
import { setHostTransport } from './host'
import { useListHits } from './queries'

/** Review, Important 3: a search in flight never shows the whole library. */

afterEach(() => setHostTransport(null))

describe('useListHits', () => {
  it('keeps the last answer while the next one is on its way, and asks with a rounded limit', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary())
    let release: (() => void) | null = null
    setHostTransport({
      invoke: (name, args) =>
        name === 'catalog_search' && (args as { query: { text: string } }).query.text === 'whic'
          ? new Promise((ok, no) => {
              release = () => void fake.invoke(name, args).then(ok as never, no)
            })
          : fake.invoke(name, args),
      listen: (name, handler) => fake.listen(name, handler),
    })
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>
    const { result, rerender } = renderHook(({ text }) => useListHits('question', text, 'active', 7), { wrapper, initialProps: { text: 'which' } })
    await waitFor(() => expect(result.current).not.toBeNull())
    const first = result.current
    rerender({ text: 'whic' })
    expect(result.current).toBe(first)
    release!()
    await waitFor(() => expect(result.current).not.toBe(first))
    expect(result.current).not.toBeNull()
    const limits = fake.calls.filter((c) => c.name === 'catalog_search').map((c) => (c.args as { query: { limit: number } }).query.limit)
    expect(limits.every((l) => l === 1000)).toBe(true)
    rerender({ text: '' })
    expect(result.current).toBeNull()
  })
})
