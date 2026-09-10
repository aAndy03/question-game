import { Profiler } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { act, render } from '@testing-library/react'
import { EMPTY_PLAY_STATE, FIXTURES, animKey, type PlayStateForStage } from '@questiongame/contract'
import { App } from '@/App'
import { StageRoot } from '@/pages'
import { motionConfig } from '@/presentation'
import { stageEvents } from '@/host/events'
import { clockOf, setStageHost, type StageHost, type StateListener } from './host'

/**
 * The P6 exit criterion — *Stage renders identically fixture-fed or host-fed* —
 * plus the two rules the bridge exists to keep: Stage never invents a state,
 * and the only thing it sends back is `anim-complete`.
 */

/** A host in the test's hand: the same interface, no IPC. */
function stubHost() {
  const listeners = new Set<StateListener>()
  const clockListeners = new Set<() => void>()
  let state: PlayStateForStage = FIXTURES.idle
  // Held by identity, the way a real host holds it: `useSyncExternalStore`
  // compares snapshots with `Object.is`.
  let clock = clockOf(state)
  const acked: string[] = []
  let notified = 0
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
    clock: () => clock,
    animComplete: (key) => {
      acked.push(key)
    },
    report: () => {},
  }
  return {
    host,
    acked,
    /** How many times the *Play* was handed to the tree. */
    stateNotifications: () => notified,
    /** A `play-tick`: the clock moves, the Play does not. */
    tick(remainingMs: number | null, elapsedMs: number) {
      clock = { remainingMs, elapsedMs, running: true }
      for (const listener of clockListeners) listener()
    },
    emit(next: PlayStateForStage) {
      state = next
      clock = clockOf(next)
      notified += listeners.size
      for (const listener of listeners) listener(next)
      for (const listener of clockListeners) listener()
    },
  }
}

afterEach(() => {
  setStageHost(null)
  motionConfig.immediate = false
})

const strip = (html: string) => html.replaceAll(/data-decor-seed="\d+"/g, '')

/**
 * The canvas itself, not the window around it. `App` wraps `StageRoot` in
 * `StageFit`, whose scale is a function of *this window's* size and is
 * deliberately not part of the tree the camera sees — the P6 criterion is that
 * the 1920×1080 canvas is identical however it was fed, and it still is.
 */
const canvas = (container: HTMLElement) => {
  const frame = container.querySelector('[data-stage-frame]')
  if (!frame) throw new Error('no stage frame')
  return strip(frame.outerHTML)
}

describe('the host feed', () => {
  it('renders the same tree host-fed as fixture-fed', () => {
    motionConfig.immediate = true
    const fixture = FIXTURES['question-outcome-correct']

    const direct = render(<StageRoot state={fixture} />)
    const expected = canvas(direct.container)
    direct.unmount()

    const stub = stubHost()
    stub.emit(fixture)
    setStageHost(stub.host)
    const fed = render(<App />)

    expect(canvas(fed.container)).toBe(expected)
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

  /**
   * P11.10. The show loop runs ten times a second and two components on Stage
   * draw a clock. Before the split, merging a tick made a new
   * `PlayStateForStage`, and `LayoutProvider`, `StageFrame`, `StageRoot` and
   * the current page all rebuilt for numbers they do not show.
   */
  it('does not rebuild the tree when only the clock moved', () => {
    motionConfig.immediate = true
    const stub = stubHost()
    stub.emit(FIXTURES['question-issued'])
    setStageHost(stub.host)

    let commits = 0
    const { container } = render(
      <Profiler id="stage" onRender={() => { commits += 1 }}>
        <App />
      </Profiler>,
    )
    const settled = commits
    const clockText = () => container.querySelector('[data-stage-header]')?.textContent ?? ''
    const before = clockText()

    // Three seconds of show loop.
    for (let n = 1; n <= 30; n += 1) act(() => stub.tick(30_000 - n * 100, n * 100))

    // **The tree was never handed a new Play.** That is the mechanism: before
    // the split a tick merged into `PlayStateForStage` and every state
    // subscriber — which is the whole tree — was notified.
    const treeRebuilds = stub.stateNotifications()

    // Thirty ticks, thirty commits: Stage is not rounded, because it may
    // interpolate and its clock is the one on camera. What changed is *what*
    // commits — the two clock leaves, not `LayoutProvider`, `StageFrame`,
    // `StageRoot` and the page above them.
    expect(commits - settled).toBeLessThanOrEqual(30)
    expect(treeRebuilds, 'a tick is not a new Play').toBe(0)
    expect(clockText(), 'and the clock is actually moving').not.toBe(before)
    // The page is still the one it was, drawn from a state nobody replaced.
    expect(container.querySelector('[data-page="question"]')).toBeTruthy()
  })

})
