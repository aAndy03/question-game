import { afterEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { EMPTY_PLAY_STATE, FIXTURES, animKey, type PlayStateForStage } from '@questiongame/contract'
import { App } from '@/App'
import { StageRoot } from '@/pages'
import { motionConfig } from '@/presentation'
import { stageEvents } from '@/host/events'
import { setStageHost, type StageHost, type StateListener } from './host'

/**
 * The P6 exit criterion — *Stage renders identically fixture-fed or host-fed* —
 * plus the two rules the bridge exists to keep: Stage never invents a state,
 * and the only thing it sends back is `anim-complete`.
 */

/** A host in the test's hand: the same interface, no IPC. */
function stubHost() {
  const listeners = new Set<StateListener>()
  let state: PlayStateForStage = FIXTURES.idle
  const acked: string[] = []
  const host: StageHost = {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => state,
    animComplete: (key) => {
      acked.push(key)
    },
    report: () => {},
  }
  return {
    host,
    acked,
    emit(next: PlayStateForStage) {
      state = next
      for (const listener of listeners) listener(next)
    },
  }
}

afterEach(() => {
  setStageHost(null)
  motionConfig.immediate = false
})

const strip = (html: string) => html.replaceAll(/data-decor-seed="\d+"/g, '')

describe('the host feed', () => {
  it('renders the same tree host-fed as fixture-fed', () => {
    motionConfig.immediate = true
    const fixture = FIXTURES['question-outcome-correct']

    const direct = render(<StageRoot state={fixture} />)
    const expected = strip(direct.container.innerHTML)
    direct.unmount()

    const stub = stubHost()
    stub.emit(fixture)
    setStageHost(stub.host)
    const fed = render(<App />)

    expect(strip(fed.container.innerHTML)).toBe(expected)
  })

  it('draws Idle before the host has sent anything', () => {
    const stub = stubHost()
    // A fresh host's snapshot is EMPTY_PLAY_STATE, and Idle reads nothing off
    // the Play — so an empty roster is exactly right, and Stage never has to
    // synthesise a Play to have something to draw.
    setStageHost({ ...stub.host, snapshot: () => EMPTY_PLAY_STATE })
    const { container } = render(<App />)
    expect(container.querySelector('[data-page="idle"]')).toBeTruthy()
  })

  it('follows the host when a new play-state arrives', () => {
    motionConfig.immediate = true
    const stub = stubHost()
    setStageHost(stub.host)
    const { container } = render(<App />)
    expect(container.querySelector('[data-page="idle"]')).toBeTruthy()

    act(() => stub.emit(FIXTURES.scoreboard))
    expect(container.querySelector('[data-page="scoreboard"]')).toBeTruthy()
  })

  it('reports every finished timeline to the host and nothing else', () => {
    const stub = stubHost()
    setStageHost(stub.host)
    render(<App />)

    const key = animKey.transition('idle', 'question')
    stageEvents.emit('anim-complete', { key })
    expect(stub.acked).toEqual([key])
  })

  it('shows no dev fixture strip while a host is present', () => {
    const stub = stubHost()
    setStageHost(stub.host)
    const { container } = render(<App />)
    expect(container.querySelector('[data-dev-fixtures]')).toBeNull()
  })

  it('falls back to the fixture strip when there is no host', () => {
    setStageHost(null)
    const { container } = render(<App />)
    expect(container.querySelector('[data-dev-fixtures]')).toBeTruthy()
  })
})
