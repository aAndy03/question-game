import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BoardSection } from './BoardSection'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import type { CatalogItem, Recipe } from '@/host/types'

/**
 * P11.13. The library may hold as many difficulty-20 history questions as the
 * author wrote; a board selects one of them. The host refuses the illegal
 * board — this is the half that stops the operator reaching it.
 *
 * What Add domain *ticks* is `oneQuestionPerDifficulty`, tested in
 * `host/board.test.ts`: React Aria's listbox cannot be opened under jsdom (its
 * selection utils throw from a mount effect), so the picker is not drivable
 * from here and asserting on the rule where it lives is the honest cover.
 */
const stamps = { createdAt: 1_000, updatedAt: 1_000, archivedAt: null }

const question = (id: string, stem: string, difficulty: number | null): CatalogItem => ({
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

/** Three questions in one domain, two of them at difficulty 20. */
const library = (): CatalogItem[] => [
  {
    kind: 'domain',
    item: {
      id: 'dom-history',
      origin: 'operator',
      name: 'History',
      code: 'HIS_204',
      description: null,
      questions: [
        { questionId: 'q-easy-a', sortKey: 1 },
        { questionId: 'q-easy-b', sortKey: 2 },
        { questionId: 'q-hard', sortKey: 3 },
      ],
      ...stamps,
    },
  },
  question('q-easy-a', 'Easy A?', 20),
  question('q-easy-b', 'Easy B?', 20),
  question('q-hard', 'Hard one?', 60),
]

const recipeWith = (questionIds: string[]): Recipe => ({
  ...demoRecipe(),
  id: 'recipe-1',
  board: [{ domainId: 'dom-history', questionIds }],
  overlays: { teams: {}, domains: {}, questions: {} },
})

describe('Game ▸ Board, one question per difficulty', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(library(), [recipeWith(['q-easy-a'])])
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (recipe: Recipe) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BoardSection recipe={recipe} frozenReason={null} />
      </QueryClientProvider>,
    )

  const box = (name: string) => screen.getByRole('checkbox', { name })
  /** No jest-dom here, and React Aria disables the input itself. */
  const isDisabled = (el: HTMLElement) =>
    (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true'

  it('dims the twin of a selected question and leaves the other difficulty alone', async () => {
    draw(recipeWith(['q-easy-a']))
    await waitFor(() => expect(box('Easy A?')).toBeTruthy())

    expect(isDisabled(box('Easy A?'))).toBe(false)
    expect(isDisabled(box('Easy B?'))).toBe(true)
    expect(isDisabled(box('Hard one?'))).toBe(false)
  })

  it('frees the twin as soon as the holder is unticked', async () => {
    draw(recipeWith([]))
    await waitFor(() => expect(box('Easy A?')).toBeTruthy())

    expect(isDisabled(box('Easy A?'))).toBe(false)
    expect(isDisabled(box('Easy B?'))).toBe(false)
  })

  it('never disables a question that is already on the board', async () => {
    // A board written by an older build can hold both. Disabling them would
    // take away the checkbox the operator needs to fix it.
    draw(recipeWith(['q-easy-a', 'q-easy-b']))
    await waitFor(() => expect(box('Easy A?')).toBeTruthy())

    expect(isDisabled(box('Easy A?'))).toBe(false)
    expect(isDisabled(box('Easy B?'))).toBe(false)
  })

  it('writes the board when a question that is free is ticked', async () => {
    draw(recipeWith(['q-easy-a']))
    await waitFor(() => expect(box('Hard one?')).toBeTruthy())

    fireEvent.click(box('Hard one?'))

    await waitFor(() => {
      const call = fake.calls.findLast((c) => c.name === 'recipe_set_membership')
      expect(call).toBeTruthy()
      expect((call!.args as { board: { questionIds: string[] }[] }).board[0]!.questionIds).toEqual([
        'q-easy-a',
        'q-hard',
      ])
    })
  })
})

describe('Game ▸ Board, incomplete questions (§2.32)', () => {
  let fake: FakeHost

  /** The P11.13 library plus `q-open`: a member of History with no difficulty. */
  const withOpen = (): CatalogItem[] => {
    const [domain, ...rest] = library()
    if (domain?.kind !== 'domain') throw new Error('the fixture starts with its domain')
    return [
      { kind: 'domain', item: { ...domain.item, questions: [...domain.item.questions, { questionId: 'q-open', sortKey: 4 }] } },
      ...rest,
      question('q-open', 'Open one?', null),
    ]
  }

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(withOpen(), [recipeWith([])])
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (recipe: Recipe) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BoardSection recipe={recipe} frozenReason={null} />
      </QueryClientProvider>,
    )
  const box = (name: string) => screen.getByRole('checkbox', { name })
  const isDisabled = (el: HTMLElement) =>
    (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true'

  it('dims an incomplete member and names what it lacks', async () => {
    draw(recipeWith([]))
    await waitFor(() => expect(box('Open one?')).toBeTruthy())
    expect(isDisabled(box('Open one?'))).toBe(true)
    expect(screen.getByRole('img', { name: 'Incomplete — No difficulty' })).toBeTruthy()
    expect(isDisabled(box('Hard one?'))).toBe(false)
  })

  it('keeps the checkbox of an incomplete member that is already on the board', async () => {
    // Load would refuse this board; taking the question off is how to fix it.
    draw(recipeWith(['q-open']))
    await waitFor(() => expect(box('Open one?')).toBeTruthy())
    expect(isDisabled(box('Open one?'))).toBe(false)
  })

  it('lets a this-game difficulty make it selectable', async () => {
    draw({ ...recipeWith([]), overlays: { teams: {}, domains: {}, questions: { 'q-open': { difficulty: 70 } } } })
    await waitFor(() => expect(box('Open one?')).toBeTruthy())
    expect(isDisabled(box('Open one?'))).toBe(false)
    expect(screen.queryByRole('img', { name: /^Incomplete — / })).toBeNull()
  })
})

describe('Game ▸ Board, repeated difficulties (P12.7)', () => {
  let fake: FakeHost

  const allowing = (questionIds: string[], allow: boolean): Recipe => {
    const recipe = recipeWith(questionIds)
    return { ...recipe, settings: { ...recipe.settings, board: { allow_repeated_difficulty: allow } } }
  }

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(library(), [allowing(['q-easy-a'], false)])
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (recipe: Recipe, frozenReason: string | null = null) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <BoardSection recipe={recipe} frozenReason={frozenReason} />
      </QueryClientProvider>,
    )
  const box = (name: string) => screen.getByRole('checkbox', { name })
  const isDisabled = (el: HTMLElement) =>
    (el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true'

  it('offers the switch and writes it through recipe_set_settings', async () => {
    draw(allowing(['q-easy-a'], false))
    const toggle = await screen.findByRole('switch', { name: /allow repeated difficulties/i })
    fireEvent.click(toggle)
    await waitFor(() => {
      const call = fake.calls.findLast((c) => c.name === 'recipe_set_settings')
      expect(call).toBeTruthy()
      expect((call!.args as { settings: { board: { allow_repeated_difficulty: boolean } } }).settings.board).toEqual({
        allow_repeated_difficulty: true,
      })
    })
  })

  it('frees the twin when the game allows repeats', async () => {
    draw(allowing(['q-easy-a'], true))
    await waitFor(() => expect(box('Easy B?')).toBeTruthy())
    expect(isDisabled(box('Easy B?'))).toBe(false)
  })

  it('freezes the switch with the reason while the game is playing', async () => {
    draw(allowing(['q-easy-a'], false), 'Playing — game rules are frozen')
    const toggle = await screen.findByRole('switch', { name: /allow repeated difficulties/i })
    expect(isDisabled(toggle)).toBe(true)
  })
})
