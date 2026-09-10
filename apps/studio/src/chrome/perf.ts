/**
 * This webview's second, for the performance log (P11.5).
 *
 * The host writes one JSON line a second (`crates/app/src/perf`); this is the
 * `main` key on it. Everything here is *what this page did*: React commits,
 * the components that committed most (read off React's own dev-build
 * `performance.measure` entries before the sweep clears them — the same
 * entries that were the P11.4 leak now pay for their keep), long tasks and
 * long animation frames from `PerformanceObserver`, the heap, the live DOM,
 * and what was on screen — the route, the Play, the Control phase — so a
 * spike on the host's line can be read against what the operator was doing.
 *
 * `top` is the detail: the host moves it into `spike` on an abnormal second
 * and drops it otherwise, so a quiet minute is sixty short lines.
 *
 * Nothing here is on the render path. The accumulator is a few counters and
 * one small map; the post is one IPC call a second, straight on the injected
 * `invoke` like `client_log`, and it is skipped when there is no host.
 */

import { peekPlayState } from '@/host/playState'
import { controlPhase } from '@/host/session'
import { postCommand, routeLabel } from './diagnostics'

export const PERF_EVERY_MS = 1_000
/** How many components / tasks the detail keeps. */
export const TOP_N = 5

export interface LongTask {
  readonly ms: number
  /** Where it came from, when the browser says (`long-animation-frame` scripts). */
  readonly source: string
}

export interface ComponentStat {
  readonly n: number
  /** Milliseconds of `actualDuration` React attributed to it, summed. */
  readonly ms: number
}

/** What goes on the line under `main`. */
export interface WebviewSecond {
  readonly heapMb: number | null
  readonly heapTotalMb: number | null
  readonly domEls: number
  readonly commits: number
  readonly userTimingSwept: number
  readonly longTasks: number
  readonly longTaskMaxMs: number
  readonly route: string
  readonly play: { readonly playId: string; readonly status: string; readonly phase: string | null; readonly screen: string } | null
  readonly top: {
    readonly components: readonly (readonly [string, ComponentStat])[]
    readonly longTasks: readonly LongTask[]
  }
}

/**
 * One second's counters. Fed by the Profiler (`commit`), the sweep
 * (`swept`) and the observer (`longTask`); `take` hands the second over and
 * starts the next.
 */
export class SecondAccumulator {
  private commits = 0
  private sweptCount = 0
  private components = new Map<string, { n: number; ms: number }>()
  private longTasks: LongTask[] = []

  commit(): void {
    this.commits += 1
  }

  /**
   * The entries the sweep is about to clear. React's dev build names each
   * component measure `"\u200b<Name>"` with the render's duration.
   */
  swept(entries: readonly PerformanceEntry[]): void {
    this.sweptCount += entries.length
    for (const e of entries) {
      if (e.entryType !== 'measure' || !e.name.startsWith('\u200b')) continue
      const name = e.name.slice(1)
      const stat = this.components.get(name) ?? { n: 0, ms: 0 }
      stat.n += 1
      stat.ms += e.duration
      this.components.set(name, stat)
    }
  }

  longTask(ms: number, source: string): void {
    this.longTasks.push({ ms: Math.round(ms * 10) / 10, source })
  }

  take(): Pick<WebviewSecond, 'commits' | 'userTimingSwept' | 'longTasks' | 'longTaskMaxMs' | 'top'> {
    const components = [...this.components.entries()]
      .sort((a, b) => b[1].ms - a[1].ms || b[1].n - a[1].n)
      .slice(0, TOP_N)
      .map(([name, s]) => [name, { n: s.n, ms: Math.round(s.ms * 10) / 10 }] as const)
    const longTasks = [...this.longTasks].sort((a, b) => b.ms - a.ms).slice(0, TOP_N)
    const out = {
      commits: this.commits,
      userTimingSwept: this.sweptCount,
      longTasks: this.longTasks.length,
      longTaskMaxMs: Math.round((this.longTasks[0] ? Math.max(...this.longTasks.map((t) => t.ms)) : 0) * 10) / 10,
      top: { components, longTasks },
    }
    this.commits = 0
    this.sweptCount = 0
    this.components = new Map()
    this.longTasks = []
    return out
  }
}

/** The one accumulator the page feeds. */
export const second = new SecondAccumulator()

/** A `long-animation-frame` entry's first script, or the container name a `longtask` gives. */
export function sourceOf(entry: PerformanceEntry): string {
  const laf = entry as PerformanceEntry & { scripts?: { sourceURL?: string; sourceFunctionName?: string; invoker?: string }[] }
  const script = laf.scripts?.[0]
  if (script) {
    const url = (script.sourceURL ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
    return [script.sourceFunctionName || script.invoker || '', url].filter(Boolean).join(' @ ') || 'script'
  }
  const lt = entry as PerformanceEntry & { attribution?: { containerType?: string; containerName?: string }[] }
  const a = lt.attribution?.[0]
  return a ? `${a.containerType ?? ''}${a.containerName ? ':' + a.containerName : ''}` || 'task' : 'task'
}

/** Assemble the second from the accumulator and the page. */
export function takeSecond(): WebviewSecond {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
  const play = peekPlayState()
  return {
    heapMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1_048_576) : null,
    heapTotalMb: perf.memory ? Math.round(perf.memory.totalJSHeapSize / 1_048_576) : null,
    domEls: document.getElementsByTagName('*').length,
    route: routeLabel(),
    play: play ? { playId: play.playId, status: play.status, phase: controlPhase(play), screen: play.currentScreen } : null,
    ...second.take(),
  }
}

/**
 * Observe long tasks and post a second every second. Returns a stop. Installed
 * by `installDiagnostics`; safe without a host (it then only accumulates).
 */
export function startPerfReporting(everyMs: number = PERF_EVERY_MS): () => void {
  let observer: PerformanceObserver | null = null
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) second.longTask(e.duration, sourceOf(e))
      })
      // `long-animation-frame` names the script; `longtask` is the fallback
      // where it is not supported. Both is double-counting, so prefer one.
      const supported = (PerformanceObserver as unknown as { supportedEntryTypes?: readonly string[] }).supportedEntryTypes ?? []
      observer.observe({ type: supported.includes('long-animation-frame') ? 'long-animation-frame' : 'longtask', buffered: false })
    } catch {
      observer = null
    }
  }
  const id = setInterval(() => {
    try {
      postCommand('perf_report', { report: takeSecond() })
    } catch {
      // The log is a courtesy.
    }
  }, everyMs)
  return () => {
    clearInterval(id)
    observer?.disconnect()
  }
}
