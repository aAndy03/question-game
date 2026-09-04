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

  it('renders an unbuilt screen without crashing and keeps the frame', () => {
    const { container } = render(<StageRoot state={FIXTURES.scoreboard} />)
    expect(container.querySelector('[data-page="unbuilt"]')).toBeTruthy()
    expect(container.querySelector('[data-stage-frame]')).toBeTruthy()
    expect(BUILT_SCREENS).toContain('idle')
  })
})
