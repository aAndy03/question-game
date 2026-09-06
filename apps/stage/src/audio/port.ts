/**
 * The audio seam (spec §2.25, 05_STUDIO_DESIGN.md §12.5).
 *
 * Its interface is the **cue key**. A caller says `play('lock')`; which file
 * that is, and whether anything is heard at all, is the adapter's business.
 * Two adapters: `howlerAudio` for the Stage window, `silentAudio` for the
 * Viewer iframe, the fixture strip and tests. Nothing else in Stage may make
 * a sound, and no adapter synthesises one — `feat.audio.synth` is a switch
 * with nothing behind it in v1 (`no-synth.test.ts` keeps it that way).
 */
import type { CueKey } from '@questiongame/contract'

/** The cue map as it arrives in `play-state.audio.cues`: null mutes a key. */
export type CueMap = Readonly<Record<CueKey, string | null>>

export interface AudioPort {
  /** Play one cue. A muted, unmapped or still-loading cue is silently skipped. */
  play(cue: CueKey): void
  /** Live volume (0–100) and mute, from `play-state.audio`. */
  set(volume: number, muted: boolean): void
  /**
   * Take a cue map. The adapter rebuilds only what changed, by value, so the
   * 100 ms tick — which carries the same map every time — costs nothing.
   */
  load(cues: CueMap): void
  /** Release every loaded sound. `load` after this starts again. */
  dispose(): void
}
