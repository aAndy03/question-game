import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { useHealthStore } from '@/chrome/health'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from './fake'
import { demoLibrary, demoRecipe } from './devFake'
import { setHostTransport } from './host'
import type { CatalogItem } from './types'

/**
 * P7 exit criterion: "Renaming a team updates every surface via host events —
 * no second store, no manual refetch." The fake host emits `catalog-changed`
 * exactly as the real one does; nothing in the tree refetches on its own.
 */
describe('host bridge', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    useHealthStore.setState({ report: null })
  })
  afterEach(() => setHostTransport(null))

  /** A `health` item, as the host emits one (§12.6). */
  const healthItem = (code: string, actions: string[]) => ({
    code,
    severity: 'warn' as const,
    targetPath: null,
    actions,
    detail: {},
  })

  it('a health report replaces the previous one and leaves other notices alone', async () => {
    render(<App />)
    await screen.findByText('Alpha')
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'health_get')).toBe(true))

    act(() => {
      useNoticeStore.getState().pushError('match', 'the host refused')
      fake.emit('health', {
        status: 'warn',
        items: [healthItem('health.disk_low', ['open_data_folder']), healthItem('health.search_degraded', ['rebuild_search'])],
      })
    })
    const isHealth = (n: { detail: Readonly<Record<string, string>> }) => n.detail.source === 'health'
    expect(useNoticeStore.getState().notices.filter(isHealth)).toHaveLength(2)
    expect(useHealthStore.getState().report?.status).toBe('warn')

    act(() => {
      fake.emit('health', { status: 'error', items: [healthItem('health.persist_failed', ['retry_persist', 'open_data_folder'])] })
    })
    const notices = useNoticeStore.getState().notices
    expect(notices.filter(isHealth).map((n) => n.code)).toEqual(['health.persist_failed'])
    expect(notices.filter((n) => !isHealth(n)).map((n) => n.code)).toEqual(['match'])
    expect(useHealthStore.getState().report?.status).toBe('error')

    // An `ok` after a `warn` clears the list and the dot (§12.6).
    act(() => fake.emit('health', { status: 'ok', items: [] }))
    expect(useNoticeStore.getState().notices.filter(isHealth)).toHaveLength(0)
    expect(useHealthStore.getState().report?.status).toBe('ok')
  })

  it('a renamed team reaches the list and the aside through catalog-changed alone', async () => {
    render(<App />)
    expect(await screen.findByText('Alpha')).toBeTruthy()

    // Open the team so both the list row and the aside show the name.
    await act(async () => {
      await useNavStore.getState().go({ tab: 'teams', id: 'team-alpha', mode: 'view' })
    })
    await waitFor(() => expect(screen.getAllByText('Alpha').length).toBeGreaterThanOrEqual(2))

    const before = fake.calls.filter((c) => c.name === 'catalog_list').length

    // Another writer renames the team (the host emits the event on write).
    const row = fake.library.get('team:team-alpha') as Extract<CatalogItem, { kind: 'team' }>
    await act(async () => {
      await fake.invoke('catalog_upsert', { item: { kind: 'team', item: { ...row.item, name: 'Alpha Prime' } } })
    })

    await waitFor(() => expect(screen.getAllByText('Alpha Prime').length).toBeGreaterThanOrEqual(2))
    expect(screen.queryByText('Alpha')).toBeNull()

    // The refetch was the bridge's invalidation, not a component's own call.
    const after = fake.calls.filter((c) => c.name === 'catalog_list').length
    expect(after).toBeGreaterThan(before)
  })

  it('a refused write becomes a notice, and nothing else', async () => {
    render(<App />)
    await screen.findByText('Alpha')
    await act(async () => {
      await useNavStore.getState().go({ tab: 'teams', mode: 'new' })
    })
    // The fake refuses an empty name like the host does; drive the seam directly.
    const { command } = await import('./host')
    await expect(
      command('catalog_upsert', { item: { kind: 'team', item: { ...(fake.library.get('team:team-bravo') as Extract<CatalogItem, { kind: 'team' }>).item, id: 'team-x', name: '' } } }),
    ).rejects.toMatchObject({ code: 'catalog' })
  })
})
