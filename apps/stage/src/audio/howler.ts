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

export type AudioReportCode = 'audio_missing_cue' | 'audio_failed'
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

  const once = (code: AudioReportCode, cue: CueKey, file: string, error: unknown) => {
    const id = `${code}:${cue}:${file}`
    if (reported.has(id)) return
    reported.add(id)
    report(code, { cue, file, message: String(error) })
  }

  const create = (cue: CueKey, file: string): Loaded => {
    const howl = new Howl({
      src: [base + file],
      preload: true,
      // Howler otherwise infers the codec from the extension; a pack file
      // renamed without one would be refused before it was even fetched.
      format: [file.split('.').pop() ?? 'wav'],
      onloaderror: (_id, error) => once('audio_missing_cue', cue, file, error),
      onplayerror: (_id, error) => once('audio_failed', cue, file, error),
    })
    return { file, howl }
  }

  const load = (next: CueMap) => {
    for (const [cue, file] of Object.entries(next) as [CueKey, string | null][]) {
      const current = loaded.get(cue)
      if (current?.file === file) continue
      if (current) {
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
      for (const { howl } of loaded.values()) howl.unload()
      loaded.clear()
    },
  }
}
