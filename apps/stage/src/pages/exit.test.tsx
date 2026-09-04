/**
 * P2 exit criteria (docs/v1/04_ROADMAP.md), asserted over every fixture:
 *
 *   - every fixture renders inside the fixed canvas from the layout tokens;
 *   - every P1 node id is present in the DOM with its contract id;
 *   - nothing on Stage is focusable or interactive;
 *   - atoms and molecules import no play-state.
 */

import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { FIXTURES, FIXTURE_NAMES, SCREEN_SLOTS, leaderboard, nodeId, type PlayStateForStage } from '@questiongame/contract'
import { decorSpecFor } from '@/decor'
import { StageRoot } from './index'

const byNode = (root: HTMLElement, id: string) => root.querySelector(`[data-node-id="${id}"]`)

/** Every node id a fixture implies, derived from the contract alone. */
function expectedNodeIds(state: PlayStateForStage): string[] {
  const screen = state.currentScreen
  const ids: string[] = []
  for (const [slot, kind] of Object.entries(SCREEN_SLOTS[screen] as Record<string, string>)) {
    if (kind === 'static') ids.push(`${screen}.${slot}`)
  }
  if (screen === 'teamOrder') for (const id of state.ring.order) ids.push(nodeId('teamOrder', 'row', id))
  if (screen === 'chooseDomain') for (const d of state.domains) ids.push(nodeId('chooseDomain', 'card', d.id))
  if (screen === 'question') for (const o of state.session?.options ?? []) ids.push(nodeId('question', 'option', o.id))
  if (screen === 'scoreboard') for (const t of state.teams) ids.push(nodeId('scoreboard', 'row', t.id))
  if (screen === 'finalLeaderboard') leaderboard(state).forEach((_, i) => ids.push(nodeId('finalLeaderboard', 'row', i + 1)))
  const decor = decorSpecFor(screen, state)
  if (decor) decor.bodies.forEach((_, i) => ids.push(nodeId(screen, 'decor', i)))
  return ids
}

describe('P2 exit: every fixture', () => {
  for (const name of FIXTURE_NAMES) {
    const state = FIXTURES[name]

    it(`${name}: renders the fixed canvas and every contract node id`, () => {
      const { container } = render(<StageRoot state={state} />)
      const frame = container.querySelector('[data-stage-frame]') as HTMLElement
      expect(frame.style.width).toBe('var(--stage-width)')
      expect(frame.style.height).toBe('var(--stage-height)')
      expect(frame.style.overflow).toBe('hidden')
      for (const id of expectedNodeIds(state)) expect(byNode(container, id), id).toBeTruthy()
    })

    it(`${name}: exposes nothing focusable or interactive`, () => {
      const { container } = render(<StageRoot state={state} />)
      expect(container.querySelectorAll('button, input, select, textarea, a[href], [tabindex], [role="button"], [contenteditable]').length).toBe(0)
    })
  }
})

// Sources of the presentational levels, read at build time.
const PRESENTATIONAL = {
  ...import.meta.glob('../atoms/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../molecules/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>

describe('P2 exit: atoms and molecules take props only', () => {
  it('finds the sources', () => {
    expect(Object.keys(PRESENTATIONAL).length).toBeGreaterThan(10)
  })
  for (const [file, src] of Object.entries(PRESENTATIONAL)) {
    if (file.includes('.test.')) continue
    it(`${file} imports neither play-state nor the host and keeps no local state`, () => {
      expect(src).not.toMatch(/PlayStateForStage|@tauri-apps/)
      expect(src).not.toMatch(/useState|useReducer/)
    })
  }
})
