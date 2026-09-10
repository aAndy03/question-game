import { createContext, useCallback, useContext, useMemo, useRef, useSyncExternalStore, type ReactNode } from 'react'
import type { PlayStateForStage } from '@questiongame/contract'
import { clockOf, EMPTY_CLOCK, type StageClock, type StageHost } from './host'

/**
 * The countdown, on its own subscription (P11.10).
 *
 * Only two things on Stage draw a clock: the header's `[ hh:mm:ss ]` and the
 * Question screen's timer panel. Everything else — `LayoutProvider`,
 * `StageFrame`, `StageRoot`, the current page, the decor field — was
 * re-rendering ten times a second along with them, because merging a tick made
 * a new `PlayStateForStage` and the tree reads it whole.
 *
 * A context rather than a hook that reaches for the host, because Stage's tree
 * is host-agnostic by design: pages take `state` as a prop, and the fixture
 * strip renders them with no host at all. The provider is what differs.
 *
 * **The provider must not rebuild its children.** `StageClockProvider` holds
 * the subscription itself and renders `children` through, so a tick re-renders
 * *it* and React then bails on a `children` element whose identity did not
 * change. Subscribing one level up instead — in `HostFed` — would make a new
 * `<StageRoot>` element on every tick and undo the whole thing.
 *
 * Not rounded, unlike Studio's `usePlayClock`: Stage may interpolate between
 * ticks, and this is the clock on camera.
 */
const StageClockContext = createContext<StageClock | null>(null)

/** The current clock. Re-renders the calling component ten times a second. */
export function useStageClock(): StageClock {
  return useContext(StageClockContext) ?? EMPTY_CLOCK
}

/**
 * The live clock, or `null` when nothing is feeding one.
 *
 * For a component that is also rendered **outside** a `StageRoot` — the header
 * and the timer panel are, in tests and on the Screens canvas — so it can fall
 * back to the clock its `state` prop is carrying rather than drawing zeroes. A
 * Stage organism is self-sufficient from a `PlayStateForStage`, and this keeps
 * it that way.
 */
export function useLiveStageClock(): StageClock | null {
  return useContext(StageClockContext)
}

/**
 * Host-fed: the clock follows `play-tick`.
 *
 * The identity is held **here** rather than trusted from the host.
 * `useSyncExternalStore` compares snapshots with `Object.is`, so a `clock()`
 * that builds a fresh object on every call is an infinite render loop — and it
 * fails as "Maximum update depth exceeded" three frames deep in React, which
 * says nothing about the host that caused it. The contract asks for a stable
 * object; this makes a host that does not honour it merely wrong, not fatal.
 */
export function StageClockProvider({ host, children }: { host: StageHost; children: ReactNode }) {
  const held = useRef<StageClock>(EMPTY_CLOCK)
  const read = useCallback(() => {
    const next = host.clock()
    const prev = held.current
    if (prev.remainingMs === next.remainingMs && prev.elapsedMs === next.elapsedMs && prev.running === next.running) {
      return prev
    }
    held.current = next
    return next
  }, [host])
  const clock = useSyncExternalStore(host.subscribeClock, read, read)
  return <StageClockContext value={clock}>{children}</StageClockContext>
}

/**
 * The clock a Play is carrying, **unless a live one is already above**.
 *
 * `StageRoot` wraps its tree in this, so the Stage tree stays what the rest of
 * it is: self-sufficient from a `PlayStateForStage` alone. Render a page or a
 * whole `StageRoot` in a test or on the Screens canvas and the clock is the
 * one in the state you handed it; mount it under a `StageClockProvider` and
 * the live one wins, because the provider is nearer.
 *
 * With no host there is no show loop, so this clock is still — which is
 * exactly what a fixture is.
 */
export function EnsureStageClock({ state, children }: { state: PlayStateForStage; children: ReactNode }) {
  const live = useContext(StageClockContext)
  const carried = useMemo(() => clockOf(state), [state])
  if (live !== null) return children
  return <StageClockContext value={carried}>{children}</StageClockContext>
}
