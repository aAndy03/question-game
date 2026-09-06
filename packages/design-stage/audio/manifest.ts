/**
 * The bundled cue pack: which file plays for which cue key.
 *
 * This is the whole of what the design system knows about audio. The seam's
 * interface is the **cue key** (spec §2.25, 05_STUDIO_DESIGN.md §12.5): Stage
 * asks for `lock`, the adapter looks the file up here, and nothing above the
 * adapter names a file. The file names are therefore the contract a real pack
 * has to honour — see README.md in this folder.
 *
 * Every key maps to `<key>.wav`; the `Record<CueKey, …>` type is what makes a
 * key added to the contract without a file here fail to compile.
 */
import type { CueKey } from '@questiongame/contract'

export const CUE_FILES: Readonly<Record<CueKey, string>> = {
  lock: 'lock.wav',
  correct: 'correct.wav',
  wrong: 'wrong.wav',
  overlay_start: 'overlay_start.wav',
  play_start: 'play_start.wav',
  timer_start: 'timer_start.wav',
  timer_pause: 'timer_pause.wav',
  timer_expired: 'timer_expired.wav',
}

/**
 * Where the pack is served from, in dev and in the bundle alike. Stage lives
 * under `/stage/` in both, and its Vite config publishes this folder under
 * `audio/` next to it (`apps/stage/vite.config.ts`), so an absolute path works
 * from the dev server, from Studio's proxy and from the packaged app.
 */
export const CUE_PACK_BASE = '/stage/audio/'
