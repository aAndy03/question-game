/**
 * The last `health` report (spec §11.J, 05_STUDIO_DESIGN.md §12.6).
 *
 * Chrome, not Play: a status summary the status-bar dot reads (`ok` →
 * success, `warn` → warning, `error` → danger, `null` → neutral before the
 * first report). The report's items are §14 notices and live in the notice
 * store, replaced wholesale on every report — this store keeps only the
 * headline, so nothing here duplicates a notice.
 *
 * Fed by `host/bridge.tsx` alone: the `health` event and the one `health_get`
 * on mount.
 */

import { create } from 'zustand'
import type { HealthReport } from '@questiongame/contract'

interface HealthState {
  readonly report: HealthReport | null
  setReport(report: HealthReport | null): void
}

export const useHealthStore = create<HealthState>((set) => ({
  report: null,
  setReport(report) {
    set({ report })
  },
}))

/** The status-bar dot's tone for a report. */
export function healthTone(report: HealthReport | null): 'neutral' | 'success' | 'warning' | 'danger' {
  if (report === null) return 'neutral'
  if (report.status === 'ok') return 'success'
  return report.status === 'warn' ? 'warning' : 'danger'
}
