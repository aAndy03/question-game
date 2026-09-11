/**
 * The two shipped Demos (spec §2.27, §2.28, P11.17) — the TypeScript mirror of
 * `crates/host/src/catalog/seed.rs`.
 *
 * The fake host seeds these documents through `catalog_seed_demo` exactly as
 * the app does, so `?fake` and the desktop app show the same Demos. Ids,
 * names, codes, colours, stems, options and difficulties are the wire
 * contract; change them on both sides in one commit. Every row is
 * `origin: 'seed'`, which is the only thing that tells a seed row apart from
 * one the operator made.
 *
 * Bodies are compared for `catalog_seed_status`'s `edited` count, so the
 * documents are values, not factories with a clock: `stamps` are zero and the
 * fake stamps them on insert.
 */

import type { CatalogItem, GameSettings, Recipe, SeedDemo } from '../types'

export const SEED_RECIPE_IDS: Record<SeedDemo, string> = { en: 'seed-recipe-demo', ro: 'seed-recipe-demo-ro' }
/** The English Demo's id — what first run and Games have always loaded. */
export const SEED_RECIPE_ID = SEED_RECIPE_IDS.en

const stamps = { createdAt: 0, updatedAt: 0, archivedAt: null } as const

type SeedQuestion = readonly [stem: string, options: readonly [string, string, string, string]]

/** One Demo as data. Every id is `prefix` + `team-` | `dom-` | `q-` + key. */
interface Doc {
  readonly name: string
  readonly prefix: string
  readonly teams: readonly (readonly [key: string, name: string, shortCode: string, color: string])[]
  readonly domains: readonly (readonly [key: string, name: string, code: string, questions: readonly [SeedQuestion, SeedQuestion, SeedQuestion]])[]
  /** Easy → hard inside a domain: the queue walks them in this order. */
  readonly difficulties: readonly [number, number, number]
}

const DOCS: Record<SeedDemo, Doc> = {
  en: {
    name: 'Demo',
    prefix: 'seed-',
    teams: [
      ['red', 'Red', 'RED', 'var(--state-incorrect)'],
      ['blue', 'Blue', 'BLUE', 'var(--state-info)'],
    ],
    domains: [
      [
        'geo',
        'Geography',
        'GEO_101',
        [
          ['Which is the largest ocean on Earth?', ['Pacific', 'Atlantic', 'Indian', 'Arctic']],
          ['What is the capital of Australia?', ['Canberra', 'Sydney', 'Melbourne', 'Perth']],
          ['Which river flows through Baghdad?', ['Tigris', 'Euphrates', 'Nile', 'Jordan']],
        ],
      ],
      [
        'sci',
        'Science',
        'SCI_204',
        [
          ['What is the chemical symbol for gold?', ['Au', 'Ag', 'Gd', 'Go']],
          ['How many bones does an adult human body have?', ['206', '212', '198', '224']],
          ["Which gas makes up most of Earth's atmosphere?", ['Nitrogen', 'Oxygen', 'Carbon dioxide', 'Argon']],
        ],
      ],
    ],
    difficulties: [10, 20, 30],
  },
  ro: {
    name: 'Demo (Română)',
    prefix: 'seed-ro-',
    teams: [
      ['red', 'Roșu', 'ROȘ', 'var(--state-incorrect)'],
      ['blue', 'Albastru', 'ALB', 'var(--state-info)'],
    ],
    domains: [
      [
        'ist',
        'Istorie',
        'IST_310',
        [
          ['În ce an a avut loc Marea Unire?', ['1918', '1859', '1877', '1947']],
          ['Cine a realizat unirea din 1600?', ['Mihai Viteazul', 'Ștefan cel Mare', 'Vlad Țepeș', 'Alexandru Ioan Cuza']],
          ['În ce an și-a proclamat România independența?', ['1877', '1859', '1866', '1881']],
        ],
      ],
      [
        'geo',
        'Geografie',
        'GEO_320',
        [
          ['Care este capitala României?', ['București', 'Cluj-Napoca', 'Iași', 'Timișoara']],
          ['Care este cel mai înalt vârf din România?', ['Moldoveanu', 'Negoiu', 'Omu', 'Peleaga']],
          ['Care este cel mai lung fluviu din Europa?', ['Volga', 'Dunărea', 'Nipru', 'Rin']],
        ],
      ],
      [
        'sti',
        'Științe',
        'STI_330',
        [
          ['Care este formula chimică a apei?', ['H2O', 'CO2', 'O2', 'NaCl']],
          ['Care planetă este cea mai apropiată de Soare?', ['Mercur', 'Venus', 'Marte', 'Pământ']],
          ['Care este, aproximativ, viteza luminii în vid?', ['300.000 km/s', '150.000 km/s', '30.000 km/s', '3.000.000 km/s']],
        ],
      ],
      [
        'bib',
        'Biblie',
        'BIB_340',
        [
          ['Cine a construit arca?', ['Noe', 'Moise', 'Avraam', 'David']],
          ['Câți apostoli și-a ales Iisus?', ['12', '7', '10', '40']],
          ['Cine a fost primul rege al lui Israel?', ['Saul', 'David', 'Solomon', 'Samuel']],
        ],
      ],
      [
        'spo',
        'Sport',
        'SPO_350',
        [
          ['Câți jucători are o echipă de fotbal pe teren?', ['11', '9', '10', '12']],
          ['Cine a primit prima notă de 10 din istoria gimnasticii olimpice?', ['Nadia Comăneci', 'Simona Amânar', 'Lavinia Miloșovici', 'Andreea Răducan']],
          ['În ce an a câștigat Steaua București Cupa Campionilor Europeni?', ['1986', '1984', '1989', '1991']],
        ],
      ],
    ],
    difficulties: [10, 50, 100],
  },
}

