import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { BoardSection } from './BoardSection'
import { RosterSection } from './RosterSection'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import type { BoardDomain, CatalogItem, Recipe } from '@/host/types'
import { keyboardDrag, stubRowLayout } from '@/test/sortable'

/**
 * P20: a game's order by drag and drop — the roster (the opening ring) and
 * the Board's domains (the order teams see them in) — and a Board that holds
 * a big game as a page of rows rather than five hundred lines.
 */
let fake: FakeHost
let restore: (() => void) | null = null
beforeEach(() => {
  fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
  restore = stubRowLayout()
})
afterEach(() => {
  restore?.()
  setHostTransport(null)
  cleanup()
})

const wrap = (node: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{node}</QueryClientProvider>)
const lastCall = (name: string) => fake.calls.findLast((c) => c.name === name)
const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'

describe('Game ▸ Roster, by drag and drop (P20)', () => {
  it('has a handle per team in place of the arrows', async () => {
    wrap(<RosterSection recipe={demoRecipe()} frozenReason={null} />)
    await screen.findByRole('button', { name: 'Reorder Alpha' })
    expect(screen.getAllByRole('button', { name: /^Reorder / })).toHaveLength(4)
    expect(screen.queryByRole('button', { name: 'Move up' })).toBeNull()
    expect(screen.getAllByRole('button', { name: 'Remove from roster' })).toHaveLength(4)
  })

  it('writes the new play order on a drop', async () => {
    wrap(<RosterSection recipe={demoRecipe()} frozenReason={null} />)
    await keyboardDrag(await screen.findByRole('button', { name: 'Reorder Alpha' }), 2)
    await waitFor(() => expect(lastCall('recipe_set_membership')).toBeTruthy())
    const args = lastCall('recipe_set_membership')!.args as { teams: string[]; board: BoardDomain[] }
    expect(args.teams).toEqual(['team-bravo', 'team-charlie', 'team-alpha', 'team-delta'])
    expect(args.board).toEqual(demoRecipe().board)
  })

  it('freezes every handle while the game plays', async () => {
    wrap(<RosterSection recipe={demoRecipe()} frozenReason="This game is playing." />)
    const handles = await screen.findAllByRole('button', { name: /^Reorder / })
    for (const h of handles) expect(isDisabled(h)).toBe(true)
  })
})

describe('Game ▸ Board, one row per domain (P20)', () => {
  const draw = (recipe: Recipe = demoRecipe()) => wrap(<BoardSection recipe={recipe} frozenReason={null} />)

  it('a small board starts open, its questions in the walk the snapshot asks them in', async () => {
    // q-h3 is 70 on this game, so it walks after q-h1/q-h2 whatever the stored order.
    draw({ ...demoRecipe(), board: [{ domainId: 'dom-history', questionIds: ['q-h3', 'q-h2', 'q-h1'] }] })
    const toggle = await screen.findByRole('button', { name: 'History' })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    await waitFor(() => expect(document.querySelectorAll('[data-board-question]')).toHaveLength(3))
    const chips = Array.from(document.querySelectorAll('[data-board-question] button[title]')).map((b) => Number(b.textContent?.match(/\d+/)?.[0]))
    expect(chips).toEqual([...chips].sort((a, b) => a - b))
  })

  it('the name opens and closes its questions', async () => {
    draw()
    const toggle = await screen.findByRole('button', { name: 'History' })
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
  })

  it('a big board starts closed, and Open all opens every domain', async () => {
    const domains: CatalogItem[] = Array.from({ length: 5 }, (_, i) => ({
      kind: 'domain',
      item: { id: `dom-${i}`, origin: 'operator', name: `Domain ${i}`, code: `D${i}`, description: null, questions: [{ questionId: 'q-h1', sortKey: 1 }], createdAt: 1, updatedAt: 1, archivedAt: null },
    }))
    fake.seed(domains, [])
    draw({ ...demoRecipe(), board: domains.map((d) => ({ domainId: d.item.id, questionIds: ['q-h1'] })) })
    const toggles = await Promise.all(Array.from({ length: 5 }, (_, i) => screen.findByRole('button', { name: `Domain ${i}` })))
    for (const t of toggles) expect(t.getAttribute('aria-expanded')).toBe('false')
    expect(document.querySelectorAll('[data-board-question]')).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Open all' }))
    for (const t of toggles) expect(t.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close all' }))
    for (const t of toggles) expect(t.getAttribute('aria-expanded')).toBe('false')
  })

  it('says how many of the domain’s questions it plays on its row', async () => {
    draw()
    const list = await screen.findByRole('list', { name: 'Domains on the board' })
    await waitFor(() => expect(within(list).getByText(/^3 of \d+ questions$/)).toBeTruthy())
  })

  it('dragging a domain writes the board in the new order, questions untouched', async () => {
    draw()
    await keyboardDrag(await screen.findByRole('button', { name: 'Reorder History' }), 1)
    await waitFor(() => expect(lastCall('recipe_set_membership')).toBeTruthy())
    const args = lastCall('recipe_set_membership')!.args as { teams: string[]; board: BoardDomain[] }
    expect(args.board).toEqual([demoRecipe().board[1], demoRecipe().board[0]])
    expect(args.teams).toEqual(demoRecipe().teams)
  })

  it('keeps the repeats switch, named, as a setting row', async () => {
    draw()
    expect(await screen.findByRole('switch', { name: 'Allow repeated difficulties' })).toBeTruthy()
  })

  it('gives the long hint only to an empty board', async () => {
    draw({ ...demoRecipe(), board: [] })
    expect(await screen.findByText(/^Pick domains for this show/)).toBeTruthy()
    cleanup()
    draw()
    expect(await screen.findByText(/^Drag a domain to change the order/)).toBeTruthy()
  })
})
