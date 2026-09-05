import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { OVERLAY_KINDS, animKey, type OverlayRequest } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { OVERLAY_D, buildOverlay, motionConfig, runOverlay, sequencer } from './index'

function sheetFor(kind: OverlayRequest['kind']): HTMLElement {
  const sheet = document.createElement('div')
  sheet.setAttribute('data-overlay', kind)
  sheet.innerHTML =
    '<span data-overlay-from>A</span><span data-arrow></span><span data-overlay-label>L</span><span data-overlay-to>B</span><span data-overlay-word>W</span><span data-label-box>A</span>'
  document.body.appendChild(sheet)
  return sheet
}

const REQUESTS: Record<OverlayRequest['kind'], OverlayRequest> = {
  'token-handoff': { kind: 'token-handoff', fromTeamId: 'a', toTeamId: 'b' },
  'round-advance': { kind: 'round-advance', roundIndex: 2 },
  'multiple-answers': { kind: 'multiple-answers', optionIds: ['a', 'b', 'c'] },
  outcome: { kind: 'outcome', verdict: 'correct' },
}

describe('overlay timelines', () => {
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
    document.body.innerHTML = ''
  })

  for (const kind of OVERLAY_KINDS) {
    it(`${kind}: enters, holds, exits, and reports overlay:${kind} once`, () => {
      const sheet = sheetFor(kind)
      let completed = 0
      const tl = buildOverlay({ request: REQUESTS[kind], sheet })
      expect(tl.duration()).toBeGreaterThanOrEqual(OVERLAY_D.enterEnd[kind] + OVERLAY_D.hold[kind] + OVERLAY_D.out - 0.01)
      runOverlay({ request: REQUESTS[kind], sheet }, () => completed++)
      expect(completed).toBe(1)
      expect(events).toEqual([animKey.overlay(kind)])
    })
  }

  it('outcome: the burst leaves no particle behind', () => {
    const sheet = sheetFor('outcome')
    runOverlay({ request: { kind: 'outcome', verdict: 'incorrect' }, sheet }, () => {})
    expect(sheet.querySelectorAll('[data-overlay-particle]').length).toBe(0)
  })

  it('finish() on a running overlay completes it once', () => {
    motionConfig.immediate = false
    const sheet = sheetFor('token-handoff')
    let completed = 0
    const run = runOverlay({ request: REQUESTS['token-handoff'], sheet }, () => completed++)
    expect(completed).toBe(0)
    run.finish()
    run.finish()
    expect(completed).toBe(1)
    expect(events).toEqual(['overlay:token-handoff'])
  })
})

describe('sequencer', () => {
  beforeEach(() => sequencer.reset())

  it('holds a transition while an overlay runs, and releases it when the overlay ends', () => {
    const release = sequencer.acquire('overlay')
    let started = 0
    sequencer.whenFree('overlay', () => started++)
    expect(started).toBe(0)
    release()
    expect(started).toBe(1)
  })

  it('starts at once when the other lane is free, and can be cancelled while waiting', () => {
    let started = 0
    sequencer.whenFree('transition', () => started++)
    expect(started).toBe(1)
    const release = sequencer.acquire('transition')
    const cancel = sequencer.whenFree('transition', () => started++)
    cancel()
    release()
    expect(started).toBe(1)
  })
})
