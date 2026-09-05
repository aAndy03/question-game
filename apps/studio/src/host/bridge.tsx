/**
 * `HostBridge` — the one subscriber to host events.
 *
 * Mounted once in `App`. It has no UI; it turns each event into the one thing
 * Studio does with it:
 *
 *   play-state       → `receivePlayState` (the external store)
 *   catalog-changed  → invalidate that kind's queries
 *   recipe-changed   → invalidate that recipe's queries
 *   monitors-changed → replace the monitors query data
 *   notice           → the notice store
 *   health           → (P10) the notice store, when it has a producer
 *
 * Because every invalidation lives here, no component ever refetches after a
 * write. "Renaming a team updates every surface via host events" is this file
 * plus TanStack Query, and nothing else.
 *
 * On mount it also asks for the current state once (`get_state`): the host's
 * emission is deduplicated, so a webview that mounts after the last change
 * would otherwise wait for the next one.
 */

import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type {
  CatalogChange,
  MonitorsChanged,
  Notice,
  PlayStateForMain,
  RecipeChange,
} from '@questiongame/contract'
import { useNoticeStore } from '@/chrome/notices'
import { command, hasHost, on } from './host'
import { receivePlayState } from './playState'
import { invalidateForCatalogChange, invalidateForRecipeChange, keys } from './queries'

export function HostBridge() {
  const client = useQueryClient()
  const pushNotice = useNoticeStore((s) => s.push)

  useEffect(() => {
    if (!hasHost()) return
    const offs: Array<() => void> = []
    const add = (p: Promise<() => void>) => void p.then((off) => offs.push(off))

    add(on<PlayStateForMain>('play-state', receivePlayState))
    add(on<CatalogChange>('catalog-changed', (c) => invalidateForCatalogChange(client, c.kind, c.id)))
    add(on<RecipeChange>('recipe-changed', (c) => invalidateForRecipeChange(client, c.id)))
    add(on<MonitorsChanged>('monitors-changed', (m) => client.setQueryData(keys.monitors, m.monitors)))
    add(on<Notice>('notice', pushNotice))

    void command<PlayStateForMain | null>('get_state')
      .then(receivePlayState)
      .catch(() => receivePlayState(null))

    return () => offs.forEach((off) => off())
  }, [client, pushNotice])

  return null
}
