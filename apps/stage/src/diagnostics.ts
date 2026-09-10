/**
 * What this webview must keep throwing away, and the door its numbers leave by.
 *
 * Stage is the same React development build as Studio when run under
 * `tauri dev`, and React's dev build calls `performance.measure()` for every
 * component whose props changed, on every commit, with a props diff in
 * `detail` (`logComponentRender`). The browser never trims that buffer, so a
 * Stage window redrawn ten times a second by the show loop grows for the life
 * of the show — and so does the Viewer, which is this same bundle inside
 * Control's iframe, with a `performance` buffer of its own that Studio's
 * sweep cannot reach. The sweep therefore runs here in every mode, host or
 * not (P11.4, 2026-09-09). What it removes is also the performance log's
 * view of which components rendered, so `perf.ts` sees the entries first.
 *
 * `postCommand` is the one IPC door for diagnostics: `client_log` and
 * `perf_report`, both in `guard::STAGE_COMMANDS`, both touching nothing.
 * The Viewer has no IPC and posts nothing.
 */

import { second, startPerfReporting } from './perf'

/** Same cadence as Studio's sweep; see the reasoning there. */
export const USER_TIMING_SWEEP_MS = 2_000

export type UserTimingBuffer = Pick<Performance, 'getEntriesByType' | 'clearMeasures' | 'clearMarks'>

/** Empty the user-timing buffer. Returns how many entries it held. */
export function sweepUserTiming(perf: UserTimingBuffer, inspect?: (entries: readonly PerformanceEntry[]) => void): number {
  const measures = perf.getEntriesByType('measure')
  const marks = perf.getEntriesByType('mark')
  const held = measures.length + marks.length
  if (held > 0) {
    inspect?.([...measures, ...marks])
    perf.clearMeasures()
    perf.clearMarks()
  }
  return held
}

export function startUserTimingSweep(
  perf: UserTimingBuffer,
  everyMs: number = USER_TIMING_SWEEP_MS,
  onSwept: (entries: readonly PerformanceEntry[]) => void = () => {},
): () => void {
  const id = setInterval(() => {
    try {
      sweepUserTiming(perf, onSwept)
    } catch {
      // A browser without the buffer is not an error.
    }
  }, everyMs)
  return () => clearInterval(id)
}

interface TauriInternals {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>
}

/** Posted on the injected IPC directly, the way Studio's diagnostics are. */
export function postCommand(name: 'client_log' | 'perf_report', args: Record<string, unknown>): void {
  const w = window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  const direct = w.__TAURI_INTERNALS__
  if (typeof direct?.invoke !== 'function') return
  void direct.invoke(name, args).catch(() => {})
}

let installed = false

/** Install once, before the first render. Safe to call again. */
export function installStageDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true
  startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, (entries) => second.swept(entries))
  startPerfReporting()
}
