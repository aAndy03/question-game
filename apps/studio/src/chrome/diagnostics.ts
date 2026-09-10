/**
 * What the webview knows and the log file does not.
 *
 * A webview's console dies with the window, and a window that has stopped
 * settling cannot be inspected — the operator's only move is to kill it. So
 * the two things worth reading afterwards go to the host instead, through
 * `client_log`, and land in `questiongame.log` beside the host's own lines:
 *
 * 1. **Anything the console would have shown** — uncaught errors, rejected
 *    promises, `console.error` and `console.warn`. Deduplicated, because a
 *    render loop will emit the same warning ten thousand times.
 * 2. **A render loop itself.** React commits are counted per second through a
 *    `Profiler`; a page that commits hundreds of times a second is not
 *    rendering, it is spinning, and the watchdog says so once with the route
 *    that was on screen and the heap it had grown to.
 * 3. **What the webview weighs, every thirty seconds** — JS heap, live DOM
 *    elements, commits and user-timing entries since the last line, with the
 *    rates per minute. A leak is a rate that never comes down, and a rate is
 *    what a log can show that a screenshot of Task Manager cannot.
 *
 * One thing here *does* change what the page holds: the user-timing sweep.
 * React's development build calls `performance.measure()` for every component
 * whose props changed, on every commit, with a props diff in `detail`
 * (`logComponentRender`, the Component Performance Track). The browser keeps
 * those entries until something clears them and never trims the buffer, so a
 * Control page ticking ten times a second put 1.9 million `PerformanceMeasure`
 * objects — 2.8 GB — into the Studio process over three Plays (2026-09-09).
 * Nothing in the app reads the buffer, so it is swept on a short interval in
 * every webview. The production build never measures; the sweep costs nothing
 * there and is kept so the number is on the same line either way.
 *
 * Everything else is off the critical path, never throws, and stays quiet
 * until something is wrong.
 */

import { command, hasHost } from '@/host/host'

/** Commits per second above which a page is spinning rather than rendering. */
const LOOP_COMMITS_PER_SECOND = 120
/** One report per this many ms, so a loop does not become a log loop. */
const REPORT_EVERY_MS = 10_000
/** How many distinct console messages to remember, so repeats stay quiet. */
const SEEN_LIMIT = 200
/**
 * How often the user-timing buffer is emptied. At the worst rate measured
 * (7,700 entries a second on an open Control page) two seconds is ~15 MB of
 * transient entries; clearing is O(n) and nothing waits on it.
 */
export const USER_TIMING_SWEEP_MS = 2_000
/** How often a webview writes its memory line. Matches the host's health watch. */
export const MEMORY_LINE_EVERY_MS = 30_000

type Level = 'error' | 'warn' | 'debug'

let installed = false
const seen = new Set<string>()
let lastReport = 0

/**
 * Tauri's injected IPC, when this is the desktop app. `@tauri-apps/api/core`'s
 * `invoke` is one line over this and nothing more; naming it here lets a line
 * be posted **synchronously**.
 */
interface TauriInternals {
  invoke(cmd: string, args?: Record<string, unknown>): Promise<unknown>
}
function internals(): TauriInternals | null {
  const w = window as Window & { __TAURI_INTERNALS__?: TauriInternals }
  return typeof w.__TAURI_INTERNALS__?.invoke === 'function' ? w.__TAURI_INTERNALS__ : null
}

/**
 * **Posted now, on this stack.** The transport's `invoke` awaits a dynamic
 * `import()` before it posts, so a line sent through it leaves the webview
 * only after the current task ends — and the one task this file exists to
 * see into is the task that never ends. Through the transport, a hang lost
 * every crumb of the render it happened in and the click's own (2026-09-08:
 * `. scope` never reached the log although the state change it precedes did).
 * The injected `__TAURI_INTERNALS__.invoke` posts on the spot; the transport
 * stays the path for everything that is not this file.
 */
