import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PlayStateForMain, PlayTick } from '@questiongame/contract'
import { demoPlay } from './devFake'
import { peekPlayState, receivePlayState, receivePlayTick, shallow, usePlayClock, usePlayState } from './playState'

afterEach(() => {
  receivePlayState(null)
  cleanup()
})

const base = () => demoPlay('question-issued')

/** What the show loop sends: the clock, and the Play it belongs to. */
function tickOf(play: PlayStateForMain, afterMs: number): PlayTick {
  const timer = play.session?.timer
  if (!timer) throw new Error('fixture has no timer')
  return {
    playId: play.playId,
    remainingMs: timer.remainingMs - afterMs,
    elapsedMs: play.clock.elapsedMs + afterMs,
    running: true,
  }
}

describe('the store', () => {
  it('keeps the Play still while the clock moves', () => {
    const play = base()
    receivePlayState(play)
    expect(peekPlayState()).toBe(play)

    receivePlayTick(tickOf(play, 100))
    receivePlayTick(tickOf(play, 200))
    expect(peekPlayState(), 'a tick is not a change to the Play').toBe(play)
  })

  it('drops a tick for a Play that is not the loaded one', () => {
    const play = base()
    receivePlayState(play)
    const { result } = renderHook(() => usePlayClock())
    const before = result.current

    act(() => receivePlayTick({ ...tickOf(play, 5_000), playId: 'play-from-the-last-show' }))
    expect(result.current, 'the next show does not open on the last one’s clock').toBe(before)
  })

  it('drops a tick when no Play is loaded', () => {
    receivePlayState(null)
    const { result } = renderHook(() => usePlayClock())
    act(() => receivePlayTick(tickOf(base(), 100)))
    expect(result.current).toEqual({ remainingMs: null, elapsedMs: 0 })
  })
})

describe('usePlayState', () => {
  it('does not re-render a whole-object reader on a tick', () => {
    let renders = 0
    const play = base()
    receivePlayState(play)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayState()
    })
    expect(renders).toBe(1)
    expect(result.current).toBe(play)

    for (const ms of [100, 200, 300, 400, 500]) act(() => receivePlayTick(tickOf(play, ms)))
    expect(renders, 'five ticks, no render').toBe(1)

    const next = { ...play, questionsIssued: play.questionsIssued + 1 }
    act(() => receivePlayState(next))
    expect(renders).toBe(2)
    expect(result.current).toBe(next)
  })

  it('narrows further with a selector — the ControlPage case', () => {
    let renders = 0
    receivePlayState(base())
    const { result } = renderHook(() => {
      renders += 1
      return usePlayState((s) => s !== null)
    })
    expect(result.current).toBe(true)
    expect(renders).toBe(1)

    act(() => receivePlayState({ ...base(), questionsIssued: 9 }))
    expect(renders, 'the answer is still `true`').toBe(1)

    act(() => receivePlayState(null))
    expect(renders).toBe(2)
    expect(result.current).toBe(false)
  })

  it('takes an equality function for a selector that builds an object', () => {
    let renders = 0
    const play = base()
    receivePlayState(play)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayState((s) => ({ screen: s?.currentScreen, busy: s?.overlay.busy }), shallow)
    })
    const held = result.current
    expect(renders).toBe(1)

    act(() => receivePlayState({ ...play, questionsIssued: 9 }))
    expect(renders, 'a new literal that is shallow-equal is not a change').toBe(1)
    expect(result.current).toBe(held)

    act(() => receivePlayState({ ...play, currentScreen: 'scoreboard' }))
    expect(renders).toBe(2)
    expect(result.current.screen).toBe('scoreboard')
  })
})

describe('usePlayClock', () => {
  it('renders once a second, not ten times — Studio draws m:ss', () => {
    let renders = 0
    const play = base()
    receivePlayState(play)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayClock()
    })
    const started = result.current.remainingMs
    expect(renders).toBe(1)

    // Nine ticks inside the same second draw the same digits.
    for (const ms of [100, 200, 300, 400, 500, 600, 700, 800, 900]) {
      act(() => receivePlayTick(tickOf(play, ms)))
    }
    expect(renders, 'the string did not change, so neither did the render').toBe(1)
    expect(result.current.remainingMs).toBe(started)

    // The tenth crosses the boundary.
    act(() => receivePlayTick(tickOf(play, 1_000)))
    expect(renders).toBe(2)
    expect(result.current.remainingMs).toBe((started ?? 0) - 1_000)
  })

  it('rounds the way fmt.clock rounds, so the digits are unchanged', () => {
    const play = base()
    receivePlayState(play)
    const { result } = renderHook(() => usePlayClock())
    for (const raw of [12_001, 12_000, 11_999, 1, 0]) {
      act(() => receivePlayTick({ ...tickOf(play, 0), remainingMs: raw }))
      expect(Math.ceil((result.current.remainingMs ?? 0) / 1000), `${raw}ms`).toBe(Math.ceil(raw / 1000))
    }
  })

  it('answers with no Play and at operator pace', () => {
    receivePlayState(null)
    const { result } = renderHook(() => usePlayClock())
    expect(result.current).toEqual({ remainingMs: null, elapsedMs: 0 })

    const play = base()
    act(() => receivePlayState({ ...play, session: play.session ? { ...play.session, timer: null } : null }))
    expect(result.current.remainingMs).toBeNull()
  })
})

/**
 * The state's two clock fields are as old as the last `play-state`, so reading
 * them off `usePlayState()` draws a countdown that stops and jumps. There is no
 * way to say that in the type — `PlayStateForMain` is the host's shape and the
 * panels hand it whole to `controlPhase`, `ringEntries` and friends — so the
 * rule is held by a grep, the way §12.5's no-synth rule and §13's read-only
 * rule are.
 *
 * Vite's glob rather than `node:fs`: the Studio tsconfig has no Node types.
 */
const SOURCES = import.meta.glob('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

/** Files that may name a ticking field without asking the clock for it. */
const ALLOWED = [
  'playState.ts', // the store itself
  'previewPlay.ts', // a still Play for the Screens canvas
  // Atoms and molecules cannot read play-state at all (the atomic layer rule,
  // enforced by eslint), so a clock field there is always a prop.
  '/atoms/',
  '/molecules/',
]

/** Tests build ticked Plays on purpose; the rule is about what ships. */
const isTest = (path: string) => /\.test\.tsx?$/.test(path)

/**
 * The rule is about the **live** Play: a component that subscribes to
 * `play-state` for a number that moves ten times a second re-renders ten times
 * a second, which is what the P11.7 split exists to stop.
 *
 * A file that never touches the store cannot do that. P11.12's award ledger
 * names `remainingMsAtLock` all over — the clock as it stood when a turn was
 * *resolved*, read out of `stats_query`, refreshed on the event count and as
 * still as any other historical fact. Exempting by "does not read the store"
 * keeps the rule pointed at the thing it is protecting instead of at the word.
 */
const readsThePlay = (text: string) => /usePlayState|playState|PlayStateFor/.test(text)

describe('nothing reads the countdown off the Play', () => {
  it('confines remainingMs and elapsedMs to usePlayClock', () => {
    const files = Object.keys(SOURCES)
    expect(files.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const [file, text] of Object.entries(SOURCES)) {
      const path = file.replace(/^\.\./, '')
      if (isTest(path) || ALLOWED.some((a) => path.endsWith(a) || path.includes(a))) continue
      if (!/remainingMs|elapsedMs/.test(text)) continue
      if (!readsThePlay(text)) continue
      // Naming the number is fine; getting it from anywhere but the clock is not.
      if (!text.includes('usePlayClock')) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })
})
