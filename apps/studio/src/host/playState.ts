/**
 * The Play, as Studio reads it: an external store fed by the `play-state` and
 * `play-tick` events and nothing else.
 *
 * This is deliberately not a TanStack Query and not a Zustand store. A Query
 * would cache a Play — the drift the Play write seam exists to prevent — and a
 * Zustand store would invite a component to `set` a field of it. There is no
 * setter here except the events, and `useSyncExternalStore` means a render
 * cannot tear across a score.
 *
 * `null` means no Play is loaded (the host has nothing to emit). Organisms and
 * pages read it; atoms and molecules take props.
 *
 * # Two clocks, two subscriptions (P11.6, P11.9)
 *
 * `play-state` is **event-driven**: the host sends it when something an
 * operator did changed the Play. The 100 ms show loop sends `play-tick`
 * instead — two numbers. So the store keeps two things:
 *
 * ```text
 * state   the last `play-state`. `usePlayState()` reads it, so a tick
 *         re-renders nothing at all.
 * clock   the last `play-tick`. `usePlayClock()` reads it, and it is the
 *         only subscription that follows the show loop.
 * ```
 *
 * P11.6 had to *guess* which was which, because everything arrived as one
 * emission: it kept a raw object and a stable one, and structurally compared
 * every emission with the clock fields blanked. That worked — and it was the
 * client paying to undo something the host should not have sent. Splitting the
 * wire (P11.9) turned the guess into a lookup and took the deep compare with
 * it.
 *
 * Measured on Control with a Play running: 28 React commits a second down to
 * the countdown alone, ~245 components a commit down to two leaves, the Studio
 * renderer from 77% of a core to background, and ~34 MB of JSON over a
 * fifteen-minute show down to under one.
 *
 * **The state's two clock fields are as old as the last `play-state`.** Read
 * the countdown from `usePlayClock()`, never off `usePlayState()`;
 * `playState.test.ts` greps the tree to keep it that way.
 */

import { useCallback, useRef, useSyncExternalStore } from 'react'
import type { PlayStateForMain, PlayTick } from '@questiongame/contract'

type Listener = () => void

/** What a bare tick moves, and the only thing that may be read at 10 Hz. */
export interface PlayClock {
  /** `session.timer.remainingMs`, or null at operator pace / with no session. */
  readonly remainingMs: number | null
  /** `clock.elapsedMs` — how long this Play has been running. */
  readonly elapsedMs: number
}

const NO_CLOCK: PlayClock = { remainingMs: null, elapsedMs: 0 }

/** The last `play-state`. Its clock fields are as old as it is. */
let state: PlayStateForMain | null = null
/** The last `play-tick`, or the clock of the last `play-state`. */
let clock: PlayClock = NO_CLOCK
const listeners = new Set<Listener>()

const clockOf = (play: PlayStateForMain | null): PlayClock =>
  play ? { remainingMs: play.session?.timer?.remainingMs ?? null, elapsedMs: play.clock.elapsedMs } : NO_CLOCK

/** The bridge calls this on every `play-state` event; nothing else may. */
export function receivePlayState(next: PlayStateForMain | null): void {
  state = next
  // A full emission carries the clock, so it is also the newest tick.
  clock = clockOf(next)
  for (const listener of listeners) listener()
}

/**
 * The bridge calls this on every `play-tick`; nothing else may.
 *
 * A tick for a Play that is not the loaded one is dropped rather than applied:
 * an unload and a load can leave one in flight, and the next show would open
 * on the last one's clock.
 */
export function receivePlayTick(tick: PlayTick): void {
  if (state === null || state.playId !== tick.playId) return
  if (clock.remainingMs === tick.remainingMs && clock.elapsedMs === tick.elapsedMs) return
  clock = { remainingMs: tick.remainingMs, elapsedMs: tick.elapsedMs }
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function stateSnapshot(): PlayStateForMain | null {
  return state
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
 * The Play as of the last thing that actually happened to it.
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
    const source = stateSnapshot()
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

/**
 * How coarsely the countdown is published.
 *
 * The host emits every 100 ms because it is authoritative about time and Stage
 * may interpolate. **Studio does not interpolate — it prints `m:ss`** through
 * `fmt.clock`, which is `Math.ceil(ms / 1000)`. Publishing at full resolution
 * therefore re-rendered the clock ten times for every nine renders that drew
 * the identical string, and with `transition="count"` behind it that was
 * `motion.span`, `AnimatePresence` and `NumberRenderer` churning at 10 Hz —
 * the top of the Studio profile once P11.7 had cleared everything above it.
 *
 * Rounded the same way `fmt.clock` rounds, so the digits are unchanged and only
 * the renders that would have drawn nothing new are gone (P11.9).
 */
const CLOCK_STEP_MS = 1_000
const toStep = (ms: number | null): number | null => (ms === null ? null : Math.ceil(ms / CLOCK_STEP_MS) * CLOCK_STEP_MS)

/**
 * The countdown, subscribed on its own, at the resolution Studio draws it.
 *
 * Mount this in the smallest component that draws a number — a whole panel
 * subscribing to it re-renders once a second again, which is the thing this
 * file exists to stop.
 */
export function usePlayClock(): PlayClock {
  const cache = useRef<PlayClock>(NO_CLOCK)
  const getSnapshot = useCallback(() => {
    // **Both** numbers are stepped. Rounding only the countdown would leave
    // `elapsedMs` moving at 10 Hz, and a consumer reading either one re-renders
    // for both — the rounding would have bought nothing.
    const next: PlayClock = {
      remainingMs: toStep(clock.remainingMs),
      elapsedMs: Math.floor(clock.elapsedMs / CLOCK_STEP_MS) * CLOCK_STEP_MS,
    }
    // `useSyncExternalStore` compares with `Object.is`, so a fresh literal on
    // every call would re-render on every tick even when both numbers stood
    // still — which, rounded, is nine ticks in ten.
    const held = cache.current
    if (held.remainingMs === next.remainingMs && held.elapsedMs === next.elapsedMs) return held
    cache.current = next
    return next
  }, [])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

/** For code outside React (the nav guard). */
export function peekPlayState(): PlayStateForMain | null {
  return state
}

/** A Play is open when it may still change (§5.1). */
export function isPlayOpen(state: PlayStateForMain | null): boolean {
  return state !== null && (state.status === 'playing' || state.status === 'paused')
}