const questionIds = (doc: Doc, key: string) => [1, 2, 3].map((n) => `${doc.prefix}q-${key}-${n}`)

/** Every row of one Demo, in the order a batch writes them: teams, then each domain's questions and the domain. */
export function seedLibrary(demo: SeedDemo = 'en'): CatalogItem[] {
  const doc = DOCS[demo]
  const items: CatalogItem[] = doc.teams.map(([key, name, shortCode, color]) => ({
    kind: 'team',
    item: { id: `${doc.prefix}team-${key}`, origin: 'seed', name, shortCode, color, logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, ...stamps },
  }))
  for (const [key, name, code, questions] of doc.domains) {
    const ids = questionIds(doc, key)
    questions.forEach(([stem, options], i) => {
      const id = ids[i] ?? ''
      items.push({
        kind: 'question',
        item: {
          id,
          origin: 'seed',
          stem,
          mediaAssetId: null,
          // The first option is the correct one, always.
          options: options.map((text, k) => ({ id: `${id}-${'abcd'[k]}`, text, correct: k === 0 })),
          difficulty: doc.difficulties[i] ?? null,
          explanation: null,
          ...stamps,
        },
      })
    })
    items.push({
      kind: 'domain',
      item: {
        id: `${doc.prefix}dom-${key}`,
        origin: 'seed',
        name,
        code,
        description: null,
        questions: ids.map((questionId, sortKey) => ({ questionId, sortKey })),
        ...stamps,
      },
    })
  }
  return items
}

/** A Demo recipe: its two teams in play order, every domain, every question. */
export function seedRecipe(demo: SeedDemo, settings: GameSettings): Recipe {
  const doc = DOCS[demo]
  return {
    id: SEED_RECIPE_IDS[demo],
    origin: 'seed',
    name: doc.name,
    folder: null,
    tags: [],
    teams: doc.teams.map(([key]) => `${doc.prefix}team-${key}`),
    board: doc.domains.map(([key]) => ({ domainId: `${doc.prefix}dom-${key}`, questionIds: questionIds(doc, key) })),
    // The Romanian Demo carries one setting beyond the defaults: Stage's words.
    settings: demo === 'ro' ? { ...settings, language: 'ro' } : settings,
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
