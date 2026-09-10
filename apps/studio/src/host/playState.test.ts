import { afterEach, describe, expect, it } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import type { PlayStateForMain } from '@questiongame/contract'
import { demoPlay } from './devFake'
import { deepEqual, peekPlayState, receivePlayState, shallow, usePlayClock, usePlayState } from './playState'

afterEach(() => {
  receivePlayState(null)
  cleanup()
})

const base = () => demoPlay('question-issued')

/** The same Play one tick later: only the two clocks moved. */
function ticked(play: PlayStateForMain, by = 100): PlayStateForMain {
  const session = play.session
  if (!session?.timer) throw new Error('fixture has no timer')
  return {
    ...play,
    clock: { ...play.clock, elapsedMs: play.clock.elapsedMs + by },
    session: { ...session, timer: { ...session.timer, remainingMs: session.timer.remainingMs - by } },
  }
}

describe('the stable snapshot', () => {
  it('keeps its identity when only the countdown moved', () => {
    const first = base()
    receivePlayState(first)
    expect(peekPlayState()).toBe(first)

    receivePlayState(ticked(first))
    expect(peekPlayState(), 'a bare tick is not a change').toBe(first)

    receivePlayState(ticked(first, 200))
    expect(peekPlayState()).toBe(first)
  })

  it('replaces itself the moment anything else moves', () => {
    const first = base()
    receivePlayState(first)
    const scored = { ...ticked(first), questionsIssued: first.questionsIssued + 1 }
    receivePlayState(scored)
    expect(peekPlayState()).toBe(scored)
  })

  it('follows a Play in and out of existence', () => {
    receivePlayState(null)
    expect(peekPlayState()).toBeNull()
    const play = base()
    receivePlayState(play)
    expect(peekPlayState()).toBe(play)
    receivePlayState(null)
    expect(peekPlayState()).toBeNull()
  })
})

describe('usePlayState', () => {
  it('does not re-render a whole-object reader on a bare tick', () => {
    let renders = 0
    const first = base()
    receivePlayState(first)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayState()
    })
    expect(renders).toBe(1)
    expect(result.current).toBe(first)

    act(() => receivePlayState(ticked(first)))
    act(() => receivePlayState(ticked(first, 200)))
    act(() => receivePlayState(ticked(first, 300)))
    expect(renders, 'three ticks, no render').toBe(1)

    const next = { ...first, questionsIssued: first.questionsIssued + 1 }
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

    // A real change that the selector does not care about.
    act(() => receivePlayState({ ...base(), questionsIssued: 9 }))
    expect(renders, 'the answer is still `true`').toBe(1)

    act(() => receivePlayState(null))
    expect(renders).toBe(2)
    expect(result.current).toBe(false)
  })

  it('takes an equality function for a selector that builds an object', () => {
    let renders = 0
    const first = base()
    receivePlayState(first)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayState((s) => ({ screen: s?.currentScreen, busy: s?.overlay.busy }), shallow)
    })
    const held = result.current
    expect(renders).toBe(1)

    act(() => receivePlayState({ ...first, questionsIssued: 9 }))
    expect(renders, 'a new literal that is shallow-equal is not a change').toBe(1)
    expect(result.current).toBe(held)

    act(() => receivePlayState({ ...first, currentScreen: 'scoreboard' }))
    expect(renders).toBe(2)
    expect(result.current.screen).toBe('scoreboard')
  })
})

describe('usePlayClock', () => {
  it('is the one subscription that follows the tick', () => {
    let renders = 0
    const first = base()
    receivePlayState(first)
    const { result } = renderHook(() => {
      renders += 1
      return usePlayClock()
    })
    const started = result.current.remainingMs
    expect(renders).toBe(1)

    act(() => receivePlayState(ticked(first)))
    expect(renders).toBe(2)
    expect(result.current.remainingMs).toBe((started ?? 0) - 100)

    // A paused Play emits too; both numbers standing still is not a render.
    act(() => receivePlayState(ticked(first)))
    expect(renders).toBe(2)
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

describe('deepEqual', () => {
  it('compares the plain JSON the host emits', () => {
    expect(deepEqual({ a: [1, { b: 'x' }] }, { a: [1, { b: 'x' }] })).toBe(true)
    expect(deepEqual({ a: [1, { b: 'x' }] }, { a: [1, { b: 'y' }] })).toBe(false)
    expect(deepEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false)
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false)
    expect(deepEqual(null, null)).toBe(true)
    expect(deepEqual(null, {})).toBe(false)
    // Arrays and objects are not each other, however alike their keys look.
    expect(deepEqual([], {})).toBe(false)
  })
})

/**
 * The stable snapshot's two clock fields are as old as the last real change, so
 * reading them off `usePlayState()` draws a countdown that stops and jumps.
 * There is no way to say that in the type — `PlayStateForMain` is the host's
 * shape and the panels hand it whole to `controlPhase`, `ringEntries` and
 * friends — so the rule is held by a grep, the way §12.5's no-synth rule and
 * §13's read-only rule are.
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

describe('nothing reads the countdown off the stable snapshot', () => {
  it('confines remainingMs and elapsedMs to usePlayClock', () => {
    const files = Object.keys(SOURCES)
    expect(files.length).toBeGreaterThan(50)
    const offenders: string[] = []
    for (const [file, text] of Object.entries(SOURCES)) {
      const path = file.replace(/^\.\./, '')
      if (isTest(path) || ALLOWED.some((a) => path.endsWith(a) || path.includes(a))) continue
      if (!/remainingMs|elapsedMs/.test(text)) continue
      // Naming the number is fine; getting it from anywhere but the clock is not.
      if (!text.includes('usePlayClock')) offenders.push(path)
    }
    expect(offenders).toEqual([])
  })
})
