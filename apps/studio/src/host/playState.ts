/**
 * The Play, as Studio reads it: an external store fed by the `play-state`
 * event and nothing else.
 *
 * This is deliberately not a TanStack Query and not a Zustand store. A Query
 * would cache a Play — the drift the Play write seam exists to prevent — and a
 * Zustand store would invite a component to `set` a field of it. There is no
 * setter here except the event, and `useSyncExternalStore` means a render
 * cannot tear across a score.
 *
 * `null` means no Play is loaded (the host has nothing to emit). Organisms and
 * pages read it; atoms and molecules take props.
 *
 * # Two clocks, two subscriptions (P11.6)
 *
 * The host emits ten times a second while a timer runs, and **two scalars are
 * all that change on a bare tick**: `session.timer.remainingMs` and
 * `clock.elapsedMs`. Everything else — roster, scores, ring, screen, overlay,
 * operator — is byte-identical to the previous emission.
 *
 * Until P11.6 every emission replaced the store's object, so every
 * `usePlayState()` consumer re-rendered ten times a second. On Control that was
 * the whole mosaic: `ControlPage` re-rendered, its inline `renderTile` was a
 * new prop, and `react-mosaic` plus its dnd provider plus all six panels plus
 * every `Tooltip` under them rebuilt. The perf log measured it — 28 React
 * commits a second, ~245 components a commit, `MosaicLayout` alone at 16 ms a
 * render, and the Studio renderer pinned at 77% of a core for as long as
 * Control was open. Nothing on screen changed except two numbers.
 *
 * So the store keeps **two** references:
 *
 * ```text
 * live     every emission. `usePlayClock()` reads it — the countdown, and
 *          nothing else, because nothing else moves at 10 Hz.
 * stable   replaced only when the emission differs *outside* those two
 *          scalars. `usePlayState()` reads it, so a bare tick re-renders
 *          nothing at all.
 * ```
 *
 * The cost of deciding is one structural compare of a ~300-leaf object ten
 * times a second — microseconds against the 160 ms/s of rendering it replaces.
 *
 * **The stable snapshot's two clock fields are as old as the last real
 * change.** Read the countdown from `usePlayClock()`, never off
 * `usePlayState()`; `playState.test.ts` greps the tree to keep it that way.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { PlayStateForMain } from '@questiongame/contract'

type Listener = () => void

/** The latest emission, whatever changed. */
let live: PlayStateForMain | null = null
/** The latest emission that differed by more than the ticking clocks. */
let stable: PlayStateForMain | null = null
const listeners = new Set<Listener>()

/**
 * The fields the 100ms tick moves on its own. Blanked before comparing, so
 * "did anything actually happen" is one structural equality.
 */
function withoutClocks(state: PlayStateForMain): PlayStateForMain {
  const session = state.session
  return {
    ...state,
    clock: { ...state.clock, elapsedMs: 0 },
    ...(session
      ? { session: { ...session, ...(session.timer ? { timer: { ...session.timer, remainingMs: 0 } } : {}) } }
      : {}),
  }
}

/** Structural equality over the plain JSON the host emits. No cycles, no maps. */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((v, i) => deepEqual(v, b[i]))
  }
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) =>
      Object.hasOwn(b as object, k) && deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

/** The bridge calls this on every `play-state` event; nothing else may. */
export function receivePlayState(next: PlayStateForMain | null): void {
  live = next
  if (next === null || stable === null) {
    stable = next
  } else if (!deepEqual(withoutClocks(stable), withoutClocks(next))) {
    stable = next
  }
  // Both hooks share one listener set: a tick that moved only the clock still
  // has to wake `usePlayClock`, and `useSyncExternalStore` bails out on its own
  // when the snapshot it reads is unchanged.
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function stableSnapshot(): PlayStateForMain | null {
  return stable
}

function liveSnapshot(): PlayStateForMain | null {
  return live
}

/** Shallow equality, for a selector that builds an object or a tuple. */
export function shallow<T>(a: T, b: T): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  const ka = Object.keys(a as object)
  const kb = Object.keys(b as object)
  if (ka.length !== kb.length) return false
  return ka.every(
    (k) =>
      Object.hasOwn(b as object, k) && Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  )
}

