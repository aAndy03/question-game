/**
 * `npm run dev:studio` has no Rust behind it. With `?fake` on the URL — dev
 * builds only — the in-memory fake host is installed with a small demo
 * library, so the shell can be worked on in a plain browser the way Stage's
 * fixture strip lets screens be worked on. It is unreachable inside the app:
 * a real host is detected first and wins.
 *
 * The library here is "Season opener" — richer than the shipped Demo, and
 * `origin: 'operator'` so it reads as the operator's own work. The Demo itself
 * is one `catalog_seed_demo` away (`host/fake/seed.ts`), which is how the
 * Games empty state and Settings ▸ Library ▸ Restore Demo are exercised.
 *
 * `?fake&firstrun` seeds no operators and no active operator, so the
 * first-run flow (§12.1) can be walked in a browser too.
 */

import { FIXTURES, type Command, type FixtureName, type PlayStateForMain } from '@questiongame/contract'
import { createFakeHost, DEFAULT_GAME_SETTINGS, type FakeHost } from './fake'
import { hasTauri, setHostTransport, type HostTransport } from './host'
import type { CatalogItem, Recipe, StatsResult } from './types'

export function installDevFakeIfAsked(): FakeHost | null {
  if (!import.meta.env.DEV || hasTauri()) return null
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('fake')) return null
  const fake = createFakeHost()
  const params = new URLSearchParams(window.location.search)
  const firstRun = params.has('firstrun')
  fake.seed(
    firstRun ? demoLibrary().filter((row) => row.kind !== 'operator') : demoLibrary(),
    [demoRecipe()],
  )
  if (!firstRun) void fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op-andy' } })
  // `&play=<fixture>` also hands Control a Play to draw. The fixture is Stage's
  // half; the operator half is synthesised here and nowhere else.
  const fixture = params.get('play')
  if (fixture && fixture in FIXTURES) fake.playState = demoPlay(fixture as FixtureName)
  // Statistics reads a fold the fake does not do (§13.1); a canned answer is
  // what lets the tab be worked on in a browser, the way `play=` does Control.
  fake.stats = demoStats()
  // `&slow=<ms>` answers every command a task later, the way the real IPC
  // does — a round trip through Rust is never a microtask. A page that only
  // stays healthy because the fake answers before the next render can be
  // caught this way: the archived-teams loop of 2026-09-08 never reproduced
  // against an instant fake, because the render loop it was let microtasks
  // through and starved tasks.
  const slow = Number(params.get('slow') ?? 0)
  setHostTransport(slow > 0 ? delayed(fake, slow) : fake)
  return fake
}

function delayed(fake: FakeHost, ms: number): HostTransport {
  return {
    invoke: <T,>(name: Command, args?: Record<string, unknown>) =>
      new Promise<T>((ok, no) => {
        setTimeout(() => fake.invoke<T>(name, args).then(ok, no), ms)
      }),
    listen: (name, handler) => fake.listen(name, handler),
  }
}

export function demoPlay(name: FixtureName): PlayStateForMain {
  const stage = FIXTURES[name]
  const holder = stage.ring.currentTeamId
  const served = stage.teams.filter((t) => t.turnsTaken >= stage.ring.roundIndex).map((t) => t.id)
  const legal = stage.teams.filter((t) => t.active && t.id !== holder && !served.includes(t.id)).map((t) => t.id)
  return {
    ...stage,
    operator: {
      recipeId: 'recipe-demo',
      legalTokenTargets: legal,
      defaultNextTeamId: legal[0] ?? null,
      consecutiveCorrect: 0,
      isRehearsal: stage.teams.length === 1,
      canUndo: stage.questionsIssued > 0,
      canRedo: false,
      eventCount: 3 + stage.questionsIssued * 4,
      showGiveToken: true,
      overrideAfterLock: 'refuse_until_reveal',
      disabled: [],
    },
  }
}

const t0 = Date.now() - 86_400_000 * 12

