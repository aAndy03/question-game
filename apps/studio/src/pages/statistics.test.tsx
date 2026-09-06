import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { STATS } from '@/copy/stats'
import type { StatsQuery, StatsResult } from '@/host/types'

/**
 * Statistics (P11, 05_STUDIO_DESIGN.md §13). The fold is the host's and is
 * tested there; what matters here is what Studio *asks* and what it draws —
 * and, as the P11 exit criterion, that this surface cannot ask for a write.
 */

const RESULT: StatsResult = {
  groupBy: 'team',
  metrics: ['turns', 'correct', 'accuracy', 'points'],
  rows: [
    { key: 'team-alpha', label: 'Alpha', values: [4, 3, 0.75, 90], turns: 4, plays: 1 },
    { key: 'team-beta', label: 'Beta', values: [3, 1, null, 20], turns: 3, plays: 1 },
  ],
  totals: { key: '', label: '', values: [7, 4, 0.571, 110], turns: 7, plays: 1 },
  playCount: 1,
  turnCount: 7,
}

function openPlay(eventCount: number) {
  return {
    ...EMPTY_PLAY_STATE,
    playId: 'play-1',
    status: 'playing' as const,
    teams: [
      { id: 'team-alpha', name: 'Alpha', shortCode: 'ALPHA', color: 'var(--ink)', logoUrl: null, detail: null, score: 90, rank: 1, turnsTaken: 4, active: true },
      { id: 'team-beta', name: 'Beta', shortCode: 'BETA', color: 'var(--ink)', logoUrl: null, detail: null, score: 20, rank: 2, turnsTaken: 3, active: true },
    ],
    domains: [{ id: 'dom-1', name: 'Geography', code: 'GEO_101', remaining: 5, exhausted: false, nextDifficulty: 20 }],
    ring: { order: ['team-alpha', 'team-beta'], currentTeamId: 'team-alpha', roundIndex: 2 },
    operator: {
      recipeId: 'recipe-demo',
      legalTokenTargets: [],
      defaultNextTeamId: null,
      consecutiveCorrect: 0,
      isRehearsal: false,
      canUndo: false,
      canRedo: false,
      eventCount,
      showGiveToken: false,
      overrideAfterLock: 'refuse_until_reveal' as const,
      disabled: [],
    },
  }
}

/**
 * Both halves of "a Play is open": the store Studio reads, and the fake's own
 * `get_state`, which `bridge.tsx` asks for on mount and would otherwise
 * overwrite the store with `null`.
 */
function mount(play: ReturnType<typeof openPlay> | null = null): FakeHost {
  const fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  fake.stats = RESULT
  fake.playState = play
  setHostTransport(fake)
  if (play) receivePlayState(play)
  return fake
}

const statsCalls = (fake: FakeHost) =>
  fake.calls.filter((c) => c.name === 'stats_query').map((c) => (c.args?.['query'] ?? {}) as StatsQuery)

async function goToStatistics(view: 'live' | 'all') {
  await act(async () => {
    await useNavStore.getState().go({ tab: 'statistics', view })
  })
}

describe('Statistics', () => {
  beforeEach(() => {
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    receivePlayState(null)
  })
  afterEach(() => setHostTransport(null))

  it('points at Control when no Play is open', async () => {
    const fake = mount()
    render(<App />)
    await goToStatistics('live')
    expect(await screen.findByRole('button', { name: STATS.live.goToControl })).toBeTruthy()
    // Nothing to ask about: an empty Live view issues no query at all.
    expect(statsCalls(fake)).toHaveLength(0)
  })

  it('scopes the Live view to the open Play and draws the answer', async () => {
    const fake = mount(openPlay(12))
    render(<App />)
    await goToStatistics('live')

    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(0))
    for (const query of statsCalls(fake)) {
      expect(query.filter?.playIds).toEqual(['play-1'])
      // A rehearsal is what the operator is watching; Live keeps it.
      expect(query.filter?.includeRehearsal).toBe(true)
    }
    expect(statsCalls(fake).map((q) => q.groupBy).sort()).toEqual(['domain', 'team'])
    // The row the host labelled, in the table it grouped.
    expect((await screen.findAllByText('Alpha')).length).toBeGreaterThan(0)
    expect(document.querySelector('[data-stats-row="team-alpha"]')).not.toBeNull()
    // `null` is an em dash, never a zero (§13.1).
    expect(await screen.findAllByText(STATS.table.none)).toBeTruthy()
  })

  it('refetches when the log grows and not when the countdown ticks', async () => {
    const fake = mount(openPlay(12))
    render(<App />)
    await goToStatistics('live')
    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(0))
    const afterMount = statsCalls(fake).length

    // A tick: same log, a different millisecond.
    act(() => receivePlayState({ ...openPlay(12), session: null }))
    await act(async () => {})
    expect(statsCalls(fake)).toHaveLength(afterMount)

    // A resolved turn: the log grew.
    act(() => receivePlayState(openPlay(13)))
    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(afterMount))
  })

  it('asks All data for the dimension the operator picked', async () => {
    const fake = mount()
    render(<App />)
    await goToStatistics('all')
    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(0))
    expect(statsCalls(fake)[0]?.groupBy).toBe('team')
    expect(await screen.findByLabelText(STATS.table.label)).toBeTruthy()

    const rehearsals = await screen.findByRole('checkbox', { name: STATS.filters.rehearsals })
    await act(async () => {
      fireEvent.click(rehearsals)
    })
    await waitFor(() => expect(statsCalls(fake).some((q) => q.filter?.includeRehearsal === true)).toBe(true))
  })

  it('issues no writing command at all (P11 exit criterion)', async () => {
    const fake = mount(openPlay(12))
    render(<App />)
    await goToStatistics('all')
    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(0))
    await goToStatistics('live')
    await waitFor(() => expect(statsCalls(fake).length).toBeGreaterThan(1))

    // Every command this surface reached for is a read.
    const READS = [
      'stats_query',
      'catalog_list',
      'catalog_get',
      'recipe_list',
      'recipe_get',
      'settings_get',
      'monitors_list',
      'get_state',
      'health_get',
      'paths_get',
      'catalog_seed_status',
      'play_list',
    ]
    for (const call of fake.calls) expect(READS, `${call.name} is not a read`).toContain(call.name)
  })
})

describe('the Statistics surface', () => {
  /**
   * The exit criterion as a property of the source, not of one run: a chart
   * that dispatched a command would still pass a render test if nobody
   * clicked it. `useHostCommand` is the only way to write, so its absence
   * from these files is the whole proof.
   */
  const SOURCES = import.meta.glob(
    ['../organisms/LiveStats.tsx', '../organisms/AllDataStats.tsx', '../pages/StatisticsPage.tsx', '../molecules/Stats*.tsx', '../copy/stats.ts'],
    { query: '?raw', import: 'default', eager: true },
  ) as Record<string, string>

  it('imports no write, anywhere', () => {
    expect(Object.keys(SOURCES).length).toBeGreaterThanOrEqual(7)
    for (const [file, text] of Object.entries(SOURCES)) {
      expect(text, `${file} can write`).not.toContain('useHostCommand')
      expect(text, `${file} reaches Tauri directly`).not.toContain('@tauri-apps/api')
    }
  })

  it('keeps ECharts in the one molecule', () => {
    const importers = Object.entries(SOURCES).filter(([, text]) => text.includes("from 'echarts'"))
    expect(importers.map(([file]) => file.split('/').pop())).toEqual(['StatsChart.tsx'])
  })
})
