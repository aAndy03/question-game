import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, SCREEN_SLOTS, leaderboard, nodeId } from '@questiongame/contract'
import { DECOR_BY_SCREEN, decorOpacity } from '@/decor'
import { STAGE_COPY } from '@/copy'
import { BUILT_SCREENS, StageRoot } from './index'

const byNode = (root: HTMLElement, id: string) => root.querySelector(`[data-node-id="${id}"]`) as HTMLElement | null

describe('Idle page', () => {
  it('renders every static idle node with its contract id', () => {
    const { container } = render(<StageRoot state={FIXTURES.idle} />)
    for (const [slot, kind] of Object.entries(SCREEN_SLOTS.idle)) {
      if (kind === 'static') expect(byNode(container, `idle.${slot}`), slot).toBeTruthy()
    }
  })

  it('reads every string but the wordmark from copy', () => {
    const { container } = render(<StageRoot state={FIXTURES.idle} />)
    expect(byNode(container, nodeId('idle', 'eyebrow'))!.textContent).toBe(STAGE_COPY.idleEyebrow)
    expect(byNode(container, nodeId('idle', 'tagline'))!.textContent).toBe(STAGE_COPY.idleTagline)
    expect(byNode(container, nodeId('idle', 'status'))!.textContent).toBe(STAGE_COPY.idleStatus)
    expect(byNode(container, nodeId('idle', 'session'))!.textContent).toContain(STAGE_COPY.sessionValue)
    expect(byNode(container, nodeId('idle', 'wordmark'))!.querySelector('svg')).toBeTruthy()
  })

  it('lays out one decor node per manifest body, seeded from the Play', () => {
    const { container } = render(<StageRoot state={FIXTURES.idle} />)
    const bodies = DECOR_BY_SCREEN.idle!.bodies
    bodies.forEach((_, i) => expect(byNode(container, nodeId('idle', 'decor', i)), `decor ${i}`).toBeTruthy())
    const field = container.querySelector('[data-decor-field]') as HTMLElement
    expect(field.dataset.decorSeed).toMatch(/^\d+$/)
  })

  it('keeps the header mounted but hidden on idle', () => {
    const { container } = render(<StageRoot state={FIXTURES.idle} />)
    const header = container.querySelector('[data-stage-header]') as HTMLElement
    expect(header).toBeTruthy()
    expect(header.style.visibility).toBe('hidden')
  })

  it('has no focusable or interactive element', () => {
    const { container } = render(<StageRoot state={FIXTURES.idle} />)
    expect(container.querySelectorAll('button, input, select, textarea, a[href], [tabindex]').length).toBe(0)
  })

})

describe('TeamOrder page', () => {
  const state = FIXTURES['team-order']

  it('renders header, title and one row per ring position with their contract ids', () => {
    const { container } = render(<StageRoot state={state} />)
    expect(byNode(container, nodeId('teamOrder', 'header'))).toBeTruthy()
    expect(byNode(container, nodeId('teamOrder', 'title'))!.textContent).toBe('PLAYING SEQUENCE //')
    state.ring.order.forEach((id, i) => {
      const row = byNode(container, nodeId('teamOrder', 'row', id))!
      expect(row).toBeTruthy()
      expect(row.textContent).toContain(String(i + 1).padStart(2, '0'))
    })
    expect(byNode(container, nodeId('teamOrder', 'row', state.ring.currentTeamId!))!.dataset.current).toBe('true')
  })

  it('shows the Play clock in the header', () => {
    const { container } = render(<StageRoot state={state} />)
    expect(container.querySelector('[data-stage-header]')!.textContent).toContain('[ 00:12:20 ]')
  })

  it('lays out the READY letters as decor', () => {
    const { container } = render(<StageRoot state={state} />)
    DECOR_BY_SCREEN.teamOrder!.bodies.forEach((_, i) => expect(byNode(container, nodeId('teamOrder', 'decor', i))).toBeTruthy())
  })
})

