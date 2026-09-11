import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, type PlayStateForStage } from '@questiongame/contract'
import { StageRoot } from './index'
import { motionConfig, sequencer } from '@/presentation'
import { stageEvents } from '@/host/events'

// The Screens canvas: `/stage/?viewer&hold`. jsdom has no parent frame, so the
// predicate is stubbed rather than the URL.
vi.mock('@/host/host', async (original) => ({ ...(await original<typeof import('@/host/host')>()), isHoldMode: () => true }))

const sheet = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-overlay]')

/**
 * P11.16 follow-up. On the Screens canvas an overlay is drawn at rest and its
 * timeline never runs. The layer used to keep the request in local state that
 * only the timeline's completion cleared — so in hold mode the first overlay
 * the operator picked stayed on the canvas for good, painting over every
 * screen picked after it, and a second overlay with the same run id was not
 * even seen as new.
 */
describe('OverlayLayer in hold mode (the Screens canvas)', () => {
  const events: string[] = []
  let off = () => {}
  beforeEach(() => {
    motionConfig.immediate = true
    sequencer.reset()
    events.length = 0
    off = stageEvents.on('anim-complete', ({ key }) => events.push(key))
  })
  afterEach(() => {
    off()
    motionConfig.immediate = false
    sequencer.reset()
  })

  const roundAdvance: PlayStateForStage = {
    ...FIXTURES['choose-domain'],
    overlay: { busy: true, active: { kind: 'round-advance', roundIndex: 2 }, pending: null, enabled: true, runId: 1 },
  }

  it('draws the overlay on air, and nothing once the canvas goes back to a screen', () => {
    const { container, rerender } = render(<StageRoot state={roundAdvance} />)
    expect(sheet(container)?.dataset.overlay).toBe('round-advance')

    rerender(<StageRoot state={FIXTURES.scoreboard} />)
    expect(sheet(container)).toBeNull()
    expect(container.querySelector('[data-screen-layer="current"]')?.getAttribute('data-screen')).toBe('scoreboard')
  })

  it('swaps one overlay for another even when the run id does not move', () => {
    const { container, rerender } = render(<StageRoot state={roundAdvance} />)
    rerender(
      <StageRoot
        state={{ ...roundAdvance, overlay: { ...roundAdvance.overlay, active: { kind: 'outcome', verdict: 'correct' } } }}
      />,
    )
    expect(sheet(container)?.dataset.overlay).toBe('outcome')
  })

  it('plays nothing and reports nothing: the host is not listening to a canvas', () => {
    render(<StageRoot state={roundAdvance} />)
    expect(events.filter((k) => k.startsWith('overlay:'))).toEqual([])
    expect(sequencer.isBusy('overlay')).toBe(false)
  })
})
