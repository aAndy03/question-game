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
 *
 * Nothing here changes what the app does. It is off the critical path, it
 * never throws, and it stays quiet until something is wrong.
 */

import { command, hasHost } from '@/host/host'

/** Commits per second above which a page is spinning rather than rendering. */
const LOOP_COMMITS_PER_SECOND = 120
/** One report per this many ms, so a loop does not become a log loop. */
const REPORT_EVERY_MS = 10_000
/** How many distinct console messages to remember, so repeats stay quiet. */
const SEEN_LIMIT = 200

type Level = 'error' | 'warn' | 'debug'

let installed = false
const seen = new Set<string>()
let lastReport = 0

function send(level: Level, message: string, detail?: string): void {
  if (!hasHost()) return
  // The log is a courtesy; it must never be able to break the thing it watches.
  void command('client_log', { level, message: message.slice(0, 2000), detail: detail?.slice(0, 2000) ?? null }).catch(
    () => {},
  )
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

  // One line, so the log shows the webview's own boot on the host's timeline —
  // and so "nothing from Studio" can be told apart from "Studio never started".
  send('debug', 'studio ready', `heapMb=${heapMb() ?? 'n/a'} ua=${navigator.userAgent.slice(0, 80)}`)
}
