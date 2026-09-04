import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, SCREEN_SLOTS, nodeId } from '@questiongame/contract'
import { DECOR_BY_SCREEN } from '@/decor'
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

describe('Stage root', () => {
  it('renders an unbuilt screen without crashing and keeps the frame', () => {
    const { container } = render(<StageRoot state={FIXTURES.scoreboard} />)
    expect(container.querySelector('[data-page="unbuilt"]')).toBeTruthy()
    expect(container.querySelector('[data-stage-frame]')).toBeTruthy()
    expect(BUILT_SCREENS).toContain('idle')
  })
})
