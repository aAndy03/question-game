import { describe, expect, it } from 'vitest'
import { blockedMembers, everyQuestion, oneQuestionPerDifficulty, type BoardMember } from './board'
import { createFakeHost } from './fake'
import { demoRecipe } from './devFake'
import type { CatalogItem } from './types'

const member = (questionId: string, difficulty: number, selected = false): BoardMember => ({
  questionId,
  difficulty,
  selected,
})

describe('blockedMembers', () => {
  it('blocks nothing while the domain has nothing selected', () => {
    const blocked = blockedMembers([member('q-a', 10), member('q-b', 10), member('q-c', 30)])
    expect(blocked.size).toBe(0)
  })

  it('blocks the twins of a selected question and nothing else', () => {
    const blocked = blockedMembers([
      member('q-a', 10, true),
      member('q-b', 10),
      member('q-c', 10),
      member('q-d', 30),
    ])
    expect([...blocked.keys()].sort()).toEqual(['q-b', 'q-c'])
    expect(blocked.get('q-b')).toBe(10)
  })

  it('lets a member with no difficulty claim nothing and be blocked by nothing', () => {
    // It is incomplete (§2.32); the Board dims it for that reason, not this one.
    const blocked = blockedMembers([member('q-a', 10, true), { questionId: 'q-open', difficulty: null, selected: false }])
    expect(blocked.size).toBe(0)
    expect(blockedMembers([{ questionId: 'q-open', difficulty: null, selected: true }, member('q-b', 10)]).size).toBe(0)
  })

  it('never blocks a question that is already selected', () => {
    // A board saved by an older build can hold two at one difficulty. Blocking
    // them both would disable the checkbox the operator needs to untick.
    const blocked = blockedMembers([member('q-a', 10, true), member('q-b', 10, true)])
    expect(blocked.size).toBe(0)
  })

  it('frees the twins again when the holder is unticked', () => {
    const members = [member('q-a', 10, true), member('q-b', 10)]
    expect(blockedMembers(members).size).toBe(1)
    expect(blockedMembers([member('q-a', 10), member('q-b', 10)]).size).toBe(0)
  })
})

describe('oneQuestionPerDifficulty', () => {
  it('takes the lowest id at each difficulty, difficulty ascending', () => {
    expect(
      oneQuestionPerDifficulty([
        { questionId: 'q-z', difficulty: 30 },
        { questionId: 'q-b', difficulty: 10 },
        { questionId: 'q-a', difficulty: 10 },
        { questionId: 'q-y', difficulty: 20 },
      ]),
    ).toEqual(['q-a', 'q-y', 'q-z'])
  })

  it('keeps a ladder with no repeats whole', () => {
    expect(
      oneQuestionPerDifficulty([
        { questionId: 'q-1', difficulty: 10 },
        { questionId: 'q-2', difficulty: 20 },
      ]),
    ).toEqual(['q-1', 'q-2'])
  })

  it('has nothing to pick from an empty domain', () => {
    expect(oneQuestionPerDifficulty([])).toEqual([])
  })
})

/**
 * The in-memory host is the second adapter, and a shell that only stays legal
 * because the fake never refuses is exactly the shell that gets refused in the
 * app. It runs the same rule.
 */
