import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { animKey, screenPairs } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { AUTHORED, allTransitions, isAuthored, motionConfig, runTransition, transitionFor } from './index'
import { crossfade } from './transitions'

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

  it('idle → teamOrder is authored; the rest fall back to the crossfade for now', () => {
    expect(isAuthored('idle', 'teamOrder')).toBe(true)
    expect(transitionFor('idle', 'teamOrder')).not.toBe(crossfade)
    expect(transitionFor('teamOrder', 'idle')).toBe(crossfade)
    expect(Object.keys(AUTHORED)).toEqual(['idle>teamOrder'])
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
      expect(style).not.toMatch(/opacity|visibility|transform|translate/)
    }
    expect(l.header.style.display).toBe('flex')
    expect(l.decor.style.position).toBe('absolute')
  })
})