describe('ChooseDomain page', () => {
  const state = FIXTURES['choose-domain']

  it('titles the board with the team on token and renders every domain card', () => {
    const { container } = render(<StageRoot state={state} />)
    expect(byNode(container, nodeId('chooseDomain', 'title'))!.textContent).toBe('SELECT CATEGORY // TEAM GAMMA')
    for (const d of state.domains) {
      const card = byNode(container, nodeId('chooseDomain', 'card', d.id))!
      expect(card).toBeTruthy()
      expect(card.textContent).toContain(d.code)
      if (d.nextDifficulty !== null) expect(card.textContent).toContain(String(d.nextDifficulty))
    }
  })

  it('lays out the CHOOSE letters as decor', () => {
    const { container } = render(<StageRoot state={state} />)
    DECOR_BY_SCREEN.chooseDomain!.bodies.forEach((_, i) => expect(byNode(container, nodeId('chooseDomain', 'decor', i))).toBeTruthy())
  })
})

describe('Question page, every engine state', () => {
  const questionFixtures = (Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]).filter((n) => FIXTURES[n].currentScreen === 'question')

  it('covers the whole session lifecycle in fixtures', () => {
    expect(questionFixtures.length).toBeGreaterThanOrEqual(9)
  })

  for (const name of questionFixtures) {
    it(`${name}: every static node is present and visibility follows play-state`, () => {
      const state = FIXTURES[name]
      const session = state.session!
      const { container } = render(<StageRoot state={state} />)
      for (const [slot, kind] of Object.entries(SCREEN_SLOTS.question)) {
        if (kind === 'static') expect(byNode(container, `question.${slot}`), slot).toBeTruthy()
      }
      const stem = byNode(container, nodeId('question', 'stem'))!
      expect(stem.style.visibility === 'hidden').toBe(!session.reveals.stem)

      for (const o of session.options) {
        const card = byNode(container, nodeId('question', 'option', o.id))!
        expect(card.dataset.revealed).toBe(String(session.reveals.optionIds.includes(o.id)))
      }

      const outcomeShown = Boolean(session.outcome && session.reveals.outcome)
      const timer = byNode(container, nodeId('question', 'timer'))!
      const result = byNode(container, nodeId('question', 'result'))!
      expect(result.style.visibility === 'hidden').toBe(!outcomeShown)
      expect(timer.style.visibility === 'hidden').toBe(session.timer === null || outcomeShown)
    })
  }

  it('locked: the timer shows the value frozen at lock', () => {
    const state = FIXTURES['question-locked']
    const { container } = render(<StageRoot state={state} />)
    const timer = byNode(container, nodeId('question', 'timer'))!
    const ms = state.session!.timer!.remainingMsAtLock!
    const s = Math.floor(ms / 1000)
    expect(timer.textContent).toContain(`00:${String(s).padStart(2, '0')}`)
  })

  it('expired open: the timer reads 00:00 and turns urgent', () => {
    const { container } = render(<StageRoot state={FIXTURES['question-timer-expired-open']} />)
    const timer = byNode(container, nodeId('question', 'timer'))!
    expect(timer.textContent).toContain('00:00')
    expect(timer.dataset.urgent).toBe('true')
  })

  it('operator pace: no timer anywhere', () => {
    const { container } = render(<StageRoot state={FIXTURES['operator-pace']} />)
    expect(byNode(container, nodeId('question', 'timer'))!.style.visibility).toBe('hidden')
  })

  it('outcomes: the result names the verdict, cards take their looks, decor keeps the matching body', () => {
    const cases = [
      ['question-outcome-correct', 'correct', 'RESULT // ALL CORRECT'],
      ['question-outcome-incorrect', 'incorrect', 'RESULT // INCORRECT'],
      ['question-outcome-partial', 'partial', 'RESULT // EXTRA SELECTION'],
    ] as const
    for (const [name, verdict, label] of cases) {
      const state = FIXTURES[name]
      const { container } = render(<StageRoot state={state} />)
      const result = byNode(container, nodeId('question', 'result'))!
      expect(result.dataset.verdict, name).toBe(verdict)
      expect(result.textContent, name).toContain(label)
      expect(result.textContent, name).toContain(`+${state.session!.outcome!.pointsAwarded}`)
      for (const id of state.session!.outcome!.correctOptionIds) {
        expect(byNode(container, nodeId('question', 'option', id))!.dataset.state, name).toBe('correct')
      }
      const bodies = DECOR_BY_SCREEN.question!.bodies
      const plus = bodies.find((b) => b.role === 'correct')!
      const minus = bodies.find((b) => b.role === 'incorrect')!
      if (verdict === 'correct') {
        expect(decorOpacity(plus, state)).toBe(1)
        expect(decorOpacity(minus, state)).not.toBe(1)
      } else {
        expect(decorOpacity(minus, state)).toBe(1)
        expect(decorOpacity(plus, state)).not.toBe(1)
      }
    }
  })

  it('before the outcome both commentary bodies are at full opacity', () => {
    const state = FIXTURES['question-locked']
    for (const b of DECOR_BY_SCREEN.question!.bodies) expect(decorOpacity(b, state)).toBe(b.opacity)
  })

  it('category line names the domain and the team on token', () => {
    const { container } = render(<StageRoot state={FIXTURES['question-issued']} />)
    const line = byNode(container, nodeId('question', 'category'))!
    expect(line.textContent).toContain('DOMAIN // Science')
    expect(line.textContent).toContain('TEAM GAMMA')
  })
})