describe('the fake host', () => {
  /** Complete — two options, one correct — so a refusal is about the board, not the row. */
  const question = (id: string, difficulty: number | null): CatalogItem => ({
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
      createdAt: 1,
      updatedAt: 1,
      archivedAt: null,
    },
  })

  it('refuses a board that selects an incomplete question, as the host does (§2.32)', async () => {
    const fake = createFakeHost()
    fake.seed(
      [question('q-a', 20), question('q-open', null)],
      [
        {
          ...demoRecipe(),
          id: 'recipe-1',
          board: [{ domainId: 'dom-1', questionIds: ['q-a'] }],
          overlays: { teams: {}, domains: {}, questions: {} },
        },
      ],
    )
    await expect(
      fake.invoke('recipe_set_membership', {
        id: 'recipe-1',
        teams: [],
        board: [{ domainId: 'dom-1', questionIds: ['q-a', 'q-open'] }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('recipe.recipe-1.board.dom-1.question.q-open') })

    // A this-game difficulty completes it for this show, and then it may go on.
    await fake.invoke('recipe_set_overlay', {
      id: 'recipe-1',
      target: { target: 'question', id: 'q-open', patch: { difficulty: 70 } },
      scope: 'this_game',
    })
    await expect(
      fake.invoke('recipe_set_membership', {
        id: 'recipe-1',
        teams: [],
        board: [{ domainId: 'dom-1', questionIds: ['q-a', 'q-open'] }],
      }),
    ).resolves.toBeTruthy()
  })

  const hostWithTwins = () => {
    const fake = createFakeHost()
    fake.seed(
      [question('q-a', 20), question('q-b', 20)],
      [
        {
          ...demoRecipe(),
          id: 'recipe-1',
          board: [{ domainId: 'dom-1', questionIds: ['q-a'] }],
          overlays: { teams: {}, domains: {}, questions: {} },
        },
      ],
    )
    return fake
  }

  it('refuses a board that selects two questions at one difficulty', async () => {
    const fake = hostWithTwins()
    await expect(
      fake.invoke('recipe_set_membership', {
        id: 'recipe-1',
        teams: [],
        board: [{ domainId: 'dom-1', questionIds: ['q-a', 'q-b'] }],
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('recipe.recipe-1.board.dom-1.difficulty.20') })
  })

  it('refuses a difficulty override that would collide with a selected question', async () => {
    const fake = createFakeHost()
    fake.seed(
      [question('q-a', 20), question('q-b', 60)],
      [
        {
          ...demoRecipe(),
          id: 'recipe-1',
          board: [{ domainId: 'dom-1', questionIds: ['q-a', 'q-b'] }],
          overlays: { teams: {}, domains: {}, questions: {} },
        },
      ],
    )
    await expect(
      fake.invoke('recipe_set_overlay', {
        id: 'recipe-1',
        target: { target: 'question', id: 'q-b', patch: { difficulty: 20 } },
        scope: 'this_game',
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('difficulty.20') })
  })

  it('leaves the catalog row alone when applying to the original is refused', async () => {
    const fake = createFakeHost()
    fake.seed(
      [question('q-a', 20), question('q-b', 60)],
      [
        {
          ...demoRecipe(),
          id: 'recipe-1',
          board: [{ domainId: 'dom-1', questionIds: ['q-a', 'q-b'] }],
          overlays: { teams: {}, domains: {}, questions: {} },
        },
      ],
    )
    await expect(
      fake.invoke('recipe_set_overlay', {
        id: 'recipe-1',
        target: { target: 'question', id: 'q-b', patch: { difficulty: 20 } },
        scope: 'original',
      }),
    ).rejects.toMatchObject({ message: expect.stringContaining('difficulty.20') })

    const row = await fake.invoke<{ item: { difficulty: number } }>('catalog_get', {
      kind: 'question',
      id: 'q-b',
    })
    expect(row.item.difficulty).toBe(60)
  })
})

describe('repeated difficulties, when the game allows them (P12.7)', () => {
  it('blocks nothing when the game allows repeats', () => {
    const blocked = blockedMembers([member('q-a', 10, true), member('q-b', 10), member('q-c', 10)], true)
    expect(blocked.size).toBe(0)
  })

  it('adds every question, difficulty ASC then id ASC, when the game allows repeats', () => {
    expect(
      everyQuestion([
        { questionId: 'q-c', difficulty: 30 },
        { questionId: 'q-b', difficulty: 10 },
        { questionId: 'q-a', difficulty: 10 },
      ]),
    ).toEqual(['q-a', 'q-b', 'q-c'])
  })
})
