import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, leaderboard, nodeId } from '@questiongame/contract'
import { STAGE_COPY } from '@/copy'
import { AnswerGrid, DomainGrid, LeaderboardList, ScoreboardTable, SequenceTable, StageHeader, optionState } from './index'

const byNode = (root: HTMLElement, id: string) => root.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null

describe('organisms derive every node from play-state', () => {
  it('SequenceTable renders one row per ring position, keyed by team id', () => {
    const state = FIXTURES['team-order']
    const { container } = render(<SequenceTable state={state} />)
    for (const id of state.ring.order) expect(byNode(container, nodeId('teamOrder', 'row', id))).toBeTruthy()
    const current = byNode(container, nodeId('teamOrder', 'row', state.ring.currentTeamId!))!
    expect(current.dataset.current).toBe('true')
  })

  it('DomainGrid renders every domain with a formatted difficulty and dims exhausted ones', () => {
    const state = FIXTURES['choose-domain']
    const { container } = render(<DomainGrid state={state} />)
    for (const d of state.domains) {
      const card = byNode(container, nodeId('chooseDomain', 'card', d.id))!
      expect(card).toBeTruthy()
      expect(card.dataset.exhausted).toBe(String(d.exhausted))
    }
    expect(container.textContent).toContain('SCI_204')
  })

  it('AnswerGrid keeps hidden options mounted and marks reveals by id', () => {
    const state = FIXTURES['question-options-partial']
    const { container } = render(<AnswerGrid state={state} />)
    for (const o of state.session!.options) {
      const card = byNode(container, nodeId('question', 'option', o.id))!
      expect(card).toBeTruthy()
      expect(card.dataset.revealed).toBe(String(state.session!.reveals.optionIds.includes(o.id)))
    }
  })

  it('AnswerGrid renders nothing but stays mounted without a session', () => {
    const { container } = render(<AnswerGrid state={FIXTURES.idle} />)
    expect(container.querySelector('[data-answer-grid]')).toBeTruthy()
    expect(container.querySelectorAll('[data-node-id]').length).toBe(0)
  })

  it('optionState follows outcome → lock → selection precedence', () => {
    const correct = FIXTURES['question-outcome-correct'].session!
    for (const id of correct.outcome!.correctOptionIds) expect(optionState(correct, id)).toBe('correct')

    const incorrect = FIXTURES['question-outcome-incorrect'].session!
    const wrong = incorrect.lockedOptionIds!.find((id) => !incorrect.outcome!.correctOptionIds.includes(id))!
    expect(optionState(incorrect, wrong)).toBe('incorrect')

    const locked = FIXTURES['question-locked'].session!
    for (const id of locked.lockedOptionIds!) expect(optionState(locked, id)).toBe('selected')
    const unpicked = locked.options.find((o) => !locked.lockedOptionIds!.includes(o.id))!
    expect(optionState(locked, unpicked.id)).toBe('dim')
  })

  it('ScoreboardTable lists teams in finishing order with the host rank', () => {
    const state = FIXTURES.scoreboard
    const { container } = render(<ScoreboardTable state={state} />)
    const rows = [...container.querySelectorAll('[data-node-id]')] as HTMLElement[]
    expect(rows.map((r) => r.dataset.nodeId)).toEqual(leaderboard(state).map((t) => nodeId('scoreboard', 'row', t.id)))
    expect(rows[0]!.dataset.rank).toBe('1')
    expect(rows[0]!.dataset.leader).toBe('true')
  })

  it('LeaderboardList keys rows by position, reveals by rank, and never unmounts a row', () => {
    const state = FIXTURES['final-leaderboard-partial']
    const { container } = render(<LeaderboardList state={state} />)
    const order = leaderboard(state)
    order.forEach((team, i) => {
      const row = byNode(container, nodeId('finalLeaderboard', 'row', i + 1))!
      expect(row).toBeTruthy()
      expect(row.dataset.revealed).toBe(String(state.leaderboardRevealedRanks.includes(team.rank)))
    })
    const ids = new Set([...container.querySelectorAll('[data-node-id]')].map((r) => (r as HTMLElement).dataset.nodeId))
    expect(ids.size).toBe(order.length)
  })

  it('StageHeader carries the screen header node, the idle eyebrow and the Play clock', () => {
    const q = render(<StageHeader state={FIXTURES['question-issued']} />)
    expect(byNode(q.container, 'question.header')).toBeTruthy()
    expect(q.container.textContent).toContain(STAGE_COPY.idleEyebrow)
    expect(q.container.textContent).toContain('[ 00:12:20 ]')

    const idle = render(<StageHeader state={FIXTURES.idle} />)
    const header = idle.container.querySelector('[data-stage-header]') as HTMLElement
    expect(header.style.visibility).toBe('hidden')
    expect(header.dataset.nodeId).toBeUndefined()
  })
})
