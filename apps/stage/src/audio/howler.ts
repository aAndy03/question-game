/**
 * The Howler adapter: one preloaded `Howl` per mapped cue, played by key.
 *
 * This is the only file in Stage that knows a cue is a file. The map arrives
 * from the host in `play-state.audio.cues` — the operator's Settings ▸ Audio
 * choices — and is resolved against `CUE_PACK_BASE`, where the Vite config
 * publishes the pack. A file that fails to load is **reported**, not shown:
 * Stage never raises a notice (spec §5.7); `stage_report` hands the fault to
 * the host, which turns it into `health.audio_missing_cue` for the operator.
 */
import type { CueKey } from '@questiongame/contract'
import { CUE_PACK_BASE } from '@questiongame/design-stage/audio/manifest'
import { Howl, Howler } from 'howler'
import type { AudioPort, CueMap } from './port'

export type AudioReportCode = 'audio_missing_cue' | 'audio_failed' | 'audio_ok'
export type AudioReport = (code: AudioReportCode, detail: Record<string, string>) => void

interface Loaded {
  readonly file: string
  readonly howl: Howl
}

export function howlerAudio(cues: CueMap, base: string = CUE_PACK_BASE, report: AudioReport = () => {}): AudioPort {
  const loaded = new Map<CueKey, Loaded>()
  // One report per file per fault: Howler retries a failing cue on every play
  // attempt, and the health report wants the fact, not a flood.
  const reported = new Set<string>()

  /**
   * **A `Howl` we retired is not allowed to report.**
   *
   * `unload()` on a `Howl` that is still preloading aborts its decode, and
   * Howler delivers that as `onloaderror` with "Decoding audio data failed" —
   * from the callback it is indistinguishable from a file that is not there.
   * Two things retire a Howl deliberately: `dispose()`, and `load()` replacing
   * a cue whose file changed.
   *
   * React's StrictMode does the first one on every Stage open. `howlerAudio`
   * starts all eight preloads during render, `useAudio`'s effect is mounted and
   * immediately unmounted, and the cleanup unloads eight Howls mid-flight —
   * eight `audio_missing_cue` reports in one millisecond, latched into the
   * health report for the life of the process, while the second mount reloaded
   * them and the audio played perfectly. That is what turned the status-bar dot
   * orange on Control Load and left the notices panel empty (P11.8).
   *
   * An epoch per cue is the test, rather than a flag cleared around the call:
   * Howler may deliver the error asynchronously, long after `unload()` returned.
   */
  const epoch = new Map<CueKey, number>()
  const retire = (cue: CueKey): number => {
    const next = (epoch.get(cue) ?? 0) + 1
    epoch.set(cue, next)
    return next
  }
  let disposed = false

  const once = (code: AudioReportCode, cue: CueKey, file: string, error: unknown) => {
    const id = `${code}:${cue}:${file}`
    if (reported.has(id)) return
    reported.add(id)
    report(code, { cue, file, message: String(error) })
  }

  const create = (cue: CueKey, file: string): Loaded => {
    const mine = retire(cue)
    /** Is this Howl still the one this cue is using, and is the port alive? */
    const current = () => !disposed && epoch.get(cue) === mine
    const howl = new Howl({
      src: [base + file],
      preload: true,
      // Howler otherwise infers the codec from the extension; a pack file
      // renamed without one would be refused before it was even fetched.
      format: [file.split('.').pop() ?? 'wav'],
      // A cue that loads after having been reported is news: it tells the host
      // to drop the finding, so a transient fault cannot latch (P11.8).
      onload: () => {
        if (!current()) return
        if (reported.delete(`audio_missing_cue:${cue}:${file}`)) report('audio_ok', { cue, file })
      },
      onloaderror: (_id, error) => {
        if (current()) once('audio_missing_cue', cue, file, error)
      },
      onplayerror: (_id, error) => {
        if (current()) once('audio_failed', cue, file, error)
      },
    })
    return { file, howl }
  }

  const load = (next: CueMap) => {
    for (const [cue, file] of Object.entries(next) as [CueKey, string | null][]) {
      const current = loaded.get(cue)
      if (current?.file === file) continue
      if (current) {
        // Retire *before* unloading: the abort's error may arrive either way.
        retire(cue)
        current.howl.unload()
        loaded.delete(cue)
      }
      if (file) loaded.set(cue, create(cue, file))
    }
  }

  load(cues)

  return {
    play(cue) {
      const entry = loaded.get(cue)
      // A cue still loading is dropped rather than queued: a late lock sound
      // over the reveal would be worse than none.
      if (!entry || entry.howl.state() !== 'loaded') return
      entry.howl.play()
    },
    set(volume, muted) {
      Howler.volume(Math.min(100, Math.max(0, volume)) / 100)
      Howler.mute(muted)
    },
    load,
    dispose() {
      // Set first: everything unloaded from here on is our doing, not a fault.
      disposed = true
      for (const { howl } of loaded.values()) howl.unload()
      loaded.clear()
    },
  }
}
