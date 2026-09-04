/**
 * Seeding. A Play's scatter must be reproducible — Stage and the Viewer both
 * render it, and a re-render must not reshuffle the shapes — so the seed is
 * derived from the Play itself and the generator is a tiny deterministic PRNG.
 */

import type { PlayStateForStage } from '@questiongame/contract'

/** FNV-1a, 32-bit. */
export function hashString(input: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** The things an operator would recognise as "this Play". */
export function seedFromPlay(state: Pick<PlayStateForStage, 'playId' | 'teams' | 'domains'>): number {
  const parts = [
    state.playId,
    ...state.teams.map((t) => t.name),
    ...state.domains.map((d) => d.name),
  ]
  return hashString(parts.join(''))
}

export interface Rng {
  /** [0, 1) */
  next(): number
  /** [min, max] */
  between(min: number, max: number): number
}

/** mulberry32. */
export function rng(seed: number): Rng {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  return {
    next,
    between: (min, max) => min + (max - min) * next(),
  }
}
