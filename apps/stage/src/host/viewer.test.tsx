import { afterEach, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, type PlayStateForStage } from '@questiongame/contract'
import { ViewerFed } from '@/App'
import { StageRoot } from '@/pages'
import { motionConfig } from '@/presentation'
import { setStageHost, type StageHost, type StateListener } from './host'

/**
 * P8 exit criterion: no operator chrome ever appears in the Stage webview.
 * The Viewer is Stage in an iframe (spec §5.7); its tree must be the
 * host-fed tree and nothing more — no button, no input, no hit target.
 */
function stubHost(state: PlayStateForStage): StageHost {
  const listeners = new Set<StateListener>()
  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,
    animComplete: () => {},
  }
}

describe('Stage in viewer mode', () => {
  afterEach(() => {
    setStageHost(null)
    motionConfig.immediate = false
  })

  it('draws the same tree as the host-fed Stage and adds no interactive element', () => {
    motionConfig.immediate = true
    const state = FIXTURES['question-issued']
    const host = stubHost(state)

    const plain = render(<StageRoot state={state} />)
    const viewer = render(<ViewerFed host={host} />)

    const strip = (html: string) => html.replace(/ id="[^"]*"/g, '').replace(/react-aria\d+-_[a-z0-9_]*/g, '')
    const frame = viewer.container.querySelector('[data-viewer-frame] > div')
    expect(frame).not.toBeNull()
    expect(strip(frame!.innerHTML)).toBe(strip(plain.container.innerHTML))

    expect(viewer.container.querySelectorAll('button, input, select, textarea, [data-hit-target]')).toHaveLength(0)
  })
})
