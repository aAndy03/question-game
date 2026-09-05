import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { animKey, screenPairs } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { STAGE_SCREENS } from '@questiongame/contract'
import { AUTHORED, SCREEN_MOTION, allTransitions, composed, hasHeader, isBespoke, motionConfig, runTransition, transitionFor } from './index'

function layers() {
  const outgoing = document.createElement('div')
  const incoming = document.createElement('div')
  const header = document.createElement('header')
  const decor = document.createElement('div')
  document.body.append(outgoing, incoming, header, decor)
  return { outgoing, incoming, header, decor }
}

describe('transition registry', () => {
  it('resolves every ordered pair of screens to a timeline factory', () => {
    const pairs = screenPairs()
    expect(pairs.length).toBe(42)
    for (const [from, to] of pairs) expect(typeof transitionFor(from, to)).toBe('function')
    expect(allTransitions().length).toBe(42)
  })

  it('every screen has an enter and an exit, and every pair composes them unless bespoke', () => {
    for (const s of STAGE_SCREENS) {
      expect(typeof SCREEN_MOTION[s].enter).toBe('function')
      expect(typeof SCREEN_MOTION[s].exit).toBe('function')
    }
    expect(transitionFor('idle', 'teamOrder')).toBe(composed)
    expect(isBespoke('idle', 'teamOrder')).toBe(false)
    expect(Object.keys(AUTHORED)).toEqual([])
  })

  it('knows which screens carry the header', () => {
    expect(hasHeader('idle')).toBe(false)
    expect(hasHeader('currentTeam')).toBe(false)
    for (const s of ['teamOrder', 'chooseDomain', 'question', 'scoreboard', 'finalLeaderboard'] as const) expect(hasHeader(s)).toBe(true)
  })
})

describe('runTransition', () => {
  const events: string[] = []
  let off = () => {}
  beforeEach(() => {
    motionConfig.immediate = true
    events.length = 0
    off = stageEvents.on('anim-complete', ({ key }) => events.push(key))
  })
  afterEach(() => {
    off()
    motionConfig.immediate = false
    document.body.innerHTML = ''
  })

  for (const [from, to] of screenPairs()) {
    it(`${from} → ${to}: builds a timeline, swaps the decor once, reports anim-complete once`, () => {
      const l = layers()
      let swaps = 0
      let completed = 0
      runTransition({ from, to, ...l, swapDecor: () => swaps++ }, () => completed++)
      expect(swaps).toBe(1)
      expect(completed).toBe(1)
      expect(events).toEqual([animKey.transition(from, to)])
    })
  }

  it('finish() on a running timeline completes it once, and never twice', () => {
    motionConfig.immediate = false
    const l = layers()
    let completed = 0
    const run = runTransition({ from: 'idle', to: 'teamOrder', ...l, swapDecor: () => {} }, () => completed++)
    expect(run.timeline.duration()).toBeGreaterThan(0)
    expect(completed).toBe(0)
    run.finish()
    run.finish()
    expect(completed).toBe(1)
    expect(events).toEqual([animKey.transition('idle', 'teamOrder')])
  })

  it('leaves the reusable layers with no animated residue, and keeps their own layout styles', () => {
    const l = layers()
    l.header.style.display = 'flex'
    l.decor.style.position = 'absolute'
    runTransition({ from: 'idle', to: 'teamOrder', ...l, swapDecor: () => {} }, () => {})
    for (const el of [l.incoming, l.header, l.decor]) {
      const style = el.getAttribute('style') ?? ''
      expect(style).not.toMatch(/opacity|transform|translate/)
    }
    expect(l.header.style.display).toBe('flex')
    expect(l.decor.style.position).toBe('absolute')
  })

  it('never clears a React-owned visibility: a hidden header stays hidden across pairs', () => {
    const l = layers()
    l.header.style.visibility = 'hidden' // React: the incoming screen has no header
    runTransition({ from: 'teamOrder', to: 'idle', ...l, swapDecor: () => {} }, () => {})
    expect(l.header.style.visibility).toBe('hidden')
    runTransition({ from: 'idle', to: 'currentTeam', ...l, swapDecor: () => {} }, () => {})
    expect(l.header.style.visibility).toBe('hidden')
  })
})
