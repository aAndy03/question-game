import { describe, expect, it } from 'vitest'
import { EMPTY_PLAY_STATE, type PlayStateForMain, type StageTeam } from '@questiongame/contract'
import { isDropLegal, reorderedRing, ringEntries } from './ring'

/**
 * P8 exit criterion: every illegal ring drop is refused with `drop-illegal`,
 * at 2, 3, 5 and 8 teams. Built from the round invariant, not from fixtures.
 */
function team(i: number, turnsTaken: number): StageTeam {
  return {
    id: `t${i}`,
    name: `Team ${i}`,
    shortCode: `T${i}`,
    color: '#000',
    logoUrl: null,
    detail: null,
    score: 0,
    rank: 1,
    turnsTaken,
    active: true,
  }
}

/** Round `r`, the first `served` teams already served, the next one holding. */
function play(n: number, served: number): PlayStateForMain {
  const round = 2
  const teams = Array.from({ length: n }, (_, i) => team(i, i < served ? round : round - 1))
  const holder = teams[served]?.id ?? null
  return {
    ...EMPTY_PLAY_STATE,
    playId: 'p',
    status: 'playing',
    teams,
    ring: { order: teams.map((t) => t.id), currentTeamId: holder, roundIndex: round },
    operator: {
      recipeId: 'r',
      legalTokenTargets: teams.slice(served + 1).map((t) => t.id),
      defaultNextTeamId: teams[served + 1]?.id ?? null,
      consecutiveCorrect: 0,
      isRehearsal: n === 1,
      canUndo: true,
      canRedo: false,
      eventCount: 3,
      showGiveToken: true,
      overrideAfterLock: 'refuse_until_reveal',
      disabled: [],
    },
  }
}

describe('ring', () => {
  for (const n of [2, 3, 5, 8]) {
    it(`classifies ${n} teams into history / current / future`, () => {
      const served = Math.floor(n / 2)
      const entries = ringEntries(play(n, served))
      expect(entries.filter((e) => e.phase === 'history')).toHaveLength(served)
      expect(entries.filter((e) => e.phase === 'current')).toHaveLength(n > served ? 1 : 0)
      expect(entries.filter((e) => e.phase === 'future')).toHaveLength(Math.max(0, n - served - 1))
    })

    it(`refuses every drop that touches history or the holder at ${n} teams`, () => {
      const served = Math.floor(n / 2)
      const state = play(n, served)
      const entries = ringEntries(state)
      const ids = state.ring.order
      for (const from of ids) {
        for (const to of ids) {
          const fromPhase = entries.find((e) => e.team.id === from)?.phase
          const toPhase = entries.find((e) => e.team.id === to)?.phase
          const legal = fromPhase === 'future' && toPhase === 'future'
          expect(isDropLegal(entries, from, to), `${from}→${to}`).toBe(legal)
          if (!legal) expect(reorderedRing(state, from, to)).toBeNull()
        }
      }
    })
  }

  it('reorders only the future ring and keeps the prefix', () => {
    const state = play(5, 1) // t0 served, t1 holds, t2 t3 t4 future
    const order = reorderedRing(state, 't4', 't2')
    expect(order).toEqual(['t0', 't1', 't4', 't2', 't3'])
  })

  it('a one-team rehearsal has no future ring at all', () => {
    const entries = ringEntries(play(1, 0))
    expect(entries.map((e) => e.phase)).toEqual(['current'])
  })
})
