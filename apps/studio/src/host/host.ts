/**
 * Studio's side of the host command seam.
 *
 * Everything above this file calls `command(name, args)` and `on(event,
 * handler)`; whether the other end is Tauri's IPC or an in-memory fake is
 * this file's business and nobody else's — which is what makes "a Viewer
 * click, an Action Panel button and a keyboard chord are three call sites of
 * one command" cheap to hold true, and what lets a page test run without
 * Rust.
 *
 * Two rules the layers above inherit from here:
 *
 * - **`play-state` is never cached.** It arrives on an event and is read from
 *   `playState.ts`; a TanStack Query key holding a Play is the drift the Play
 *   write seam exists to prevent (P7 exit criterion).
 * - **A refused command is a `HostError`, not an exception string.** The host
 *   returns `{ code, message }` (spec §14), and the notice family renders it.
 */

import type { Command, EventName } from '@questiongame/contract'

/** What a refused command looks like on the wire (`crates/app/src/error.rs`). */
export interface HostError {
  readonly code: string
  readonly message: string
}

export function isHostError(value: unknown): value is HostError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as HostError).code === 'string' &&
    typeof (value as HostError).message === 'string'
  )
}

/**
 * The two verbs, as an object so a test can supply another implementation.
 * `host/fake.ts` is the second adapter; Tauri is the first.
 */
export interface HostTransport {
  invoke<T>(name: Command, args?: Record<string, unknown>): Promise<T>
  listen<T>(name: EventName, handler: (payload: T) => void): Promise<() => void>
}

/**
 * Tauri v2 injects this before any app script runs, so its presence answers
 * "am I inside the desktop app?" without a build flag — `vite dev` serves the
 * same bundle to a plain browser.
 */
export function hasTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * `@tauri-apps/api` is imported dynamically: the module reaches for IPC
 * globals a plain browser does not have. Exported so `host.test.ts` can hold
 * the adapter itself — the label it listens as is a contract with `emit.rs`,
 * not an implementation detail.
 */
export const tauriTransport: HostTransport = {
  async invoke<T>(name: Command, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(name, args)
  },
  async listen<T>(name: EventName, handler: (payload: T) => void): Promise<() => void> {
    const [{ listen }, { getCurrentWebviewWindow }] = await Promise.all([
      import('@tauri-apps/api/event'),
      import('@tauri-apps/api/webviewWindow'),
    ])
    // **The target is not optional.** `listen()` with no options registers
    // `EventTarget::Any`, and Tauri short-circuits an `Any` listener past the
    // `emit_to` filter entirely (`tauri/src/event/listener.rs`) — so this
    // window would also receive the *stripped* `play-state` meant for `stage`,
    // whose shape has no `operator` half, and every organism reading
    // `play.operator` would throw. Listening as this label is what makes
    // `emit_to(MAIN, …)` mean what `emit.rs` says it means.
    const label = getCurrentWebviewWindow().label
    return listen<T>(name, ({ payload }) => handler(payload), {
      target: { kind: 'AnyLabel', label },
    })
  },
}

let transport: HostTransport | null = hasTauri() ? tauriTransport : null

/** Swap the transport. Tests install the fake; the app never calls this. */
export function setHostTransport(next: HostTransport | null): void {
  transport = next
}

/** True when some host — real or fake — is behind the seam. */
export function hasHost(): boolean {
  return transport !== null
}

/** Call a §13 command. Rejects with a [`HostError`] when the host refuses. */
export function command<T>(name: Command, args?: Record<string, unknown>): Promise<T> {
  if (!transport) {
    return Promise.reject({ code: 'no_host', message: `no host for ${name}` } satisfies HostError)
  }
  return transport.invoke<T>(name, args)
}

/**
 * Every live subscription's unsubscribe, so the page can hand them all back
 * before it goes away. See [`releaseOnUnload`].
 */
const live = new Set<() => void>()
let unloadHooked = false

/**
 * **A reload must unlisten first.** Tauri registers a JS listener on the Rust
 * side and drops it only on `unlisten` — it does not clear them when the
 * webview navigates — while the callback ids themselves live in `window`, which
 * a reload wipes. Every dev reload therefore left the host emitting `play-state`
 * to callbacks that no longer exist, and the 100ms show loop turned that into
 * `[TAURI] Couldn't find callback id …` ten times a second, forever.
 *
 * `pagehide` is the last event that fires for both a reload and a close, and
 * `unlisten` is a fire-and-forget IPC post, so this is the one place it can be
 * done. A missed release is only the old noise, never a broken page.
 */
function releaseOnUnload(): void {
  if (unloadHooked || typeof window === 'undefined') return
  unloadHooked = true
  window.addEventListener('pagehide', () => {
    for (const off of [...live]) off()
  })
}

/**
 * Subscribe to a host event. Resolves to an unsubscribe.
 *
 * The unsubscribe is idempotent, and releasing before the underlying listener
 * has finished registering works. What it cannot help with is a caller that
 * unmounts before this promise resolves — it has no unsubscribe to call yet —
 * so `bridge.tsx` holds a `live` flag of its own. What this function
 * guarantees is that a subscription is released exactly once, and that the
 * page never leaves one behind.
 */
export function on<T>(name: EventName, handler: (payload: T) => void): Promise<() => void> {
  if (!transport) return Promise.resolve(() => {})
  releaseOnUnload()
  let unlisten: (() => void) | null = null
  let released = false
  const release = () => {
    released = true
    live.delete(release)
    unlisten?.()
    unlisten = null
  }
  live.add(release)
  return transport.listen<T>(name, handler).then((off) => {
    // Released while the subscription was still resolving: honour it now.
    if (released) off()
    else unlisten = off
    return release
  })
}
