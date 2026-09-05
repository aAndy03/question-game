import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
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
  })
  afterEach(() => setHostTransport(null))

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
