/**
 * What this webview weighs, and the one thing it must keep throwing away.
 *
 * Stage is the same React development build as Studio when run under
 * `tauri dev`, and React's dev build calls `performance.measure()` for every
 * component whose props changed, on every commit, with a props diff in
 * `detail` (`logComponentRender`). The browser never trims that buffer, so a
 * Stage window redrawn ten times a second by the show loop grows for the life
 * of the show — and so does the Viewer, which is this same bundle inside
 * Control's iframe, with a `performance` buffer of its own that Studio's
 * sweep cannot reach. The sweep therefore runs here in every mode, host or
 * not; `apps/studio/src/chrome/diagnostics.ts` is the same idea for Studio
 * and records the measurement (2026-09-09).
 *
 * The memory line goes to `questiongame.log` through `client_log`, which is
 * one of the commands Stage may call (`guard::STAGE_COMMANDS`): it touches
 * nothing. The Viewer has no IPC and writes no line; its entries are counted
 * by the sweep all the same.
 */

import { hasTauriHost, isViewerMode } from '@/host/host'

/** Same cadence as Studio's sweep; see the reasoning there. */
export const USER_TIMING_SWEEP_MS = 2_000
export const MEMORY_LINE_EVERY_MS = 30_000

export type UserTimingBuffer = Pick<Performance, 'getEntriesByType' | 'clearMeasures' | 'clearMarks'>

/** Empty the user-timing buffer. Returns how many entries it held. */
export function sweepUserTiming(perf: UserTimingBuffer): number {
  const held = perf.getEntriesByType('measure').length + perf.getEntriesByType('mark').length
  if (held > 0) {
    perf.clearMeasures()
    perf.clearMarks()
  }
  return held
}

export function startUserTimingSweep(
  perf: UserTimingBuffer,
  everyMs: number = USER_TIMING_SWEEP_MS,
  onSwept: (count: number) => void = () => {},
): () => void {
  const id = setInterval(() => {
    try {
      onSwept(sweepUserTiming(perf))
    } catch {
      // A browser without the buffer is not an error.
    }
  }, everyMs)
  return () => clearInterval(id)
}

export interface MemorySample {
  readonly atMs: number
  readonly heapMb: number | null
  readonly heapTotalMb: number | null
  readonly domEls: number
  readonly userTimingSwept: number
}

export function formatMemoryLine(next: MemorySample, prev: MemorySample | null): string {
  const parts = [
    `heapMb=${next.heapMb ?? 'n/a'}`,
    `heapTotalMb=${next.heapTotalMb ?? 'n/a'}`,
    `domEls=${next.domEls}`,
    `userTimingSwept=${next.userTimingSwept}`,
  ]
  if (prev && next.atMs > prev.atMs) {
    const minutes = (next.atMs - prev.atMs) / 60_000
    const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`
    if (next.heapMb !== null && prev.heapMb !== null) {
      const delta = next.heapMb - prev.heapMb
      parts.push(`heapDeltaMb=${signed(delta)}`, `heapMbPerMin=${signed(delta / minutes)}`)
    }
    parts.push(`userTimingPerMin=${Math.round(next.userTimingSwept / minutes)}`)
  }
  return parts.join(' ')
}

interface TauriInternals {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>
}

/** Posted on the injected IPC directly, the way Studio's diagnostics are. */
function log(level: 'debug' | 'warn', message: string, detail: string): void {
  const w = window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  const direct = w.__TAURI_INTERNALS__
  if (typeof direct?.invoke !== 'function') return
  void direct.invoke('client_log', { level, message, detail }).catch(() => {})
}

let installed = false

/** Install once, before the first render. Safe to call again. */
export function installStageDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  let sweptTotal = 0
  let reportedSwept = 0
  let last: MemorySample | null = null
  startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, (n) => {
    sweptTotal += n
  })

  // Only the Stage window has a host to tell. The Viewer's numbers are part
  // of Studio's process and show up in the host's process line.
  if (!hasTauriHost() || isViewerMode()) return
  setInterval(() => {
    const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
    const next: MemorySample = {
      atMs: Date.now(),
      heapMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1_048_576) : null,
      heapTotalMb: perf.memory ? Math.round(perf.memory.totalJSHeapSize / 1_048_576) : null,
      domEls: document.getElementsByTagName('*').length,
      userTimingSwept: sweptTotal - reportedSwept,
    }
    reportedSwept = sweptTotal
    log('debug', 'memory', formatMemoryLine(next, last))
    last = next
  }, MEMORY_LINE_EVERY_MS)
}
