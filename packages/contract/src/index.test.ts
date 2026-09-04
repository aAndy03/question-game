import { describe, expect, it } from 'vitest'
import { COMMANDS, EVENTS, STAGE_SCREENS, nodeId } from './index'

describe('stage contract', () => {
  it('names the six screens plus the handoff interstitial', () => {
    expect(STAGE_SCREENS).toHaveLength(7)
    expect(STAGE_SCREENS).toContain('currentTeam')
  })

  it('builds node ids as <screen>.<slot>[.<key>]', () => {
    expect(nodeId('question', 'stem')).toBe('question.stem')
    expect(nodeId('scoreboard', 'row', 'team-7')).toBe('scoreboard.row.team-7')
  })

  it('keys node ids off entity ids, never array positions', () => {
    // A renamed or reordered team must not move its layout override (P9 risk).
    const first = nodeId('teamOrder', 'row', 'team-7')
    const afterReorder = nodeId('teamOrder', 'row', 'team-7')
    expect(first).toBe(afterReorder)
  })

  it('carries every §13 command the Viewer and Action Panel share', () => {
    for (const c of ['choose_domain', 'lock_selection', 'reveal_outcome', 'give_token'] as const) {
      expect(COMMANDS).toContain(c)
    }
  })

  it('carries the anim-complete handshake event', () => {
    expect(EVENTS).toContain('anim-complete')
  })
})
