import { describe, expect, it } from 'vitest'
import { CUE_KEYS, FIXTURES, type PlayStateForStage, type StageSession } from '@questiongame/contract'
import { cuesFor } from './cues'

/**
 * `cuesFor` is the whole of Stage's audio judgement: a pure diff of two
 * emissions. The fixtures are real host emissions (the Rust side is held to
 * them), so a pair of fixtures is a real transition; hand-built pairs cover
 * the flips the fixture set has no neighbour for.
 */

const issued = FIXTURES['question-issued']
const session = (over: Partial<StageSession>): PlayStateForStage => ({
  ...issued,
  session: { ...issued.session!, ...over },
})
const running = (remainingMs: number) => ({
  durationMs: 30_000,
  remainingMs,
  running: true,
  remainingMsAtLock: null,
  expiredOpen: false,
})
const stopped = (remainingMs: number) => ({ ...running(remainingMs), running: false })

describe('cuesFor', () => {
  it('is silent on an identical state and on a redraw', () => {
    expect(cuesFor(issued, issued)).toEqual([])
    expect(cuesFor(issued, { ...issued })).toEqual([])
    expect(cuesFor(FIXTURES.idle, FIXTURES.idle)).toEqual([])
  })

  it('locks: question-issued → question-locked', () => {
    expect(cuesFor(issued, FIXTURES['question-locked'])).toEqual(['lock'])
  })

  it('scores: question-locked → question-outcome-*', () => {
    const locked = FIXTURES['question-locked']
    expect(cuesFor(locked, FIXTURES['question-outcome-correct'])).toEqual(['correct'])
    expect(cuesFor(locked, FIXTURES['question-outcome-incorrect'])).toEqual(['wrong'])
    // An extra selection scores zero with partial credit off: it sounds wrong.
    expect(cuesFor(locked, FIXTURES['question-outcome-partial'])).toEqual(['wrong'])
  })

  it('expires: question-issued → question-timer-expired-open', () => {
    expect(cuesFor(issued, FIXTURES['question-timer-expired-open'])).toEqual(['timer_expired'])
  })

  it('expiry from a running clock is one sound, not a pause as well', () => {
    const before = session({ timer: running(100) })
    const after = session({ timer: { ...stopped(0), expiredOpen: true } })
    expect(cuesFor(before, after)).toEqual(['timer_expired'])
  })

  it('does not expire once the outcome is in', () => {
    const before = session({ timer: running(100) })
    const after = session({ timer: stopped(0), lockedOptionIds: ['opt-a'], outcome: FIXTURES['question-outcome-correct'].session!.outcome })
    expect(cuesFor(before, after)).toEqual(['lock', 'correct'])
  })

  it('starts the timer: question-issued → question-stem-revealed', () => {
    expect(cuesFor(issued, FIXTURES['question-stem-revealed'])).toEqual(['timer_start'])
  })

  it('a question issued already running is a start', () => {
    const noSession = FIXTURES['choose-domain']
    expect(cuesFor(noSession, session({ timer: running(30_000) }))).toEqual(['timer_start'])
    // …and one issued stopped is nothing at all.
    expect(cuesFor(noSession, issued)).toEqual([])
  })

  it('pauses when running flips off by itself, never alongside a lock', () => {
    const runs = session({ timer: running(20_000) })
    expect(cuesFor(runs, session({ timer: stopped(19_900) }))).toEqual(['timer_pause'])
    expect(cuesFor(runs, FIXTURES['question-locked'])).toEqual(['lock'])
  })

  it('never yields both timer_start and timer_pause', () => {
    for (const a of [running(5_000), stopped(5_000)]) {
      for (const b of [running(4_900), stopped(4_900)]) {
        const cues = cuesFor(session({ timer: a }), session({ timer: b }))
        expect(cues.filter((c) => c === 'timer_start' || c === 'timer_pause').length).toBeLessThanOrEqual(1)
      }
    }
  })

  it('ignores a lock or outcome that belongs to another question', () => {
    const other = session({ questionId: 'q-other' })
    expect(cuesFor(other, FIXTURES['question-locked'])).toEqual([])
    expect(cuesFor(other, FIXTURES['question-outcome-correct'])).toEqual([])
    // A different Play altogether — a Restart — is a redraw too.
    expect(cuesFor({ ...issued, playId: 'play-before-restart' }, FIXTURES['question-locked'])).toEqual([])
  })

  it('starts the Play: loaded → playing, and not paused → playing', () => {
    const loaded = FIXTURES.idle
    const playing: PlayStateForStage = { ...loaded, status: 'playing' }
    expect(cuesFor(loaded, playing)).toEqual(['play_start'])
    expect(cuesFor({ ...playing, status: 'paused' }, playing)).toEqual([])
  })

  it('sounds an Overlay animation when the active request is new', () => {
    const board = FIXTURES['choose-domain']
    const handoff = FIXTURES['overlay-handoff']
    expect(cuesFor(board, handoff)).toEqual(['overlay_start'])
    // The same request on the next tick is still the same overlay.
    expect(cuesFor(handoff, { ...handoff })).toEqual([])
    // Two handoffs back to back are two starts, kind notwithstanding.
    const next: PlayStateForStage = {
      ...handoff,
      overlay: { ...handoff.overlay, active: { kind: 'token-handoff', fromTeamId: 'team-gamma', toTeamId: 'team-delta' } },
    }
    expect(cuesFor(handoff, next)).toEqual(['overlay_start'])
    // The overlay finishing is silence.
    expect(cuesFor(handoff, board)).toEqual([])
  })

  it('only ever returns contract cue keys', () => {
    const states = Object.values(FIXTURES)
    for (const a of states) for (const b of states) for (const cue of cuesFor(a, b)) expect(CUE_KEYS).toContain(cue)
  })
})
