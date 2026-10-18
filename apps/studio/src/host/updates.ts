/**
 * "Is there a newer release?" — asked once per session (P12.9).
 *
 * The question runs in Rust (`update_check`); the webview fetches nothing.
 * Studio decides only *when* to ask: once the settings say the operator has
 * not turned it off, and not while a game is loaded — a notice in the middle
 * of a show is noise. A newer release is an `info` notice with the way to its
 * page; up to date, offline or refused, nothing is said at all.
 */

import { useEffect } from 'react'
import { useNoticeStore } from '@/chrome/notices'
import { command } from './host'
import { usePlayState } from './playState'
import { useSettings } from './queries'
import type { UpdateStatus } from './types'

/** Once per process: StrictMode and a remount must not ask twice. */
let asked = false

/** For tests: forget that this session already asked. */
export function resetUpdateCheck(): void {
  asked = false
}

export function useUpdateCheckOnStart(): void {
  const settings = useSettings()
  const loaded = usePlayState((s) => s !== null)
  const push = useNoticeStore((s) => s.push)
  const wanted = settings.data?.globals.updates.check_on_start

  useEffect(() => {
    if (asked || wanted !== true || loaded) return
    asked = true
    void (async () => {
      try {
        const status = await command<UpdateStatus>('update_check')
        if (!status.newer || status.latest === null) return
        push({
          code: 'update.available',
          severity: 'info',
          targetPath: null,
          actions: ['open_release', 'dismiss'],
          detail: { version: status.latest },
        })
      } catch {
        // Offline is normal; the host logged it.
      }
    })()
  }, [wanted, loaded, push])
}
