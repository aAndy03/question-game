import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render } from '@testing-library/react'
import { FIXTURES, type PlayStateForStage } from '@questiongame/contract'
import { App, ViewerFed } from '@/App'
import { StageRoot } from '@/pages'
import { motionConfig } from '@/presentation'
import { clockOf, setStageHost, type StageHost, type StateListener } from './host'

// The Howler adapter is the only thing in Stage that can make a sound, so
// "the Viewer is silent" is "the Viewer never constructs a Howl".
const howls = vi.hoisted(() => ({ created: 0, played: 0 }))
vi.mock('howler', () => ({
  Howl: class {
    constructor() {
      howls.created += 1
    }
    state = () => 'loaded'
    play = () => {
      howls.played += 1
    }
    unload = () => {}
  },
  Howler: { volume: () => {}, mute: () => {} },
}))

/**
 * P8 exit criterion: no operator chrome ever appears in the Stage webview.
 * The Viewer is Stage in an iframe (spec §5.7); its tree must be the
 * host-fed tree and nothing more — no button, no input, no hit target.
 */
function stubHost(initial: PlayStateForStage) {
  const listeners = new Set<StateListener>()
  const clockListeners = new Set<() => void>()
  let state = initial
  const host: StageHost = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,
    subscribeClock(listener: () => void) {
      clockListeners.add(listener)
      return () => {
        clockListeners.delete(listener)
      }
    },
    clock: () => clockOf(state),
    animComplete: () => {},
    report: () => {},
  }
  return {
    host,
    emit(next: PlayStateForStage) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

describe('Stage in viewer mode', () => {
  afterEach(() => {
    setStageHost(null)
    motionConfig.immediate = false
    howls.created = 0
    howls.played = 0
  })

  it('draws the same tree as the host-fed Stage and adds no interactive element', () => {
    motionConfig.immediate = true
    const state = FIXTURES['question-issued']
    const { host } = stubHost(state)

    const plain = render(<StageRoot state={state} />)
    const viewer = render(<ViewerFed host={host} />)

    const strip = (html: string) => html.replace(/ id="[^"]*"/g, '').replace(/react-aria\d+-_[a-z0-9_]*/g, '')
    const frame = viewer.container.querySelector('[data-viewer-frame] > div')
    expect(frame).not.toBeNull()
    expect(strip(frame!.innerHTML)).toBe(strip(plain.container.innerHTML))

    expect(viewer.container.querySelectorAll('button, input, select, textarea, [data-hit-target]')).toHaveLength(0)
  })

  it('mounts no audio: a lock in the Viewer is silent, the same lock in the Stage window is not', () => {
    motionConfig.immediate = true
    const viewer = stubHost(FIXTURES['question-issued'])
    render(<ViewerFed host={viewer.host} />)
    act(() => viewer.emit(FIXTURES['question-locked']))
    expect(howls.created).toBe(0)
    expect(howls.played).toBe(0)

    // The positive control: the host-fed tree is where the cues live (§12.5).
    const stage = stubHost(FIXTURES['question-issued'])
    setStageHost(stage.host)
    render(<App />)
    expect(howls.created).toBe(8)
    act(() => stage.emit(FIXTURES['question-locked']))
    expect(howls.played).toBe(1)
  })
})
