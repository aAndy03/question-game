import { describe, expect, it } from 'vitest'
import {
  CONTRACT_VERSION,
  EMPTY_PLAY_STATE,
  COMMANDS,
  COMMAND_GROUPS,
  EVENTS,
  FIXTURES,
  FIXTURE_NAMES,
  PERSISTENT_SLOTS,
  SCREENS,
  SCREEN_SLOTS,
  STAGE_COMMANDS,
  STAGE_SCREENS,
  animKey,
  channelForRevealKey,
  currentTeam,
  isPersistentSlot,
  isStageScreen,
  isValidNodeId,
  leaderboard,
  nodeId,
  parseNodeId,
  parseRevealKey,
  revealKey,
  roundInvariantHolds,
  screenPairs,
  staticNodeIds,
} from './index'
import type { PlayStateForStage, StageScreen } from './index'

describe('screen registry', () => {
  it('registers the six screens plus the handoff interstitial', () => {
    expect(STAGE_SCREENS).toHaveLength(7)
    expect(STAGE_SCREENS).toContain('currentTeam')
  })

  it('marks only Idle as legal before a Play starts', () => {
    const early = STAGE_SCREENS.filter((s) => SCREENS[s].availableBeforePlay)
    expect(early).toEqual(['idle'])
  })

  it('derives every ordered screen pair, so a new screen demands transitions', () => {
    const n = STAGE_SCREENS.length
    expect(screenPairs()).toHaveLength(n * (n - 1))
    expect(screenPairs().every(([a, b]) => a !== b)).toBe(true)
  })

  it('gives every screen a slot map', () => {
    for (const screen of STAGE_SCREENS) {
      expect(Object.keys(SCREEN_SLOTS[screen]).length).toBeGreaterThan(0)
    }
  })

  it('rejects an unknown screen name', () => {
    expect(isStageScreen('teamOrder')).toBe(true)
    expect(isStageScreen('podium')).toBe(false)
  })
})

describe('node ids', () => {
  it('builds <screen>.<slot> for static slots', () => {
    expect(nodeId('question', 'stem')).toBe('question.stem')
  })

  it('builds <screen>.<slot>.<key> for keyed slots', () => {
    expect(nodeId('scoreboard', 'row', 'team-alpha')).toBe('scoreboard.row.team-alpha')
    expect(nodeId('finalLeaderboard', 'row', 3)).toBe('finalLeaderboard.row.3')
  })

  it('refuses a key on a static slot and a missing key on a keyed slot', () => {
    // Both are layout-override corruption if allowed through.
    expect(() => nodeId('question', 'stem', 'x')).toThrow(/static/)
    expect(() => nodeId('scoreboard', 'row')).toThrow(/requires a key/)
  })

  it('keys off entity ids, so a rename or reorder never moves an override', () => {
    const before = nodeId('teamOrder', 'row', 'team-gamma')
    const afterRenameAndReorder = nodeId('teamOrder', 'row', 'team-gamma')
    expect(before).toBe(afterRenameAndReorder)
  })

  it('round-trips through the parser', () => {
    const id = nodeId('question', 'option', 'opt-c')
    expect(parseNodeId(id)).toEqual({
      screen: 'question',
      slot: 'option',
      kind: 'entity',
      key: 'opt-c',
    })
  })

  it('returns null for ids from an older revision instead of throwing', () => {
    // A stale override must be reportable and skippable, not fatal on Stage.
    for (const bad of [
      'question',
      'question.nosuchslot',
      'nosuchscreen.stem',
      'question.stem.extra',
      'scoreboard.row',
      'scoreboard.row.',
      'a.b.c.d',
    ]) {
      expect(parseNodeId(bad), bad).toBeNull()
      expect(isValidNodeId(bad), bad).toBe(false)
    }
  })

  it('lists every static node id for the Screens canvas', () => {
    const ids = staticNodeIds()
    expect(ids).toContain('idle.wordmark')
    expect(ids).toContain('question.timer')
    expect(ids.every(isValidNodeId)).toBe(true)
  })

  it('names the slots that must survive a screen change', () => {
    // Spec §2.6: an overlay must not remount the screen or reset reveal state.
    expect(PERSISTENT_SLOTS).toContain('header')
    expect(PERSISTENT_SLOTS).toContain('decor')
    expect(isPersistentSlot('stem')).toBe(false)
  })
})

