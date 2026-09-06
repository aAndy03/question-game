import { useEffect } from 'react'
import { CUE_KEYS } from '@questiongame/contract'
import type { StageHost } from '@/host/host'
import { cuesFor } from './cues'
import type { AudioPort, CueMap } from './port'

const sameCues = (a: CueMap, b: CueMap) => CUE_KEYS.every((k) => a[k] === b[k])

/**
 * Wires the host store to an `AudioPort`: every emission is diffed against
 * the last one with `cuesFor`, and the port plays what the diff says. Volume,
 * mute and the cue map follow `play-state.audio` — live, mid-Play, mid-cue —
 * and are pushed only when they changed, so the 100 ms tick is free.
 *
 * Subscribes to the host directly rather than reading React state: a cue is
 * about the *transition*, and a render can coalesce two emissions into one.
 * The port is loaded on mount and disposed on unmount, so a StrictMode
 * double-mount is a rebuild, not a leak or a dead port.
 */
export function useAudio(host: StageHost, port: AudioPort): void {
  useEffect(() => {
    let prev = host.snapshot()
    port.load(prev.audio.cues)
    port.set(prev.audio.volume, prev.audio.muted)

    const unsubscribe = host.subscribe((next) => {
      const last = prev
      prev = next
      if (!sameCues(last.audio.cues, next.audio.cues)) port.load(next.audio.cues)
      if (last.audio.volume !== next.audio.volume || last.audio.muted !== next.audio.muted) {
        port.set(next.audio.volume, next.audio.muted)
      }
      for (const cue of cuesFor(last, next)) port.play(cue)
    })

    return () => {
      unsubscribe()
      port.dispose()
    }
  }, [host, port])
}
