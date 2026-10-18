import { afterEach, describe, expect, it } from 'vitest'
import { gameSectionOf, latestForStatusBar, useNoticeStore } from './notices'

/**
 * P12.8. A refusal addressed to a field still has to be seen from wherever
 * the operator is — and pressing the same button five times is one problem,
 * not five.
 */
afterEach(() => useNoticeStore.setState({ notices: [], collectorOpen: false }))

const board = 'recipe.r1.board.dom-1.difficulty.10'
const reason = `${board}: two questions in this domain share a difficulty`

describe('the notice store (P12.8)', () => {
  it('keeps one notice for a refusal repeated five times', () => {
    for (let i = 0; i < 5; i++) useNoticeStore.getState().pushError('catalog', reason, board)
    expect(useNoticeStore.getState().notices).toHaveLength(1)
  })

  it('clears the errors under a path and leaves everything else', () => {
    const store = useNoticeStore.getState()
    store.pushError('catalog', reason, board)
    store.pushError('catalog', 'recipe.r2.board.x: nope', 'recipe.r2.board.x')
    store.push({ code: 'health.disk_low', severity: 'warn', targetPath: 'recipe.r1.roster', actions: [], detail: {} })
    store.dismissUnder('recipe.r1.')
    const left = useNoticeStore.getState().notices.map((n) => n.targetPath)
    expect(left.sort()).toEqual(['recipe.r1.roster', 'recipe.r2.board.x'])
  })

  it('puts an addressed error on the status bar', () => {
    useNoticeStore.getState().pushError('catalog', reason, board)
    expect(latestForStatusBar(useNoticeStore.getState().notices)?.targetPath).toBe(board)
  })
})

describe('gameSectionOf (P12.8)', () => {
  it('reads the recipe and the section from a path at any depth', () => {
    expect(gameSectionOf('recipe.r1.board.dom-1.difficulty.10')).toEqual({ recipeId: 'r1', section: 'board' })
    expect(gameSectionOf('recipe.r1.roster')).toEqual({ recipeId: 'r1', section: 'roster' })
  })

  it('answers null for anything that is not a Game section', () => {
    expect(gameSectionOf('recipe.r1')).toBeNull()
    expect(gameSectionOf('recipe.r1.layout')).toBeNull()
    expect(gameSectionOf('audio.cues')).toBeNull()
    expect(gameSectionOf(null)).toBeNull()
  })
})
