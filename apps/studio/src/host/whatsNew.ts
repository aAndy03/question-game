/**
 * *What's new* on the first launch after an update (P12.10).
 *
 * The host says where the notes start for this library (`whats_new_get`,
 * stamping a library it just created so it is told nothing); the notes are
 * Studio copy. Asked once per process, and shown only while no game is
 * loaded — never over a show.
 */

import { useEffect, useState } from 'react'
import { useWhatsNewStore } from '@/chrome/whatsNew'
import { notesAfter } from '@/copy/whatsNew'
import { command } from './host'
import { usePlayState } from './playState'

interface WhatsNewAnswer {
  readonly since: string | null
  readonly current: string
}

/** Once per process: StrictMode and a remount must not ask twice. */
let asked = false

/** For tests: forget this session asked, and close the window. */
export function resetWhatsNew(): void {
  asked = false
  useWhatsNewStore.setState({ open: null })
}

export function useWhatsNewOnStart(): void {
  const loaded = usePlayState((s) => s !== null)
  const show = useWhatsNewStore((s) => s.show)
  const [pending, setPending] = useState<ReturnType<typeof notesAfter> | null>(null)

  useEffect(() => {
    if (asked) return
    asked = true
    void (async () => {
      try {
        const answer = await command<WhatsNewAnswer>('whats_new_get')
        if (answer.since === null) return
        const releases = notesAfter(answer.since, answer.current)
        // Nothing an operator would notice changed: remember it silently.
        if (releases.length === 0) await command('whats_new_seen')
        else setPending(releases)
      } catch {
        // A note we could not fetch is a note we do not show.
      }
    })()
  }, [])

  useEffect(() => {
    if (pending === null || loaded) return
    show({ releases: pending, markSeen: true })
    setPending(null)
  }, [pending, loaded, show])
}
