/**
 * Studio's side of the host command seam.
 *
 * Two functions and a type. Everything above this file calls `command(name,
 * args)` and `on(event, handler)`; whether the other end is Tauri's IPC or a
 * test harness is this file's business and nobody else's — which is what makes
 * "a Viewer click, an Action Panel button and a keyboard chord are three call
 * sites of one command" cheap to hold true.
 *
 * Two rules the layers above inherit from here:
 *
 * - **`play-state` is never cached.** It arrives on an event and is read from
 *   the store below; a TanStack Query key holding a Play is the drift the Play
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
 * Tauri v2 injects this before any app script runs, so its presence answers
 * "am I inside the desktop app?" without a build flag — `vite dev` serves the
 * same bundle to a plain browser.
 */
export function hasHost(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

/**
 * Call a §13 command. Rejects with a [`HostError`] when the host refuses.
 *
 * `@tauri-apps/api` is imported dynamically: the module reaches for IPC globals
 * a plain browser does not have.
 */
export async function command<T>(
  name: Command,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!hasHost()) throw { code: 'no_host', message: `no host for ${name}` } satisfies HostError
  const { invoke } = await import('@tauri-apps/api/core')
  return invoke<T>(name, args)
}

/** Subscribe to a host event. Resolves to an unsubscribe. */
export async function on<T>(
  name: EventName,
  handler: (payload: T) => void,
): Promise<() => void> {
  if (!hasHost()) return () => {}
  const { listen } = await import('@tauri-apps/api/event')
  return listen<T>(name, ({ payload }) => handler(payload))
}