export function demoLibrary(): CatalogItem[] {
  const stamps = (days: number) => ({ createdAt: t0 + days * 86_400_000, updatedAt: t0 + days * 86_400_000 * 1.5, archivedAt: null })
  const q = (id: string, stem: string, difficulty: number, options: [string, boolean][], days: number): CatalogItem => ({
    kind: 'question',
    item: {
      id,
      origin: 'operator',
      stem,
      mediaAssetId: null,
      options: options.map(([text, correct], i) => ({ id: `${id}-${i}`, text, correct })),
      difficulty,
      explanation: null,
      ...stamps(days),
    },
  })
  return [
    { kind: 'team', item: { id: 'team-alpha', origin: 'operator', name: 'Alpha', shortCode: 'ALPHA', color: '#2563eb', logoAssetId: null, notes: 'Returning champions', playCount: 3, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(1) } },
    { kind: 'team', item: { id: 'team-bravo', origin: 'operator', name: 'Bravo', shortCode: 'BRAVO', color: '#16a34a', logoAssetId: null, notes: null, playCount: 1, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(2) } },
    { kind: 'team', item: { id: 'team-charlie', origin: 'operator', name: 'Charlie', shortCode: 'CHARL', color: '#dc2626', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps(3) } },
    { kind: 'team', item: { id: 'team-delta', origin: 'operator', name: 'Delta', shortCode: 'DELTA', color: '#d97706', logoAssetId: null, notes: 'New this season', playCount: 0, lastPlayAt: null, ...stamps(4) } },
    { kind: 'domain', item: { id: 'dom-history', origin: 'operator', name: 'History', code: 'HIS_204', description: 'From antiquity to 1990.', questions: [{ questionId: 'q-h1', sortKey: 1 }, { questionId: 'q-h2', sortKey: 2 }, { questionId: 'q-h3', sortKey: 3 }], ...stamps(1) } },
    { kind: 'domain', item: { id: 'dom-tech', origin: 'operator', name: 'Technology', code: 'TEC_881', description: null, questions: [{ questionId: 'q-t1', sortKey: 1 }, { questionId: 'q-t2', sortKey: 2 }], ...stamps(2) } },
    { kind: 'domain', item: { id: 'dom-sport', origin: 'operator', name: 'Sport', code: 'SPO_117', description: null, questions: [{ questionId: 'q-s1', sortKey: 1 }], ...stamps(3) } },
    q('q-h1', 'Which empire built the road network that reached Britain?', 20, [['Roman', true], ['Ottoman', false], ['Persian', false], ['Mongol', false]], 1),
    q('q-h2', 'In which year did the Berlin Wall fall?', 45, [['1987', false], ['1989', true], ['1991', false]], 2),
    q('q-h3', 'Which two of these were signatories of the Treaty of Westphalia?', 80, [['France', true], ['Sweden', true], ['Portugal', false], ['Russia', false]], 3),
    q('q-t1', 'What does the L in HTML stand for?', 15, [['Language', true], ['Layout', false], ['Link', false]], 4),
    q('q-t2', 'Which of these is not a sorting algorithm?', 60, [['Quicksort', false], ['Heapsort', false], ['Dijkstra', true], ['Mergesort', false]], 5),
    q('q-s1', 'How many players are on a water polo team in the water?', 35, [['6', false], ['7', true], ['8', false]], 6),
    { kind: 'operator', item: { id: 'op-andy', displayName: 'Andy M.', pinHash: null, lastActiveAt: t0 + 86_400_000 * 11, playsRun: 4, ...stamps(0) } },
    { kind: 'operator', item: { id: 'op-guest', displayName: 'Guest operator', pinHash: 'fake:1234', lastActiveAt: null, playsRun: 0, ...stamps(6) } },
  ]
}

export function demoRecipe(): Recipe {
  return {
    id: 'recipe-demo',
    origin: 'operator',
    name: 'Season opener',
    folder: 'Season 3',
    tags: ['demo', 'four teams'],
    teams: ['team-alpha', 'team-bravo', 'team-charlie', 'team-delta'],
    board: [
      { domainId: 'dom-history', questionIds: ['q-h1', 'q-h2', 'q-h3'] },
      { domainId: 'dom-tech', questionIds: ['q-t1', 'q-t2'] },
    ],
    settings: DEFAULT_GAME_SETTINGS,
    layout: {},
    overlays: { teams: {}, domains: {}, questions: { 'q-h3': { difficulty: 70 } } },
    rev: 4,
    createdAt: t0,
    updatedAt: t0 + 86_400_000 * 10,
    archivedAt: null,
  }
}

/** A plausible `stats_query` answer for `?fake`: four teams, one season. */
export function demoStats(): StatsResult {
  const rows = [
    { key: 'team-alpha', label: 'Alpha Squad', values: [24, 18, 0.75, 620], turns: 24, plays: 4 },
    { key: 'team-bravo', label: 'Bravo Company', values: [23, 14, 0.61, 480], turns: 23, plays: 4 },
    { key: 'team-charlie', label: 'Charlie Crew', values: [22, 11, 0.5, 390], turns: 22, plays: 4 },
    { key: 'team-delta', label: 'Delta Force', values: [21, 7, 0.33, 240], turns: 21, plays: 3 },
  ]
  return {
    groupBy: 'team',
    metrics: ['turns', 'correct', 'accuracy', 'points'],
    rows,
    totals: { key: '', label: '', values: [90, 50, 0.556, 1730], turns: 90, plays: 4 },
    playCount: 4,
    turnCount: 90,
  }
}
