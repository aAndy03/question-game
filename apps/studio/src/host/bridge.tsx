/**
 * `HostBridge` — the one subscriber to host events.
 *
 * Mounted once in `App`. It has no UI; it turns each event into the one thing
 * Studio does with it:
 *
 *   play-state       → `receivePlayState` (the external store)
 *   play-tick        → `receivePlayTick` — the countdown, ten times a second
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
  PlayTick,
  RecipeChange,
} from '@questiongame/contract'
import { useHealthStore } from '@/chrome/health'
import { useNoticeStore } from '@/chrome/notices'
import { useWindowsStore } from '@/chrome/windows'
import { command, hasHost, on } from './host'
import { receivePlayState, receivePlayTick } from './playState'
import { invalidateForCatalogChange, invalidateForRecipeChange, keys } from './queries'

export function HostBridge() {
  const client = useQueryClient()
  const pushNotice = useNoticeStore((s) => s.push)
  const replaceSource = useNoticeStore((s) => s.replaceSource)
  const setReport = useHealthStore((s) => s.setReport)
  const setStatsOpen = useWindowsStore((s) => s.setStatsOpen)
  const setStagePlacement = useWindowsStore((s) => s.setStagePlacement)

  useEffect(() => {
    if (!hasHost()) return
    // `listen` resolves a tick or two after it is called, and React can unmount
    // this effect before then — StrictMode's double mount does it every boot.
    // Pushing into `offs` from inside the `then` would push into an array
    // nobody reads any more, and the subscription would outlive the component:
    // a second copy of every handler, and a callback the host keeps emitting
    // to. `live` closes that window.
    let live = true
    const offs: Array<() => void> = []
    const add = (p: Promise<() => void>) =>
      void p.then((off) => {
        if (live) offs.push(off)
        else off()
      })
    const receiveHealth = (report: HealthReport) => {
      setReport(report)
      replaceSource('health', report.items)
    }

    // `null` is a value here: it is what the host emits when the recipe
    // leaves Control (`play_unload`), and Control reads it as "no Play".
    add(on<PlayStateForMain | null>('play-state', receivePlayState))
    // The show loop's own channel (P11.9): two numbers, ten times a second,
    // merged into the clock the countdown leaves subscribe to.
    add(on<PlayTick>('play-tick', receivePlayTick))
    add(on<CatalogChange>('catalog-changed', (c) => invalidateForCatalogChange(client, c.kind, c.id)))
    add(on<RecipeChange>('recipe-changed', (c) => invalidateForRecipeChange(client, c.id)))
    add(
      on<MonitorsChanged>('monitors-changed', (m) => {
        client.setQueryData(keys.monitors, m.monitors)
        // Where the windows actually are — the *place*, not the *pick*
        // (§9, P11.11). Dropped until now, which is how Settings ▸ Monitors
        // came to show a Stage on a display it had never been on.
        setStagePlacement(m.stageOn, m.stageMirrors)
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

    return () => {
      live = false
      offs.forEach((off) => off())
    }
  }, [client, pushNotice, replaceSource, setReport, setStatsOpen, setStagePlacement])

  return null
}
