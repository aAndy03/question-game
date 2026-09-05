/**
 * `npm run dev:studio` has no Rust behind it. With `?fake` on the URL — dev
 * builds only — the in-memory fake host is installed with a small demo
 * library, so the shell can be worked on in a plain browser the way Stage's
 * fixture strip lets screens be worked on. It is unreachable inside the app:
 * a real host is detected first and wins.
 */

import { createFakeHost, DEFAULT_GAME_SETTINGS, type FakeHost } from './fake'
import { hasTauri, setHostTransport } from './host'
import type { CatalogItem, Recipe } from './types'

export function installDevFakeIfAsked(): FakeHost | null {
  if (!import.meta.env.DEV || hasTauri()) return null
  if (typeof window === 'undefined' || !new URLSearchParams(window.location.search).has('fake')) return null
  const fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  void fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op-andy' } })
  setHostTransport(fake)
  return fake
}

const t0 = Date.now() - 86_400_000 * 12

export function demoLibrary(): CatalogItem[] {
  const stamps = (days: number) => ({ createdAt: t0 + days * 86_400_000, updatedAt: t0 + days * 86_400_000 * 1.5, archivedAt: null })
  const q = (id: string, stem: string, difficulty: number, options: [string, boolean][], days: number): CatalogItem => ({
    kind: 'question',
    item: {
      id,
      stem,
      mediaAssetId: null,
      options: options.map(([text, correct], i) => ({ id: `${id}-${i}`, text, correct })),
      difficulty,
      explanation: null,
      ...stamps(days),
    },
  })
  return [
    { kind: 'team', item: { id: 'team-alpha', name: 'Alpha', shortCode: 'ALPHA', color: '#2563eb', logoAssetId: null, notes: 'Returning champions', playCount: 3, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(1) } },
    { kind: 'team', item: { id: 'team-bravo', name: 'Bravo', shortCode: 'BRAVO', color: '#16a34a', logoAssetId: null, notes: null, playCount: 1, lastPlayAt: t0 + 86_400_000 * 9, ...stamps(2) } },
    { kind: 'team', item: { id: 'team-charlie', name: 'Charlie', shortCode: 'CHARL', color: '#dc2626', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps(3) } },
    { kind: 'team', item: { id: 'team-delta', name: 'Delta', shortCode: 'DELTA', color: '#d97706', logoAssetId: null, notes: 'New this season', playCount: 0, lastPlayAt: null, ...stamps(4) } },
    { kind: 'domain', item: { id: 'dom-history', name: 'History', code: 'HIS_204', description: 'From antiquity to 1990.', questions: [{ questionId: 'q-h1', sortKey: 1 }, { questionId: 'q-h2', sortKey: 2 }, { questionId: 'q-h3', sortKey: 3 }], ...stamps(1) } },
    { kind: 'domain', item: { id: 'dom-tech', name: 'Technology', code: 'TEC_881', description: null, questions: [{ questionId: 'q-t1', sortKey: 1 }, { questionId: 'q-t2', sortKey: 2 }], ...stamps(2) } },
    { kind: 'domain', item: { id: 'dom-sport', name: 'Sport', code: 'SPO_117', description: null, questions: [{ questionId: 'q-s1', sortKey: 1 }], ...stamps(3) } },
    q('q-h1', 'Which empire built the road network that reached Britain?', 20, [['Roman', true], ['Ottoman', false], ['Persian', false], ['Mongol', false]], 1),
    q('q-h2', 'In which year did the Berlin Wall fall?', 45, [['1987', false], ['1989', true], ['1991', false]], 2),
    q('q-h3', 'Which two of these were signatories of the Treaty of Westphalia?', 80, [['France', true], ['Sweden', true], ['Portugal', false], ['Russia', false]], 3),
    q('q-t1', 'What does the L in HTML stand for?', 15, [['Language', true], ['Layout', false], ['Link', false]], 4),
    q('q-t2', 'Which of these is not a sorting algorithm?', 60, [['Quicksort', false], ['Heapsort', false], ['Dijkstra', true], ['Mergesort', false]], 5),
    q('q-s1', 'How many players are on a water polo team in the water?', 35, [['6', false], ['7', true], ['8', false]], 6),
    { kind: 'operator', item: { id: 'op-andy', displayName: 'Andy M.', pinHash: null, lastActiveAt: t0 + 86_400_000 * 11, playsRun: 4, ...stamps(0) } },
    { kind: 'operator', item: { id: 'op-guest', displayName: 'Guest operator', pinHash: 'x', lastActiveAt: null, playsRun: 0, ...stamps(6) } },
  ]
}

export function demoRecipe(): Recipe {
  return {
    id: 'recipe-demo',
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
