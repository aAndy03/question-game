/**
 * Which cues a `play-state` change calls for (05_STUDIO_DESIGN.md §12.5).
 *
 * A pure diff of two emissions. Stage is a projection: a cue plays because
 * the host changed the Play, never because Stage decided something happened,
 * so every rule here is spelled as *a field went from this to that*. There is
 * no memory beyond the previous emission and no clock — the timer's zero is
 * the host's `remainingMs` reaching 0, not a countdown of Stage's own.
 *
 * "Same session" means the same Play and the same issued question: a lock or
 * an outcome that is simply *present* on a freshly issued question (a late
 * Stage mount, a Restart into a fixture) is state to draw, not an event to
 * sound.
 */
import type { CueKey, PlayStateForStage, StageSession } from '@questiongame/contract'

type Active = PlayStateForStage['overlay']['active']

/** The previous emission's session when it is the same issued question, else null. */
function previousSession(prev: PlayStateForStage, next: PlayStateForStage): StageSession | null {
  if (prev.playId !== next.playId || prev.session === null || next.session === null) return null
  return prev.session.questionId === next.session.questionId ? prev.session : null
}

/** Compared by value, not by kind: two token handoffs in a row are two starts. */
const sameOverlay = (a: Active, b: Active) => JSON.stringify(a) === JSON.stringify(b)

export function cuesFor(prev: PlayStateForStage, next: PlayStateForStage): CueKey[] {
  if (prev === next) return []
  const cues: CueKey[] = []

  // The Play begins: loaded → playing, once. A resume from paused is not a start.
  if (prev.playId === next.playId && prev.status === 'loaded' && next.status === 'playing') cues.push('play_start')

  const session = next.session
  if (session) {
    const before = previousSession(prev, next)

    // The choice froze.
    const locked = before !== null && before.lockedOptionIds === null && session.lockedOptionIds !== null
    if (locked) cues.push('lock')

    // The reveal scored. `partial` is an extra selection — zero points with
    // partial credit off — so it sounds like a wrong answer.
    if (before !== null && before.outcome === null && session.outcome !== null) {
      cues.push(session.outcome.verdict === 'correct' ? 'correct' : 'wrong')
    }

    const timer = session.timer
    if (timer) {
      const beforeTimer = before?.timer ?? null
      const wasRunning = beforeTimer?.running ?? false

      // The countdown reached zero before a reveal. `expiredOpen` is not the
      // test: a selection made but not locked expires too.
      const expired = beforeTimer !== null && beforeTimer.remainingMs > 0 && timer.remainingMs === 0 && session.outcome === null
      if (expired) cues.push('timer_expired')

      // Running flipped. A question issued already running counts as a start
      // (the host may start the clock in the same append). At most one of the
      // two per diff, and a stop that *is* a lock or an expiry is that sound,
      // not a pause — the operator paused nothing.
      if (timer.running && !wasRunning) cues.push('timer_start')
      else if (!timer.running && wasRunning && !locked && !expired) cues.push('timer_pause')
    }
  }

  // An Overlay animation started: the active request is new.
  if (next.overlay.active !== null && !sameOverlay(prev.overlay.active, next.overlay.active)) cues.push('overlay_start')

  return cues
}
