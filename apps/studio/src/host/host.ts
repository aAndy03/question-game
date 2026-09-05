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
 * globals a plain browser does not have.
 */
const tauriTransport: HostTransport = {
  async invoke<T>(name: Command, args?: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core')
    return invoke<T>(name, args)
  },
  async listen<T>(name: EventName, handler: (payload: T) => void): Promise<() => void> {
    const { listen } = await import('@tauri-apps/api/event')
    return listen<T>(name, ({ payload }) => handler(payload))
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

/** Subscribe to a host event. Resolves to an unsubscribe. */
export function on<T>(name: EventName, handler: (payload: T) => void): Promise<() => void> {
  if (!transport) return Promise.resolve(() => {})
  return transport.listen<T>(name, handler)
}
