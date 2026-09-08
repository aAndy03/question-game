/**
 * The ring as Control draws it (spec §5.4), derived from `play-state` and
 * nothing else. Pure, so the nine row variants and the drop rule are testable
 * at any team count without a host.
 *
 * With `round_index = r`: a team with `turnsTaken === r` has been served this
 * round (history), the holder is `currentTeamId`, and every active team with
 * `turnsTaken === r − 1` is the future ring. Drag reorders the future ring
 * only; the host enforces the same rule in `reorder_ring`.
 */

import type { PlayStateForMain, StageTeam } from '@questiongame/contract'
import { isSessionLive } from './session'

export type RingPhase = 'history' | 'current' | 'future' | 'inactive'

export interface RingEntry {
  readonly team: StageTeam
  readonly phase: RingPhase
  /** Position in `ring.order`. */
  readonly index: number
  /** A legal `give_token` target right now (from the operator half). */
  readonly isLegalTarget: boolean
  /** Active, not served this round, and not the holder — the spec's `overlooked`. */
  readonly isOverlooked: boolean
}

export function ringEntries(state: PlayStateForMain): RingEntry[] {
  const byId = new Map(state.teams.map((t) => [t.id, t]))
  const legal = new Set(state.operator.legalTokenTargets)
  const round = state.ring.roundIndex
  return state.ring.order.flatMap((id, index) => {
    const team = byId.get(id)
    if (!team) return []
    const phase: RingPhase = !team.active
      ? 'inactive'
      : id === state.ring.currentTeamId
        ? 'current'
        : team.turnsTaken >= round
          ? 'history'
          : 'future'
    return [
      {
        team,
        phase,
        index,
        isLegalTarget: legal.has(id),
        isOverlooked: phase === 'future' && state.ring.currentTeamId === null,
      },
    ]
  })
}

/** A drop is legal only between two future rows (spec §5.4). */
export function isDropLegal(entries: readonly RingEntry[], fromId: string, toId: string): boolean {
  const from = entries.find((e) => e.team.id === fromId)
  const to = entries.find((e) => e.team.id === toId)
  return Boolean(from && to && from.phase === 'future' && to.phase === 'future')
}

/**
 * The full order to send to `reorder_ring` after moving `fromId` to `toId`'s
 * place: history and the holder keep their positions; only future rows move.
 * Returns null when the drop is illegal.
 */
export function reorderedRing(state: PlayStateForMain, fromId: string, toId: string): string[] | null {
  const entries = ringEntries(state)
  if (!isDropLegal(entries, fromId, toId)) return null
  const future = entries.filter((e) => e.phase === 'future').map((e) => e.team.id)
  const fromIndex = future.indexOf(fromId)
  const toIndex = future.indexOf(toId)
  if (fromIndex < 0 || toIndex < 0) return null
  const moved = [...future]
  moved.splice(fromIndex, 1)
  moved.splice(toIndex, 0, fromId)
  let cursor = 0
  return entries.map((e) => (e.phase === 'future' ? (moved[cursor++] ?? e.team.id) : e.team.id))
}

/**
 * What a ring row *is*, right now, in one word — the row's own answer to "can
 * I press this, and what happens if I do?".
 *
 * Colour and position say a lot but not enough: the operator has to be able to
 * tell the team the round invariant will serve next from the ones a hand-over
 * would jump to, and to see why a row that looks ordinary cannot be pressed.
 * Every case a Play can be in is answered here, once, so the panel and the
 * Viewer read the same sentence:
 *
 *   holder        has the token; the turn is theirs
 *   next          the team the ring serves next — pressing it is *not* an
 *                 override, it is the order (§5.4)
 *   override      a legal target, but out of order: served after the next one
 *   reveal-first  a legal target that the live question is holding back (§2.6)
 *   served        already played this round; the invariant will not serve it
 *                 again until everyone has
 *   inactive      not in this Play
 *   solo          the only team — a rehearsal (§4.3)
 *   closed        the Play can no longer take a hand-over
 */
export type RingRole = 'holder' | 'next' | 'override' | 'reveal-first' | 'served' | 'inactive' | 'solo' | 'closed'

export function ringRole(state: PlayStateForMain, entry: RingEntry): RingRole {
  if (state.operator.isRehearsal) return 'solo'
  if (entry.phase === 'inactive') return 'inactive'
  if (entry.phase === 'current') return 'holder'
  const open = state.status === 'playing' || state.status === 'paused'
  if (!open) return 'closed'
  if (!entry.isLegalTarget) return 'served'
  // §2.6 path 2: a question that is issued and unrevealed holds every
  // hand-over back, and `override.after_lock` decides whether Control offers
  // *Reveal & pass* instead of nothing.
  if (isSessionLive(state) && state.operator.overrideAfterLock === 'refuse_until_reveal') return 'reveal-first'
  return entry.team.id === state.operator.defaultNextTeamId ? 'next' : 'override'
}
