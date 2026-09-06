import { describe, expect, it } from 'vitest'
import { applyToAllScreens, EMPTY_LAYOUT, layoutNodes, parseLayout } from './layout'
import { DEFAULT_DECOR_SETTINGS } from './play-state'

describe('layout document', () => {
  it('an empty or foreign document is the empty layout', () => {
    expect(parseLayout({})).toEqual(EMPTY_LAYOUT)
    expect(parseLayout(null)).toEqual(EMPTY_LAYOUT)
    expect(parseLayout('nope')).toEqual(EMPTY_LAYOUT)
  })

  it('keeps only known node ids and in-range values', () => {
    const parsed = parseLayout({
      version: 1,
      nodes: {
        'question.stem': { fontSize: 72, color: 'ink', dx: 10, hidden: false, viewerHandle: true },
        'question.option.opt-a': { fontSize: 9999, width: 300 },
        'nonsense.slot': { fontSize: 40 },
        'idle.wordmark': { bogus: 1 },
      },
      screens: { idle: { anchor: { x: 0.5, y: 0.5 } }, mars: { anchor: { x: 1, y: 1 } } },
      hitTargets: [{ id: 'x' }],
    })
    expect(parsed.nodes).toEqual({
      'question.stem': { fontSize: 72, color: 'ink', dx: 10 },
      'question.option.opt-a': { width: 300 },
    })
    expect(parsed.screens).toEqual({ idle: { anchor: { x: 0.5, y: 0.5 } } })
    expect(Object.keys(parsed).sort()).toEqual(['decor', 'nodes', 'screens', 'version'])
  })

  it('reads the decor dials with defaults for the rest', () => {
    const parsed = parseLayout({ decor: { mode: 'collide-attract', drift: 30 } })
    expect(parsed.decor).toEqual({ ...DEFAULT_DECOR_SETTINGS, mode: 'collide-attract', drift: 30 })
  })

  it('applies a style to the same slot on every screen that has it', () => {
    const { layout, written } = applyToAllScreens(EMPTY_LAYOUT, 'question.header', { fontSize: 20 })
    expect(written.sort()).toEqual(['chooseDomain.header', 'finalLeaderboard.header', 'question.header', 'scoreboard.header', 'teamOrder.header'])
    expect(layout.nodes['scoreboard.header']).toEqual({ fontSize: 20 })
    const cleared = applyToAllScreens(layout, 'question.header', null)
    expect(Object.keys(cleared.layout.nodes)).toHaveLength(0)
  })

  it('the play-state half carries nodes and screens only', () => {
    expect(Object.keys(layoutNodes(EMPTY_LAYOUT)).sort()).toEqual(['nodes', 'screens'])
  })
})
