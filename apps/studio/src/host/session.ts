/**
 * What "a question is in progress" means, in one place.
 *
 * `play.session` is **not** that predicate. The projection keeps the resolved
 * session so Stage can go on drawing the question with its outcome, and it is
 * only ever *replaced* — by the next `QuestionIssued` — never cleared. So
 * `session !== null` is true from the first question of a Play to its end, and
 * anything that reads it as "busy" locks the operator out for the rest of the
 * show: that is exactly what happened on 2026-09-07, when every domain card
 * went permanently illegal after the first reveal and there was no way left to
 * issue another question.
 *
 * The host's rule is `require_live_session`: issued **and not resolved**. These
 * are that rule, spelled once for Control, the Viewer and the chords.
 */

import type { PlayStateForMain, StageSession } from '@questiongame/contract'

/** The question the operator is working on: issued and not yet revealed. */
export function liveSession(play: PlayStateForMain | null): StageSession | null {
  const session = play?.session ?? null
  if (!session || session.outcome !== null) return null
  return session
}

/** True while a question is issued and unresolved — the host's `SessionAlreadyIssued`. */
export function isSessionLive(play: PlayStateForMain | null): boolean {
  return liveSession(play) !== null
}

/**
 * Whether `choose_domain` would be accepted right now (`MatchService::
 * choose_domain`): the Play is running, a team holds the token, and the last
 * question has been resolved. Reveal is what frees the operator to move on
 * (§5.3) — not the disappearance of the session, which never happens.
 */
export function canChooseDomain(play: PlayStateForMain | null): boolean {
  if (!play || play.status !== 'playing') return false
  if (play.ring.currentTeamId === null) return false
  return !isSessionLive(play)
}

/**
 * Where the operator stands, as one word.
 *
 * Control's job is to offer what the host would accept *now* and nothing else.
 * Deriving that once, here, is what keeps the panel honest: a block that is
 * drawn in the wrong phase is a control the host will refuse, and a phase with
 * no block is an operator with nothing to press — the two failures reported on
 * 2026-09-07 (a resolved question with no way on, and a completed Play still
 * showing the question's dead controls).
 *
 *   ready      loaded, nothing has started
 *   question   a question is issued and unresolved
 *   resolved   the question is revealed and the token is still held
 *   handover   nobody holds the token; giving it is the only way on
 *   standings  the board is empty — the Play is over and the places remain
 *   ended      abandoned; nothing follows
 */
export type ControlPhase = 'ready' | 'question' | 'resolved' | 'handover' | 'standings' | 'ended'

export function controlPhase(play: PlayStateForMain | null): ControlPhase | null {
  if (!play) return null
  if (play.status === 'loaded') return 'ready'
  if (play.status === 'completed') return 'standings'
  if (play.status === 'abandoned') return 'ended'
  if (isSessionLive(play)) return 'question'
  if (play.ring.currentTeamId === null) return 'handover'
  return 'resolved'
}

/**
 * The next competition rank to reveal on FinalLeaderboard — **lowest place
 * first** (§5.5), so the highest rank number that has not been revealed.
 * `null` when every place is up.
 *
 * Tied teams share a rank and reveal together, which is why this counts
 * distinct ranks and not teams: `chain_next_rank` in the host does the same,
 * and the auto-mode chain and the operator's button must agree.
 */
export function nextLeaderboardRank(play: PlayStateForMain | null): number | null {
  if (!play) return null
  const ranks = [...new Set(play.teams.map((t) => t.rank))].sort((a, b) => b - a)
  return ranks.find((rank) => !play.leaderboardRevealedRanks.includes(rank)) ?? null
}
