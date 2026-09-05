/**
 * Stage → host events. Until P6 there is no host, so this is a tiny bus the
 * dev harness and tests subscribe to; at P6 `emit` forwards to Tauri's
 * `emit` and nothing above this file changes.
 *
 * Stage emits exactly one kind of thing: `anim-complete { key }`, with an
 * `AnimKey` from the contract (spec §11.G). Nothing else leaves Stage.
 */

import type { AnimKey } from '@questiongame/contract'

export interface StageEventMap {
  'anim-complete': { readonly key: AnimKey }
}

type Listener<K extends keyof StageEventMap> = (payload: StageEventMap[K]) => void
type AnyListener = (payload: unknown) => void

const listeners = new Map<string, Set<AnyListener>>()

export const stageEvents = {
  emit<K extends keyof StageEventMap>(name: K, payload: StageEventMap[K]): void {
    for (const l of listeners.get(name) ?? []) l(payload)
    if (import.meta.env?.DEV) console.debug(`[stage] ${name}`, payload)
  },
  on<K extends keyof StageEventMap>(name: K, listener: Listener<K>): () => void {
    let set = listeners.get(name)
    if (!set) listeners.set(name, (set = new Set()))
    const l = listener as AnyListener
    set.add(l)
    return () => {
      set!.delete(l)
    }
  },
}
