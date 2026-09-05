/**
 * Stage → host events.
 *
 * Stage emits exactly one kind of thing: `anim-complete { key }`, with an
 * `AnimKey` from the contract (spec §11.G). Nothing else leaves Stage.
 *
 * P6 kept the promise this file made: `emit` now also hands the key to the
 * host, and **nothing above this file changed**. The local bus stays, because
 * the tests and the dev strip subscribe to it and because the presentation
 * layer must not care whether anyone is listening.
 */

import type { AnimKey } from '@questiongame/contract'
import { stageHost } from './host'

export interface StageEventMap {
  'anim-complete': { readonly key: AnimKey }
}

type Listener<K extends keyof StageEventMap> = (payload: StageEventMap[K]) => void
type AnyListener = (payload: unknown) => void

const listeners = new Map<string, Set<AnyListener>>()

export const stageEvents = {
  emit<K extends keyof StageEventMap>(name: K, payload: StageEventMap[K]): void {
    for (const l of listeners.get(name) ?? []) l(payload)
    // The host is what makes the handshake authoritative: an auto-mode channel
    // chains its next beat off this key, and the overlay queue advances on it.
    if (name === 'anim-complete') stageHost()?.animComplete(payload.key)
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