function send(level: Level, message: string, detail?: string): void {
  if (!hasHost()) return
  const args = { level, message: message.slice(0, 2000), detail: detail?.slice(0, 2000) ?? null }
  // The log is a courtesy; it must never be able to break the thing it watches.
  try {
    const direct = internals()
    if (direct) {
      void direct.invoke('client_log', args).catch(() => {})
      return
    }
  } catch {
    // fall through to the transport
  }
  void command('client_log', args).catch(() => {})
}

/** Once per distinct message, so a loop reports once rather than forever. */
function sendOnce(level: Level, message: string, detail?: string): void {
  const key = `${level}:${message}`
  if (seen.has(key)) return
  if (seen.size >= SEEN_LIMIT) return
  seen.add(key)
  send(level, message, detail)
}

function text(args: readonly unknown[]): string {
  return args
    .map((a) => {
      if (typeof a === 'string') return a
      if (a instanceof Error) return `${a.name}: ${a.message}`
      try {
        return JSON.stringify(a)
      } catch {
        return String(a)
      }
    })
    .join(' ')
}

/** Bytes of JS heap, when the engine offers them (Chromium does). */
function heapMb(): number | null {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number } }
  const used = perf.memory?.usedJSHeapSize
  return used === undefined ? null : Math.round(used / 1_048_576)
}

// ------------------------------------------------------------ user timing

/** The part of `Performance` the sweep needs; a test hands in Node's. */
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

/**
 * Sweep on an interval for as long as the page lives. `onSwept` receives the
 * count each time so the memory line can carry the rate. Returns a stop.
 */
export function startUserTimingSweep(
  perf: UserTimingBuffer,
  everyMs: number = USER_TIMING_SWEEP_MS,
  onSwept: (count: number) => void = () => {},
): () => void {
  const id = setInterval(() => {
    try {
      onSwept(sweepUserTiming(perf))
    } catch {
      // The buffer is a courtesy; a browser without it is not an error.
    }
  }, everyMs)
  return () => clearInterval(id)
}

// ------------------------------------------------------------ memory line

export interface MemorySample {
  readonly atMs: number
  readonly heapMb: number | null
  readonly heapTotalMb: number | null
  /** Live elements in this document. Detached ones are the heap's to count. */
  readonly domEls: number
  /** User-timing entries swept since the previous sample. */
  readonly userTimingSwept: number
  /** React commits of the routed page since the previous sample. */
  readonly commits: number
}

/**
 * One line, absolute numbers first, then the rates against the previous
 * sample. The rates are the point: a heap that is 40 MB is fine, a heap that
 * gains 10 MB a minute while nothing happens is the bug.
 */