describe('Scoreboard page', () => {
  const state = FIXTURES.scoreboard

  it('lists every team in finishing order with grouped points and a LEADER pill on rank 1', () => {
    const { container } = render(<StageRoot state={state} />)
    expect(byNode(container, nodeId('scoreboard', 'title'))!.textContent).toBe('CURRENT STANDINGS //')
    const rows = [...container.querySelectorAll('[data-node-id^="scoreboard.row."]')] as HTMLElement[]
    expect(rows.map((r) => r.dataset.nodeId)).toEqual(leaderboard(state).map((t) => nodeId('scoreboard', 'row', t.id)))
    expect(rows[0]!.dataset.leader).toBe('true')
    expect(rows[0]!.textContent).toContain('LEADER')
    expect(rows[0]!.textContent).toContain('500 PTS')
    expect(rows.slice(1).every((r) => r.dataset.leader === 'false')).toBe(true)
  })

  it('lays out the scoreboard shapes as decor', () => {
    const { container } = render(<StageRoot state={state} />)
    DECOR_BY_SCREEN.scoreboard!.bodies.forEach((_, i) => expect(byNode(container, nodeId('scoreboard', 'decor', i))).toBeTruthy())
  })
})

describe('FinalLeaderboard page', () => {
  const partial = FIXTURES['final-leaderboard-partial']

  it('keys cards by finishing position, labels them by competition rank, reveals by rank', () => {
    const { container } = render(<StageRoot state={partial} />)
    const order = leaderboard(partial)
    order.forEach((team, i) => {
      const card = byNode(container, nodeId('finalLeaderboard', 'row', i + 1))!
      expect(card).toBeTruthy()
      expect(card.textContent).toContain(`PLACE_${String(team.rank).padStart(2, '0')}`)
      expect(card.dataset.revealed).toBe(String(partial.leaderboardRevealedRanks.includes(team.rank)))
    })
    // Two teams tie at rank 2: two cards read PLACE_02, and both are revealed together.
    const tied = order.filter((t) => t.rank === 2)
    expect(tied.length).toBe(2)
  })

  it('shows the champion only once rank 1 is revealed', () => {
    const hidden = render(<StageRoot state={partial} />)
    expect(byNode(hidden.container, nodeId('finalLeaderboard', 'champion'))!.style.visibility).toBe('hidden')

    const full = { ...partial, leaderboardRevealedRanks: [4, 2, 1] }
    const shown = render(<StageRoot state={full} />)
    const champion = byNode(shown.container, nodeId('finalLeaderboard', 'champion'))!
    expect(champion.style.visibility).not.toBe('hidden')
    expect(champion.textContent).toBe(leaderboard(full)[0]!.name)
    expect(byNode(shown.container, nodeId('finalLeaderboard', 'title'))!.textContent).toBe('TOURNAMENT CHAMPION //')
  })

  it('lays out the WINNER letters as decor', () => {
    const { container } = render(<StageRoot state={partial} />)
    DECOR_BY_SCREEN.finalLeaderboard!.bodies.forEach((_, i) => expect(byNode(container, nodeId('finalLeaderboard', 'decor', i))).toBeTruthy())
  })
})

describe('Stage root', () => {
  it('renders an unbuilt screen without crashing and keeps the frame', () => {
    const { container } = render(<StageRoot state={FIXTURES['current-team']} />)
    expect(container.querySelector('[data-page="unbuilt"]')).toBeTruthy()
    expect(container.querySelector('[data-stage-frame]')).toBeTruthy()
    expect(BUILT_SCREENS).toContain('idle')
  })
})
