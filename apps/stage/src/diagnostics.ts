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
/**
 * How often the entries are actually *read*.
 *
 * Clearing the buffer is cheap; folding it is not. React's dev build can leave
 * twenty thousand measures in a single second on Control, and the fold does a
 * string test, a slice and a `Map` write for each one — 60 ms tasks in the perf
 * log, every two seconds, for a diagnostic. The count stays exact on every
 * sweep because that is the leak signal; the component table is a *ranking*,
 * and a ranking samples fine (P11.6).
 */
export const USER_TIMING_INSPECT_EVERY = 4

export function sweepUserTiming(
  perf: UserTimingBuffer,
  inspect?: (entries: readonly PerformanceEntry[]) => void,
): number {
  const measures = perf.getEntriesByType('measure')
  const marks = perf.getEntriesByType('mark')
  const held = measures.length + marks.length
  if (held > 0) {
    // Two calls, not `[...measures, ...marks]`: that spread was a second copy
    // of every entry on the busiest seconds, to save one call.
    if (inspect) {
      inspect(measures)
      inspect(marks)
    }
    perf.clearMeasures()
    perf.clearMarks()
  }
  return held
}

/** What a sweep reports: always a count, and the entries when it looked. */
export interface SweepSink {
  count: (held: number) => void
  inspect?: ((entries: readonly PerformanceEntry[]) => void) | undefined
  /** Fold one sweep in this many; 1 folds every sweep. */
  inspectEvery?: number | undefined
}

export function startUserTimingSweep(
  perf: UserTimingBuffer,
  everyMs: number = USER_TIMING_SWEEP_MS,
  sink: SweepSink = { count: () => {} },
): () => void {
  const every = Math.max(1, sink.inspectEvery ?? USER_TIMING_INSPECT_EVERY)
  let sweeps = 0
  const id = setInterval(() => {
    try {
      const look = sink.inspect && sweeps % every === 0
      sweeps += 1
      sink.count(sweepUserTiming(perf, look ? sink.inspect : undefined))
    } catch {
      // The buffer is a courtesy; a browser without it is not an error.
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
  // Dev builds only (P12.1): a release Stage runs no diagnostic at all. The
  // leak the sweep contains is React's development build, which a release
  // bundle is not, and the per-second report is a dev-build tool.
  if (!import.meta.env.DEV) return
  startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, {
    count: (held) => second.sweptCount(held),
    inspect: (entries) => second.sweptEntries(entries),
  })
  startPerfReporting()
}
