/**
 * Mood: what play-state says about the bodies that carry a role.
 *
 * A body with `role: 'correct'` is commentary on a right answer, one with
 * `role: 'incorrect'` on a wrong one. Once an outcome is revealed only the
 * matching body stays at full opacity; the other fades to texture. Nothing
 * else changes — the world keeps running, positions are untouched.
 */

import type { PlayStateForStage } from '@questiongame/contract'
import type { DecorBodySpec } from './types'

/** Opacity per role once an outcome shows. Absent role → the spec's own. */
export type DecorMood = Partial<Record<NonNullable<DecorBodySpec['role']>, number | string>>

const TEXTURE = 'var(--decor-opacity-texture-min)'

export function decorMood(state: PlayStateForStage): DecorMood {
  const session = state.session
  if (!session?.outcome || !session.reveals.outcome) return {}
  // Partial credit is off by default: an extra selection scores zero and
  // reads as a miss, so the `−` stays and the `+` fades.
  return session.outcome.verdict === 'correct' ? { incorrect: TEXTURE } : { correct: TEXTURE }
}

export function decorOpacity(spec: DecorBodySpec, state: PlayStateForStage): number | string {
  if (!spec.role) return spec.opacity
  return decorMood(state)[spec.role] ?? spec.opacity
}