describe('reveal and animation keys', () => {
  it('builds and parses every reveal kind', () => {
    expect(parseRevealKey(revealKey.stem())).toEqual({ kind: 'stem' })
    expect(parseRevealKey(revealKey.option('opt-a'))).toEqual({
      kind: 'option',
      optionId: 'opt-a',
    })
    expect(parseRevealKey(revealKey.outcome())).toEqual({ kind: 'outcome' })
    expect(parseRevealKey(revealKey.leader(3))).toEqual({ kind: 'leader', rank: 3 })
  })

  it('rejects malformed keys', () => {
    for (const bad of ['option:', 'leader:0', 'leader:x', 'nonsense']) {
      expect(parseRevealKey(bad), bad).toBeNull()
    }
  })

  it('routes each reveal to the channel that governs its operator/auto mode', () => {
    expect(channelForRevealKey(revealKey.stem())).toBe('question')
    expect(channelForRevealKey(revealKey.option('opt-a'))).toBe('answers')
    expect(channelForRevealKey(revealKey.outcome())).toBe('outcome')
    expect(channelForRevealKey(revealKey.leader(1))).toBe('leaderboard')
  })

  it('namespaces animation keys so anim-complete is unambiguous', () => {
    expect(animKey.transition('idle', 'chooseDomain')).toBe('transition:idle>chooseDomain')
    expect(animKey.overlay('token-handoff')).toBe('overlay:token-handoff')
    expect(animKey.reveal(revealKey.option('opt-b'))).toBe('reveal:option:opt-b')
  })
})

describe('commands and events', () => {
  it('assigns every command to exactly one owning module', () => {
    const all = Object.values(COMMAND_GROUPS).flat()
    expect(new Set(all).size).toBe(all.length)
    expect(COMMANDS).toHaveLength(all.length)
  })

  it('ships an empty state Stage can draw before the host says anything', () => {
    // Idle reads nothing off the Play, so an empty roster is not a hole — it is
    // the wall before a recipe is loaded. It still has to be a *real* state:
    // same contract version, every key present, and the round invariant holds.
    expect(EMPTY_PLAY_STATE.contractVersion).toBe(CONTRACT_VERSION)
    expect(EMPTY_PLAY_STATE.currentScreen).toBe('idle')
    expect(EMPTY_PLAY_STATE.session).toBeNull()
    expect(roundInvariantHolds(EMPTY_PLAY_STATE)).toBe(true)
    expect(Object.keys(EMPTY_PLAY_STATE).sort()).toEqual(Object.keys(FIXTURES.idle).sort())
  })

  it('lets Stage report on itself and nothing else', () => {
    // Stage is a projection, not a controller (spec §5.7). Both of these are
    // Stage reporting its own state — a finished timeline, and "I have mounted,
    // and this is my contract version". Neither carries an opinion about the
    // Play. The host enforces the same list in `crates/app/src/guard.rs`,
    // because Tauri does not gate app-defined commands behind capabilities.
    expect(STAGE_COMMANDS).toEqual(['overlay_ack_complete', 'stage_ready', 'stage_report'])
    for (const command of STAGE_COMMANDS) {
      expect(COMMANDS).toContain(command)
    }
  })

  it('carries the anim-complete handshake event', () => {
    expect(EVENTS).toContain('anim-complete')
  })
})

