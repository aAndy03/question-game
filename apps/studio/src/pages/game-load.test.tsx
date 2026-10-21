import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { CHROME, GAME } from '@/copy'
import type { CatalogItem, Recipe } from '@/host/types'

/**
 * P12.8, as reported: on Game ▸ Roster, *Load into Control* did nothing. The
 * board had a problem; Load was right to refuse; the reason was stacked inline
 * on the Board section, which the operator was not looking at.
 */
const stamps = { createdAt: 1_000, updatedAt: 1_000, archivedAt: null }

const question = (id: string, stem: string, difficulty: number): CatalogItem => ({
  kind: 'question',
  item: {
    id,
    origin: 'operator',
    stem,
    mediaAssetId: null,
    options: [
      { id: `${id}-0`, text: 'A', correct: true },
      { id: `${id}-1`, text: 'B', correct: false },
    ],
    difficulty,
    explanation: null,
    ...stamps,
  },
})

const twins = (): CatalogItem[] => [
  {
    kind: 'domain',
    item: {
      id: 'dom-sport',
      origin: 'operator',
      name: 'Sport',
      code: 'SPO_100',
      description: null,
      questions: [
        { questionId: 'q-1', sortKey: 1 },
        { questionId: 'q-2', sortKey: 2 },
      ],
      ...stamps,
    },
  },
  question('q-1', 'First ten?', 10),
  question('q-2', 'Second ten?', 10),
]

/** A board an older build (or a re-grade) left illegal: two tens in Sport. */
const broken = (): Recipe => ({
  ...demoRecipe(),
  id: 'recipe-1',
  name: 'Broken show',
  board: [{ domainId: 'dom-sport', questionIds: ['q-1', 'q-2'] }],
  overlays: { teams: {}, domains: {}, questions: {} },
})

let fake: FakeHost

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  receivePlayState(null)
  fake = createFakeHost()
  fake.seed([...demoLibrary(), ...twins()], [broken()])
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

async function onRoster() {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go({ tab: 'games', id: 'recipe-1', section: 'roster' })
  })
  return screen.findByRole('button', { name: /Load into Control/ }, { timeout: 5000 })
}

describe('a refused Load, from the Roster (P12.8)', () => {
  it('opens the collector with the reason and a way to the Board', async () => {
    fireEvent.click(await onRoster())

    const panel = await screen.findByRole('dialog', {}, { timeout: 5000 })
    expect(within(panel).getByText(CHROME.elsewhere(1))).toBeTruthy()
    expect(within(panel).getByText(CHROME.elsewhereGame(GAME.sections.board))).toBeTruthy()

    fireEvent.click(within(panel).getByRole('button', { name: CHROME.elsewhereGo }))
    await waitFor(() => expect(useNavStore.getState().route).toMatchObject({ tab: 'games', id: 'recipe-1', section: 'board' }))
  }, 20_000)

  it('marks the Board section in the rail while the problem stands', async () => {
    fireEvent.click(await onRoster())
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(1))
    // The collector is modal; the operator closes it and looks at the rail.
    act(() => useNoticeStore.getState().setCollectorOpen(false))
    expect(
      await screen.findByRole('button', { name: `${GAME.sections.board} — ${CHROME.needsAttention}` }, { timeout: 5000 }),
    ).toBeTruthy()
  }, 20_000)

  it('shows one notice however many times Load is pressed, and none once the board is fixed', async () => {
    const load = await onRoster()
    for (let i = 0; i < 3; i++) {
      fireEvent.click(load)
      await waitFor(() => expect(fake.calls.filter((c) => c.name === 'play_load')).toHaveLength(i + 1))
      act(() => useNoticeStore.getState().setCollectorOpen(false))
    }
    expect(useNoticeStore.getState().notices).toHaveLength(1)

    await act(async () => {
      await useNavStore.getState().go({ tab: 'games', id: 'recipe-1', section: 'board' })
    })
    // beta.4: the ticks live in *Choose questions…*.
    fireEvent.click(await screen.findByRole('button', { name: 'Choose questions…' }, { timeout: 5000 }))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Second ten?' }, { timeout: 5000 }))
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }))
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(0))
  }, 20_000)
})
