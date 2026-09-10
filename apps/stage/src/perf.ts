/**
 * This webview's second, for the performance log (P11.5) — the `stage` key on
 * the host's line. The same idea as `apps/studio/src/chrome/perf.ts`, with
 * what Stage has instead of a route: the screen, the overlay, whether a
 * transition or an overlay timeline is running, and the decor body count.
 *
 * Components come from React's dev-build `performance.measure` entries,
 * read before the sweep clears them. Only the Stage *window* posts; the
 * Viewer is this bundle inside Studio's iframe and its process is Studio's.
 */

import { hasTauriHost, isViewerMode, stageHost } from '@/host/host'
import { sequencer } from '@/presentation'
import { postCommand } from './diagnostics'

export const PERF_EVERY_MS = 1_000
export const TOP_N = 5

export interface LongTask {
  readonly ms: number
  readonly source: string
}

export interface ComponentStat {
  readonly n: number
  readonly ms: number
}

export interface StageSecond {
  readonly heapMb: number | null
  readonly heapTotalMb: number | null
  readonly domEls: number
  readonly userTimingSwept: number
  readonly longTasks: number
  readonly longTaskMaxMs: number
  readonly screen: string
  readonly overlay: string | null
  readonly busy: { readonly transition: boolean; readonly overlay: boolean }
  readonly decorBodies: number
  readonly top: {
    readonly components: readonly (readonly [string, ComponentStat])[]
    readonly longTasks: readonly LongTask[]
  }
}

export class SecondAccumulator {
  private sweptCount = 0
  private components = new Map<string, { n: number; ms: number }>()
  private longTasks: LongTask[] = []

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

  take(): Pick<StageSecond, 'userTimingSwept' | 'longTasks' | 'longTaskMaxMs' | 'top'> {
    const components = [...this.components.entries()]
      .sort((a, b) => b[1].ms - a[1].ms || b[1].n - a[1].n)
      .slice(0, TOP_N)
      .map(([name, s]) => [name, { n: s.n, ms: Math.round(s.ms * 10) / 10 }] as const)
    const longTasks = [...this.longTasks].sort((a, b) => b.ms - a.ms).slice(0, TOP_N)
    const out = {
      userTimingSwept: this.sweptCount,
      longTasks: this.longTasks.length,
      longTaskMaxMs: Math.round((this.longTasks[0] ? Math.max(...this.longTasks.map((t) => t.ms)) : 0) * 10) / 10,
      top: { components, longTasks },
    }
    this.sweptCount = 0
    this.components = new Map()
    this.longTasks = []
    return out
  }
}

export const second = new SecondAccumulator()

export function sourceOf(entry: PerformanceEntry): string {
  const laf = entry as PerformanceEntry & { scripts?: { sourceURL?: string; sourceFunctionName?: string; invoker?: string }[] }
  const script = laf.scripts?.[0]
  if (script) {
    const url = (script.sourceURL ?? '').replace(/^https?:\/\/[^/]+/, '').replace(/\?.*$/, '')
    return [script.sourceFunctionName || script.invoker || '', url].filter(Boolean).join(' @ ') || 'script'
  }
  return 'task'
}

export function takeSecond(): StageSecond {
  const perf = performance as Performance & { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } }
  const state = stageHost()?.snapshot()
  return {
    heapMb: perf.memory ? Math.round(perf.memory.usedJSHeapSize / 1_048_576) : null,
    heapTotalMb: perf.memory ? Math.round(perf.memory.totalJSHeapSize / 1_048_576) : null,
    domEls: document.getElementsByTagName('*').length,
    screen: state?.currentScreen ?? 'idle',
    overlay: state?.overlay.active?.kind ?? null,
    busy: { transition: sequencer.isBusy('transition'), overlay: sequencer.isBusy('overlay') },
    decorBodies: document.querySelectorAll('[data-decor-field] [data-node-id]').length,
    ...second.take(),
  }
}

/** Observe long tasks and post the second every second. Stage window only. */
export function startPerfReporting(everyMs: number = PERF_EVERY_MS): () => void {
  if (!hasTauriHost() || isViewerMode()) return () => {}
  let observer: PerformanceObserver | null = null
  if (typeof PerformanceObserver === 'function') {
    try {
      observer = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) second.longTask(e.duration, sourceOf(e))
      })
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
      // A courtesy.
    }
  }, everyMs)
  return () => {
    clearInterval(id)
    observer?.disconnect()
  }
}