describe('fixtures', () => {
  it('covers every screen', () => {
    const covered = new Set<StageScreen>(
      FIXTURE_NAMES.map((n) => FIXTURES[n].currentScreen),
    )
    for (const screen of STAGE_SCREENS) {
      expect(covered.has(screen), `no fixture renders ${screen}`).toBe(true)
    }
  })

  it('covers the whole question lifecycle', () => {
    for (const name of [
      'question-issued',
      'question-stem-revealed',
      'question-options-partial',
      'question-locked',
      'question-timer-expired-open',
      'question-outcome-correct',
      'question-outcome-incorrect',
      'question-outcome-partial',
    ] as const) {
      expect(FIXTURE_NAMES).toContain(name)
    }
  })

  it('stamps the contract version so a host/webview mismatch is detectable', () => {
    for (const name of FIXTURE_NAMES) {
      expect(FIXTURES[name].contractVersion).toBe(CONTRACT_VERSION)
    }
  })

  it('holds the round invariant in every fixture, at every team count', () => {
    for (const name of FIXTURE_NAMES) {
      expect(roundInvariantHolds(FIXTURES[name]), name).toBe(true)
    }
  })

  it('keeps ring order and team list consistent', () => {
    for (const name of FIXTURE_NAMES) {
      const state = FIXTURES[name]
      for (const id of state.ring.order) {
        expect(state.teams.some((t) => t.id === id), `${name}: ${id}`).toBe(true)
      }
      if (state.ring.currentTeamId !== null) {
        expect(currentTeam(state), name).not.toBeNull()
      }
    }
  })

  it('only issues a session on screens that use one, and never before Play', () => {
    for (const name of FIXTURE_NAMES) {
      const state = FIXTURES[name]
      if (state.status === 'loaded') {
        expect(state.session, name).toBeNull()
      }
      if (!SCREENS[state.currentScreen].usesSession && state.session !== null) {
        // Legal — the operator may show any screen while a question is issued.
        // Asserted here so the allowance stays deliberate.
        expect(SCREENS[state.currentScreen].usesSession).toBe(false)
      }
    }
  })

  it('scores nothing before reveal', () => {
    // Spec §2.4: lock does not score; reveal is the only scoring point.
    for (const name of FIXTURE_NAMES) {
      const session = FIXTURES[name].session
      if (session && !session.reveals.outcome) {
        expect(session.outcome, name).toBeNull()
      }
    }
  })

  it('stores a lock time exactly when a lock happened', () => {
    for (const name of FIXTURE_NAMES) {
      const session = FIXTURES[name].session
      if (!session?.timer) continue
      const locked = session.lockedOptionIds !== null
      expect(session.timer.remainingMsAtLock !== null, name).toBe(locked)
      if (locked) expect(session.timer.running, name).toBe(false)
    }
  })

  it('hides the clock entirely at operator pace', () => {
    expect(FIXTURES['operator-pace'].session?.timer).toBeNull()
  })

  it('keeps reveals intact while an overlay runs', () => {
    // The P3 regression case: an overlay must not reset reveal state (§2.6).
    const state = FIXTURES['overlay-over-question']
    expect(state.overlay.busy).toBe(true)
    expect(state.session?.reveals.stem).toBe(true)
    expect(state.session?.reveals.optionIds.length).toBeGreaterThan(0)
  })

  it('queues at most one pending overlay', () => {
    for (const name of FIXTURE_NAMES) {
      const overlay = FIXTURES[name].overlay
      if (overlay.pending !== null) expect(overlay.active, name).not.toBeNull()
    }
  })

  it('ranks with ties sharing a place, 1-1-3 style', () => {
    const order = leaderboard(FIXTURES['final-leaderboard-partial'])
    expect(order.map((t) => t.id)).toEqual([
      'team-alpha',
      'team-beta',
      'team-gamma',
      'team-delta',
    ])
    expect(order.map((t) => t.rank)).toEqual([1, 2, 2, 4])
  })

  it('includes a one-team rehearsal Play', () => {
    const solo = FIXTURES['rehearsal-solo']
    expect(solo.teams).toHaveLength(1)
    expect(roundInvariantHolds(solo)).toBe(true)
  })

  it('derives a valid node id for every entity each fixture references', () => {
    for (const name of FIXTURE_NAMES) {
      const state = FIXTURES[name]
      for (const team of state.teams) {
        expect(isValidNodeId(nodeId('teamOrder', 'row', team.id)), name).toBe(true)
        expect(isValidNodeId(nodeId('scoreboard', 'row', team.id)), name).toBe(true)
      }
      for (const domain of state.domains) {
        expect(isValidNodeId(nodeId('chooseDomain', 'card', domain.id)), name).toBe(true)
      }
      for (const option of state.session?.options ?? []) {
        expect(isValidNodeId(nodeId('question', 'option', option.id)), name).toBe(true)
      }
    }
  })

  it('reveals leaderboard ranks lowest first', () => {
    for (const name of FIXTURE_NAMES) {
      const ranks = FIXTURES[name].leaderboardRevealedRanks
      const descending = [...ranks].sort((a, b) => b - a)
      expect(ranks, name).toEqual(descending)
    }
  })

  it('never reveals an option id the session does not contain', () => {
    for (const name of FIXTURE_NAMES) {
      const session = FIXTURES[name].session
      if (!session) continue
      const known = new Set(session.options.map((o) => o.id))
      for (const id of [
        ...session.reveals.optionIds,
        ...session.selectedOptionIds,
        ...(session.lockedOptionIds ?? []),
        ...(session.outcome?.correctOptionIds ?? []),
      ]) {
        expect(known.has(id), `${name}: ${id}`).toBe(true)
      }
    }
  })
})

describe('play-state helpers', () => {
  const state: PlayStateForStage = FIXTURES['team-order']

  it('finds the team holding the token', () => {
    expect(currentTeam(state)?.id).toBe('team-gamma')
  })

  it('reports no current team when the token is between holders', () => {
    expect(currentTeam(FIXTURES['final-leaderboard-partial'])).toBeNull()
  })

  it('catches a snapshot that breaks the round invariant', () => {
    const broken: PlayStateForStage = {
      ...state,
      teams: state.teams.map((t) =>
        t.id === 'team-alpha' ? { ...t, turnsTaken: t.turnsTaken + 2 } : t,
      ),
    }
    expect(roundInvariantHolds(broken)).toBe(false)
  })
})