export function formatMemoryLine(next: MemorySample, prev: MemorySample | null): string {
  const parts = [
    `heapMb=${next.heapMb ?? 'n/a'}`,
    `heapTotalMb=${next.heapTotalMb ?? 'n/a'}`,
    `domEls=${next.domEls}`,
    `userTimingSwept=${next.userTimingSwept}`,
    `commits=${next.commits}`,
  ]
  if (prev && next.atMs > prev.atMs) {
    const minutes = (next.atMs - prev.atMs) / 60_000
    const signed = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}`
    if (next.heapMb !== null && prev.heapMb !== null) {
      const delta = next.heapMb - prev.heapMb
      parts.push(`heapDeltaMb=${signed(delta)}`, `heapMbPerMin=${signed(delta / minutes)}`)
    }
    parts.push(
      `userTimingPerMin=${Math.round(next.userTimingSwept / minutes)}`,
      `commitsPerMin=${Math.round(next.commits / minutes)}`,
    )
  }
  return parts.join(' ')
}

// Running totals; each memory line reports the difference since the last one.
let userTimingSweptTotal = 0
let commitsTotal = 0
let reportedSwept = 0
let reportedCommits = 0
let lastSample: MemorySample | null = null

function reportMemory(): void {
  const perf = performance as Performance & { memory?: { totalJSHeapSize: number } }
  const total = perf.memory?.totalJSHeapSize
  const next: MemorySample = {
    atMs: Date.now(),
    heapMb: heapMb(),
    heapTotalMb: total === undefined ? null : Math.round(total / 1_048_576),
    domEls: document.getElementsByTagName('*').length,
    userTimingSwept: userTimingSweptTotal - reportedSwept,
    commits: commitsTotal - reportedCommits,
  }
  reportedSwept = userTimingSweptTotal
  reportedCommits = commitsTotal
  send('debug', 'memory', formatMemoryLine(next, lastSample))
  lastSample = next
}

/**
 * Count React commits in a rolling second. `Profiler`'s `onRender` fires once
 * per commit of the tree it wraps, which is exactly the signal: a loop commits
 * without anything having asked it to.
 */
let commits = 0
let windowStart = 0

export function onPageCommit(): void {
  const now = performance.now()
  if (now - windowStart > 1000) {
    windowStart = now
    commits = 0
  }
  commits += 1
  commitsTotal += 1
  if (commits !== LOOP_COMMITS_PER_SECOND) return
  const at = Date.now()
  if (at - lastReport < REPORT_EVERY_MS) return
  lastReport = at
  const heap = heapMb()
  send(
    'warn',
    `render loop: the page committed ${LOOP_COMMITS_PER_SECOND} times in under a second`,
    `route=${routeLabel()} heapMb=${heap ?? 'n/a'} href=${location.hash || location.search || '/'}`,
  )
}

/**
 * A breadcrumb, posted **now**, before whatever comes next.
 *
 * The watchdog above counts commits, which only works if commits happen. A
 * synchronous loop inside a render or a layout effect never finishes one, so
 * nothing is counted, no effect runs, and the file records the click and then
 * silence — which is exactly what a freeze looks like from the log. The way to
 * see into that is to say what you are *about* to do: `invoke` posts to the
 * host as it is called, so a crumb dropped before the render survives a render
 * that never returns, and the last crumb in the file names the step that hung.
 *
 * Throttled per distinct message, because these sit on hot paths.
 */
const crumbs = new Map<string, number>()
const CRUMB_EVERY_MS = 2000

export function crumb(step: string, detail?: string): void {
  const key = `${step}|${detail ?? ''}`
  const now = Date.now()
  const last = crumbs.get(key)
  if (last !== undefined && now - last < CRUMB_EVERY_MS) return
  crumbs.set(key, now)
  send('debug', `. ${step}`, detail)
}

/** Set by `App` so a report can say which page was on screen. */
let currentRoute = 'unknown'
export function setDiagnosticRoute(route: string): void {
  currentRoute = route
}
function routeLabel(): string {
  return currentRoute
}

/** Install once, as early as possible. Safe to call again. */
export function installDiagnostics(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener('error', (event) => {
    sendOnce('error', `uncaught: ${event.message}`, `${event.filename}:${event.lineno}:${event.colno}`)
  })
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    sendOnce('error', `unhandled rejection: ${reason instanceof Error ? reason.message : String(reason)}`)
  })

  for (const level of ['error', 'warn'] as const) {
    const original = console[level].bind(console)
    console[level] = (...args: unknown[]) => {
      original(...args)
      sendOnce(level, text(args))
    }
  }

  // The sweep runs whether or not there is a host: the buffer grows in a plain
  // browser too, and a `?fake` session is where a shell change gets measured.
  startUserTimingSweep(performance, USER_TIMING_SWEEP_MS, (n) => {
    userTimingSweptTotal += n
  })
  setInterval(reportMemory, MEMORY_LINE_EVERY_MS)

  // One line, so the log shows the webview's own boot on the host's timeline —
  // and so "nothing from Studio" can be told apart from "Studio never started".
  send('debug', 'studio ready', `heapMb=${heapMb() ?? 'n/a'} ua=${navigator.userAgent.slice(0, 80)}`)
}
