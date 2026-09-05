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
 */

import { useSyncExternalStore } from 'react'
import type { PlayStateForMain } from '@questiongame/contract'

type Listener = () => void

let current: PlayStateForMain | null = null
const listeners = new Set<Listener>()

/** The bridge calls this on every `play-state` event; nothing else may. */
export function receivePlayState(next: PlayStateForMain | null): void {
  current = next
  for (const listener of listeners) listener()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function snapshot(): PlayStateForMain | null {
  return current
}

export function usePlayState(): PlayStateForMain | null {
  return useSyncExternalStore(subscribe, snapshot, snapshot)
}

/** For code outside React (the nav guard). */
export function peekPlayState(): PlayStateForMain | null {
  return current
}

/** A Play is open when it may still change (§5.1). */
export function isPlayOpen(state: PlayStateForMain | null): boolean {
  return state !== null && (state.status === 'playing' || state.status === 'paused')
}
