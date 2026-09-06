/**
 * Writes the placeholder cue pack to `packages/design-stage/audio/<key>.wav`.
 *
 * The **file names are the contract** (05_STUDIO_DESIGN.md §12.5): Stage maps
 * a cue key to `<key>.wav` and nothing above that adapter names a file, so a
 * real pack replaces these file for file with no code change. The sounds here
 * are deliberately plain — one distinct pitch and envelope per key, so an
 * operator auditioning the cue map can tell them apart — and short, under half
 * a second, so a cue never runs into the next one.
 *
 * Synthesised here, at build time, on purpose: `feat.audio.synth` is off in v1
 * and Stage must never generate a tone at runtime (P10 exit criterion). No npm
 * dependency — a WAV header is forty-four bytes and PCM is a loop.
 *
 * Iterates `CUE_KEYS` so a key added to the contract without a file here fails
 * loudly (`Record<CueKey, …>` stops compiling) rather than silently shipping
 * mute.
 *
 * Run: npm run audio:placeholders   (idempotent — the same bytes every time)
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CUE_KEYS, type CueKey } from '../packages/contract/src/play-state'

const SAMPLE_RATE = 22_050
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'packages', 'design-stage', 'audio')

/** One tone: a frequency, a length, and an envelope over 0..1 of its span. */
interface Note {
  readonly hz: number
  readonly ms: number
  /** Amplitude 0..1 at position `t` in 0..1. Default: a short attack, linear decay. */
  readonly envelope?: (t: number) => number
  /** Waveform. `square` for the clicky, buzzy keys; `sine` otherwise. */
  readonly wave?: 'sine' | 'square' | 'triangle'
  /** Silence after the note, so two notes read as two. */
  readonly gapMs?: number
  /** Pitch at the end of the note, for a slide. Default: holds `hz`. */
  readonly slideToHz?: number
}

const decay = (t: number) => Math.min(1, t * 40) * (1 - t)
const swell = (t: number) => Math.sin(Math.PI * t)
const pluck = (t: number) => Math.min(1, t * 60) * Math.exp(-4 * t)
const flat = (t: number) => Math.min(1, t * 80) * Math.min(1, (1 - t) * 80)

/** A distinct signature per key — pitch, count and shape all differ. */
const CUES: Readonly<Record<CueKey, readonly Note[]>> = {
  // A single short click: the choice is frozen.
  lock: [{ hz: 880, ms: 80, wave: 'square', envelope: decay }],
  // Two rising notes, warm.
  correct: [
    { hz: 523.25, ms: 140, envelope: pluck, gapMs: 20 },
    { hz: 783.99, ms: 260, envelope: pluck },
  ],
  // A low slide down: nothing to celebrate.
  wrong: [{ hz: 220, ms: 400, wave: 'triangle', envelope: decay, slideToHz: 110 }],
  // A soft swell: something is about to be shown.
  overlay_start: [{ hz: 440, ms: 450, envelope: swell }],
  // A three-note fanfare at the top of the Play.
  play_start: [
    { hz: 523.25, ms: 120, envelope: flat, gapMs: 20 },
    { hz: 659.25, ms: 120, envelope: flat, gapMs: 20 },
    { hz: 783.99, ms: 200, envelope: pluck },
  ],
  // One tick.
  timer_start: [{ hz: 1320, ms: 50, wave: 'square', envelope: decay }],
  // Two low ticks.
  timer_pause: [
    { hz: 330, ms: 60, wave: 'square', envelope: decay, gapMs: 80 },
    { hz: 330, ms: 60, wave: 'square', envelope: decay },
  ],
  // A buzzer: time is up.
  timer_expired: [{ hz: 160, ms: 150, wave: 'square', envelope: flat }],
}

function sample(wave: Note['wave'], phase: number): number {
  const x = phase % 1
  switch (wave) {
    case 'square':
      return x < 0.5 ? 1 : -1
    case 'triangle':
      return 1 - 4 * Math.abs(x - 0.5)
    default:
      return Math.sin(2 * Math.PI * x)
  }
}

/** Renders the notes back to back as 16-bit PCM. */
function render(notes: readonly Note[]): Int16Array {
  const totalMs = notes.reduce((ms, n) => ms + n.ms + (n.gapMs ?? 0), 0)
  if (totalMs > 500) throw new Error(`a cue must stay under 500 ms, got ${totalMs}`)
  const pcm = new Int16Array(Math.round((totalMs / 1000) * SAMPLE_RATE))
  let offset = 0
  for (const note of notes) {
    const length = Math.round((note.ms / 1000) * SAMPLE_RATE)
    const envelope = note.envelope ?? decay
    const end = note.slideToHz ?? note.hz
    // Phase accumulates so a slide stays continuous instead of clicking.
    let phase = 0
    for (let i = 0; i < length; i++) {
      const t = i / length
      const hz = note.hz + (end - note.hz) * t
      phase += hz / SAMPLE_RATE
      pcm[offset + i] = Math.round(0.6 * envelope(t) * sample(note.wave, phase) * 32_767)
    }
    offset += length + Math.round(((note.gapMs ?? 0) / 1000) * SAMPLE_RATE)
  }
  return pcm
}

/** RIFF/WAVE, PCM 16-bit mono. */
function wav(pcm: Int16Array): Buffer {
  const data = Buffer.from(pcm.buffer, pcm.byteOffset, pcm.byteLength)
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + data.length, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // fmt chunk size
  header.writeUInt16LE(1, 20) // PCM
  header.writeUInt16LE(1, 22) // mono
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28) // byte rate
  header.writeUInt16LE(2, 32) // block align
  header.writeUInt16LE(16, 34) // bits per sample
  header.write('data', 36)
  header.writeUInt32LE(data.length, 40)
  return Buffer.concat([header, data])
}

mkdirSync(outDir, { recursive: true })
for (const key of CUE_KEYS) {
  const bytes = wav(render(CUES[key]))
  const file = `${key}.wav`
  writeFileSync(join(outDir, file), bytes)
  console.log(`wrote ${file} (${bytes.length} bytes)`)
}
console.log(`${CUE_KEYS.length} placeholder cues in packages/design-stage/audio/`)
