/**
 * `HostBridge` — the one subscriber to host events.
 *
 * Mounted once in `App`. It has no UI; it turns each event into the one thing
 * Studio does with it:
 *
 *   play-state       → `receivePlayState` (the external store)
 *   catalog-changed  → invalidate that kind's queries
 *   recipe-changed   → invalidate that recipe's queries
 *   monitors-changed → replace the monitors query data, and the windows store
 *   notice           → the notice store
 *   health           → the health store's headline, and the notice store's
 *                      `health` source replaced with the report's items
 *
 * Because every invalidation lives here, no component ever refetches after a
 * write. "Renaming a team updates every surface via host events" is this file
 * plus TanStack Query, and nothing else.
 *
 * On mount it also asks for the current state once (`get_state`) and the
 * current health report once (`health_get`): both emissions are deduplicated,
 * so a webview that mounts after the last change would otherwise wait for the
 * next one.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  CatalogChange,
  HealthReport,
  MonitorsChanged,
  Notice,
  PlayStateForMain,
  RecipeChange,
} from '@questiongame/contract'
import { useHealthStore } from '@/chrome/health'
import { useNoticeStore } from '@/chrome/notices'
import { useWindowsStore } from '@/chrome/windows'
import { command, hasHost, on } from './host'
import { receivePlayState } from './playState'
import { invalidateForCatalogChange, invalidateForRecipeChange, keys } from './queries'

export function HostBridge() {
  const client = useQueryClient()
  const pushNotice = useNoticeStore((s) => s.push)
  const replaceSource = useNoticeStore((s) => s.replaceSource)
  const setReport = useHealthStore((s) => s.setReport)
  const setStatsOpen = useWindowsStore((s) => s.setStatsOpen)

  useEffect(() => {
    if (!hasHost()) return
    const offs: Array<() => void> = []
    const add = (p: Promise<() => void>) => void p.then((off) => offs.push(off))
    const receiveHealth = (report: HealthReport) => {
      setReport(report)
      replaceSource('health', report.items)
    }

    add(on<PlayStateForMain>('play-state', receivePlayState))
    add(on<CatalogChange>('catalog-changed', (c) => invalidateForCatalogChange(client, c.kind, c.id)))
    add(on<RecipeChange>('recipe-changed', (c) => invalidateForRecipeChange(client, c.id)))
    add(
      on<MonitorsChanged>('monitors-changed', (m) => {
        client.setQueryData(keys.monitors, m.monitors)
        // Window state, not settings state: whether Statistics is on screen
        // comes from the host's window list, and only from here (§13.3).
        setStatsOpen(m.statsOpen)
      }),
    )
    add(on<Notice>('notice', pushNotice))
    add(on<HealthReport>('health', receiveHealth))

    void command<PlayStateForMain | null>('get_state')
      .then(receivePlayState)
      .catch(() => receivePlayState(null))
    void command<HealthReport>('health_get')
      .then(receiveHealth)
      .catch(() => setReport(null))

    return () => offs.forEach((off) => off())
  }, [client, pushNotice, replaceSource, setReport, setStatsOpen])

  return null
}
