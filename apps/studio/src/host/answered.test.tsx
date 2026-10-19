import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { useNoticeStore } from '@/chrome/notices'
import { useHostCommand } from './commands'
import { demoRecipe } from './devFake'
import { createFakeHost, type FakeHost } from './fake'
import { setHostTransport } from './host'
import type { CatalogItem, Recipe } from './types'

/**
 * P12.12, from the 1.0.2 review. A Board refusal can be fixed from the
 * library — re-grading the twin in Questions, restoring the archived row — and
 * the notice has to go when it is, not linger until the next Board write. It
 * must also *stay* while the board is still illegal: a false all-clear is the
 * worse bug.
 */
const stamps = { createdAt: 1_000, updatedAt: 1_000, archivedAt: null }

const question = (id: string, difficulty: number): CatalogItem => ({
  kind: 'question',
  item: {
    id,
    origin: 'operator',
    stem: `${id}?`,
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

const library = (): CatalogItem[] => [
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
        { questionId: 'q-3', sortKey: 3 },
      ],
      ...stamps,
    },
  },
  question('q-1', 10),
  question('q-2', 10),
  question('q-3', 30),
]

const recipe: Recipe = {
  ...demoRecipe(),
  id: 'recipe-1',
  board: [{ domainId: 'dom-sport', questionIds: ['q-1', 'q-2'] }],
  overlays: { teams: {}, domains: {}, questions: {} },
}

const clash = 'recipe.recipe-1.board.dom-sport.difficulty.10'

let fake: FakeHost

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
)

beforeEach(() => {
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  fake = createFakeHost()
  fake.seed(library(), [recipe])
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

async function refusedLoad() {
  const { result } = renderHook(() => useHostCommand(), { wrapper })
  await act(async () => {
    await result.current.ok('play_load', { recipeId: 'recipe-1', playId: 'p1' })
  })
  expect(useNoticeStore.getState().notices.map((n) => n.targetPath)).toEqual([clash])
  return result
}

describe('a Board refusal answered from the library (P12.12)', () => {
  it('goes when the twin is re-graded in Questions', async () => {
    const run = await refusedLoad()
    await act(async () => {
      await run.current('catalog_upsert', { item: question('q-2', 20) })
    })
    await waitFor(() => expect(useNoticeStore.getState().notices).toHaveLength(0))
  })

  it('stays when the library edit did not fix the board', async () => {
    const run = await refusedLoad()
    await act(async () => {
      await run.current('catalog_upsert', { item: question('q-3', 40) })
    })
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'rules_preview')).toBe(true))
    await new Promise((r) => setTimeout(r, 20))
    expect(useNoticeStore.getState().notices.map((n) => n.targetPath)).toEqual([clash])
  })

  it('goes when the archived row it names is restored', async () => {
    const path = 'recipe.recipe-1.board.question.q-3'
    useNoticeStore.getState().pushError('catalog', `${path}: an archived question is on the board`, path)
    const { result } = renderHook(() => useHostCommand(), { wrapper })
    await act(async () => {
      await result.current('catalog_restore', { kind: 'question', id: 'q-3' })
    })
    expect(useNoticeStore.getState().notices).toHaveLength(0)
  })
})
