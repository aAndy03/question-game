/**
 * The sample catalog `"Demo"` (spec §2.27, §2.28) — the TypeScript mirror of
 * `crates/host/src/catalog/seed.rs`.
 *
 * The fake host seeds this document through `catalog_seed_demo` exactly as the
 * app does, so `?fake` and the desktop app show the same Demo. Ids, names,
 * codes, colours and difficulties are the wire contract; change them on both
 * sides in one commit. Every row is `origin: 'seed'`, which is the only thing
 * that tells a seed row apart from one the operator made.
 *
 * Bodies are compared for `catalog_seed_status`'s `edited` count, so the
 * document is a value, not a factory with a clock: `stamps` are zero and the
 * fake stamps them on insert.
 */

import type { CatalogItem, GameSettings, Recipe } from '../types'

export const SEED_RECIPE_ID = 'seed-recipe-demo'

const stamps = { createdAt: 0, updatedAt: 0, archivedAt: null } as const

/** Four options, the first correct (§12.1). */
function question(id: string, stem: string, difficulty: number, options: readonly [string, string, string, string]): CatalogItem {
  return {
    kind: 'question',
    item: {
      id,
      origin: 'seed',
      stem,
      mediaAssetId: null,
      options: options.map((text, i) => ({ id: `${id}-${'abcd'[i]}`, text, correct: i === 0 })),
      difficulty,
      explanation: null,
      ...stamps,
    },
  }
}

const GEO = ['seed-q-geo-1', 'seed-q-geo-2', 'seed-q-geo-3'] as const
const SCI = ['seed-q-sci-1', 'seed-q-sci-2', 'seed-q-sci-3'] as const

export function seedLibrary(): CatalogItem[] {
  return [
    { kind: 'team', item: { id: 'seed-team-red', origin: 'seed', name: 'Red', shortCode: 'RED', color: 'var(--state-incorrect)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps } },
    { kind: 'team', item: { id: 'seed-team-blue', origin: 'seed', name: 'Blue', shortCode: 'BLUE', color: 'var(--state-info)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps } },
    { kind: 'domain', item: { id: 'seed-dom-geo', origin: 'seed', name: 'Geography', code: 'GEO_101', description: null, questions: GEO.map((questionId, i) => ({ questionId, sortKey: i + 1 })), ...stamps } },
    { kind: 'domain', item: { id: 'seed-dom-sci', origin: 'seed', name: 'Science', code: 'SCI_204', description: null, questions: SCI.map((questionId, i) => ({ questionId, sortKey: i + 1 })), ...stamps } },
    question(GEO[0], 'Which is the longest river in Africa?', 10, ['The Nile', 'The Congo', 'The Niger', 'The Zambezi']),
    question(GEO[1], 'Which country has the most time zones?', 20, ['France', 'Russia', 'The United States', 'China']),
    question(GEO[2], 'Which capital city lies on two continents?', 30, ['Istanbul', 'Cairo', 'Moscow', 'Ankara']),
    question(SCI[0], 'What is the chemical symbol for gold?', 10, ['Au', 'Ag', 'Gd', 'Go']),
    question(SCI[1], 'Which planet has the most moons?', 20, ['Saturn', 'Jupiter', 'Neptune', 'Uranus']),
    question(SCI[2], 'What is the hardest natural substance?', 30, ['Diamond', 'Quartz', 'Tungsten', 'Corundum']),
  ]
}

/** The recipe `"Demo"`: roster Red → Blue, board both domains, every question. */
export function seedRecipe(settings: GameSettings): Recipe {
  return {
    id: SEED_RECIPE_ID,
    origin: 'seed',
    name: 'Demo',
    folder: null,
    tags: [],
    teams: ['seed-team-red', 'seed-team-blue'],
    board: [
      { domainId: 'seed-dom-geo', questionIds: [...GEO] },
      { domainId: 'seed-dom-sci', questionIds: [...SCI] },
    ],
    settings,
    layout: {},
    overlays: { teams: {}, domains: {}, questions: {} },
    rev: 0,
    ...stamps,
  }
}

/** Fields that are not part of the shipped body and must not count as an edit. */
const VOLATILE = new Set(['createdAt', 'updatedAt', 'archivedAt', 'rev', 'playCount', 'lastPlayAt'])

/** Structural equality over the shipped fields, key order ignored. */
export function sameBody(a: unknown, b: unknown): boolean {
  return canonical(a) === canonical(b)
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (k, v) => {
    if (VOLATILE.has(k)) return undefined
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      return Object.fromEntries(Object.entries(v as Record<string, unknown>).sort(([x], [y]) => (x < y ? -1 : 1)))
    }
    return v
  })
}
