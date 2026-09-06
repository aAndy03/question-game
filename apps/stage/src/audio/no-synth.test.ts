import { describe, expect, it } from 'vitest'

/**
 * P10 exit criterion: with `feat.audio.synth` off — and it is off in v1 —
 * no generated tone is ever produced. There is no adapter to switch off, so
 * the guarantee is structural: nothing in Stage's source may reach for the
 * Web Audio synthesis API or the inactive synth package. The placeholder cues
 * are synthesised offline by `scripts/audio-placeholders.ts`, outside this
 * tree, which is the point.
 */
const FORBIDDEN = ['Audio' + 'Context', 'Oscillator' + 'Node', 'create' + 'Oscillator', '@web-kits/' + 'audio']

// Vite's glob, not `node:fs`: the Stage tsconfig has no Node types, and the
// same glob works under vitest and under a plain `vite build`.
const SOURCES = import.meta.glob('../**/*.{ts,tsx,css}', { query: '?raw', import: 'default', eager: true }) as Record<
  string,
  string
>

describe('no synth on Stage', () => {
  it('no file under apps/stage/src names a synthesis API', () => {
    const files = Object.keys(SOURCES)
    expect(files.length).toBeGreaterThan(20)
    const hits: string[] = []
    for (const [file, text] of Object.entries(SOURCES)) {
      if (file.endsWith('no-synth.test.ts')) continue
      for (const word of FORBIDDEN) if (text.includes(word)) hits.push(`${file}: ${word}`)
    }
    expect(hits).toEqual([])
  })
})
