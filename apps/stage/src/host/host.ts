/**
 * Where Stage gets its truth.
 *
 * P6: `play-state` arrives from the Rust host over Tauri's event bus, and Stage
 * renders it. **Nothing above this file synthesises a state** — a visual
 * changes because the backend changed it (spec §5.7) — and the only thing Stage
 * ever sends back is `anim-complete`, as `overlay_ack_complete`, the one
 * command the host accepts from this webview.
 *
 * Outside the desktop app there is no host, and [`stageHost`] says so by
 * returning `null`. That is what keeps `npm run dev:stage` useful for screen
 * work: the P2/P3 fixture strip stays as the **fallback**, never as a mode, and
 * is unreachable the moment a real host is present.
 *
 * `@tauri-apps/api` is imported dynamically. The module reaches for IPC globals
 * that a plain browser does not have, and a static import would make the dev
 * server's first paint depend on them.
 */

import {
  CONTRACT_VERSION,
  EMPTY_PLAY_STATE,
  type AnimKey,
  type PlayStateForStage,
} from '@questiongame/contract'

export type StateListener = (state: PlayStateForStage) => void

/**
 * An external store, in React's sense: `subscribe` notifies on change and
 * `snapshot` is the current value. That shape is deliberate — Stage reads the
 * Play through `useSyncExternalStore`, so a render cannot tear halfway through
 * a score on a surface someone is filming.
 */
export interface StageHost {
  /** Notify on change. Does **not** replay: that is `snapshot`'s job. */
  subscribe(listener: StateListener): () => void
  /** The current `play-state`; `EMPTY_PLAY_STATE` until the first one lands. */
  snapshot(): PlayStateForStage
  /** Report a finished timeline (spec §11.G). */
  animComplete(key: AnimKey): void
}

/**
 * Tauri v2 injects this before any app script runs, so its presence answers
 * "am I inside the desktop app?" without a build flag — which matters, because
 * the same bundle is what `vite dev` serves to a plain browser.
 */
export function hasTauriHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

function tauriHost(): StageHost {
  const listeners = new Set<StateListener>()
  let last: PlayStateForStage = EMPTY_PLAY_STATE
  let versionWarned = false

  const call = async (command: string, args?: Record<string, unknown>) => {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke(command, args)
  }

  void (async () => {
    const { listen } = await import('@tauri-apps/api/event')
    await listen<PlayStateForStage>('play-state', ({ payload }) => {
      // A contract mismatch is a notice, not a blank screen (P1 exit
      // criterion). Stage keeps drawing what it was sent; the operator-facing
      // notice comes from the host, which `stage_ready` told the version to.
      if (payload.contractVersion !== CONTRACT_VERSION && !versionWarned) {
        versionWarned = true
        console.error(
          `[stage] play-state is contract v${payload.contractVersion}, this build is v${CONTRACT_VERSION}`,
        )
      }
      last = payload
      for (const listener of listeners) listener(payload)
    })

    // Announce the version and ask for the current state. Without this, a Stage
    // window that mounts after the host's last emission waits for the next
    // change — and on an idle Play there may not be one.
    await call('stage_ready', { contractVersion: CONTRACT_VERSION })
  })()

  return {
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    snapshot: () => last,
    animComplete(key) {
      void call('overlay_ack_complete', { key })
    },
  }
}

let current: StageHost | null | undefined

/** The host for this window, or `null` when there is none. Decided once. */
export function stageHost(): StageHost | null {
  if (current === undefined) current = hasTauriHost() ? tauriHost() : null
  return current
}

/** Test seam: install a stub host, or `null` for none. */
export function setStageHost(host: StageHost | null): void {
  current = host
}