/**
 * The Play, minus the ticking clocks: the identity changes only when something
 * an operator would notice changed.
 *
 * With a selector it narrows further — pass `shallow` when the selector builds
 * an object or a tuple, or the new literal counts as a change every time:
 *
 * ```ts
 * const open = usePlayState((s) => s !== null)
 * const { screen, busy } = usePlayState((s) => ({ screen: s?.currentScreen, busy: s?.overlay.busy }), shallow)
 * ```
 */
export function usePlayState(): PlayStateForMain | null
export function usePlayState<T>(select: (state: PlayStateForMain | null) => T, isEqual?: (a: T, b: T) => boolean): T
export function usePlayState<T>(
  select?: (state: PlayStateForMain | null) => T,
  isEqual?: (a: T, b: T) => boolean,
): T | PlayStateForMain | null {
  // Refs rather than deps: a call site passes an inline arrow, so the selector
  // is a new function every render and a `useMemo` keyed on it would rebuild
  // the memo — and a `getSnapshot` that returns a fresh value on every call is
  // the one thing `useSyncExternalStore` turns into an infinite loop.
  const selectRef = useRef(select)
  const equalRef = useRef(isEqual)
  selectRef.current = select
  equalRef.current = isEqual
  const cache = useRef<{ source: PlayStateForMain | null; value: unknown; filled: boolean }>({
    source: null,
    value: undefined,
    filled: false,
  })

  const getSnapshot = useCallback(() => {
    const source = stableSnapshot()
    const held = cache.current
    // Same store version: hand back the identical value, always.
    if (held.filled && held.source === source) return held.value as T
    const next = selectRef.current ? selectRef.current(source) : (source as unknown as T)
    if (held.filled && equalRef.current?.(held.value as T, next)) {
      cache.current = { source, value: held.value, filled: true }
      return held.value as T
    }
    cache.current = { source, value: next, filled: true }
    return next
  }, [])

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** What a bare tick moves, and the only thing that may be read at 10 Hz. */
export interface PlayClock {
  /** `session.timer.remainingMs`, or null at operator pace / with no session. */
  readonly remainingMs: number | null
  /** `clock.elapsedMs` — how long this Play has been running. */
  readonly elapsedMs: number
}

const NO_CLOCK: PlayClock = { remainingMs: null, elapsedMs: 0 }

/**
 * The countdown, subscribed on its own.
 *
 * Mount this in the smallest component that draws a number — a whole panel
 * subscribing to it re-renders ten times a second again, which is the thing
 * this file exists to stop.
 */
export function usePlayClock(): PlayClock {
  const cache = useRef<PlayClock>(NO_CLOCK)
  const getSnapshot = useCallback(() => {
    const state = liveSnapshot()
    const next: PlayClock = state
      ? { remainingMs: state.session?.timer?.remainingMs ?? null, elapsedMs: state.clock.elapsedMs }
      : NO_CLOCK
    // `useSyncExternalStore` compares with `Object.is`, so a fresh literal on
    // every call would re-render on every emission even when both numbers
    // stood still (a paused Play emits too).
    const held = cache.current
    if (held.remainingMs === next.remainingMs && held.elapsedMs === next.elapsedMs) return held
    cache.current = next
    return next
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** For code outside React (the nav guard). */
export function peekPlayState(): PlayStateForMain | null {
  return stable
}

/** A Play is open when it may still change (§5.1). */
export function isPlayOpen(state: PlayStateForMain | null): boolean {
  return state !== null && (state.status === 'playing' || state.status === 'paused')
}
