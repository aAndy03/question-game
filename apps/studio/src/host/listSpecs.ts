/**
 * What each library tab filters, sorts and groups by (stable 1.1, design §3–§5,
 * 05_STUDIO_DESIGN.md §20). One spec per tab, declared once, pure; the list-view
 * model runs them all the same way.
 */

import { QUESTION, VIEWS } from '@/copy'
import { TRANSFER } from '@/copy/workspaces'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { compareText, type FilterDef, type ListSpec } from './listView'
import { answerMode, difficultyBand, isArchived, type Operator, type Question, type QuestionGap, type Recipe, type Team } from './types'

const byNumber = (a: number, b: number) => a - b
const choice = (value: unknown): string => (typeof value === 'string' ? value : '')
const multi = (value: unknown): readonly string[] => (Array.isArray(value) ? (value as readonly string[]) : [])

// ---- Where (Beta 2.0) --------------------------------------------------------

/**
 * This workspace's rows or the shared library's. The host already scopes the
 * list to *this workspace ∪ shared* — no other workspace's row is ever here —
 * so this only splits what is shown.
 */
function whereFilter<T>(shared: (item: T) => boolean): FilterDef<T> {
  return {
    id: 'where',
    label: TRANSFER.where,
    kind: 'choice',
    options: [
      { value: 'local', label: TRANSFER.whereLocal },
      { value: 'shared', label: TRANSFER.whereShared },
    ],
    test: (item, v) => (choice(v) === 'shared') === shared(item),
  }
}

function whereGroup<T>(shared: (item: T) => boolean) {
  return {
    id: 'where',
    label: TRANSFER.where,
    groupsOf: (item: T) =>
      shared(item) ? [{ key: 'shared', label: TRANSFER.whereShared, order: 1 }] : [{ key: 'local', label: TRANSFER.whereLocal, order: 0 }],
  }
}

// ---- Questions -------------------------------------------------------------

export interface QuestionItem {
  readonly question: Question
  /** Its group in the domain the list is inside (P15), `null` for none or under All questions. */
  readonly group?: { readonly id: string; readonly name: string } | null
  readonly gaps: readonly QuestionGap[]
  /** The **active** domains it is in; a question only in archived ones has none. */
  readonly domains: readonly { readonly id: string; readonly name: string }[]
}

const BANDS = ['easy', 'medium', 'hard'] as const

/** `allQuestions`: the domain pane is on *All questions*, the only place the Domain filter is offered. */
const foldTag = (t: string) => t.trim().toLowerCase()

export function questionsSpec(opts: {
  allQuestions: boolean
  domains: readonly { id: string; name: string }[]
  /** The groups of the domain the list is inside, in order (P15). */
  groups?: readonly { id: string; name: string }[]
  /** Every tag in view (P15). */
  tags?: readonly string[]
}): ListSpec<QuestionItem> {
  const groups = opts.allQuestions ? [] : (opts.groups ?? [])
  const tags = opts.tags ?? []
  const filters: FilterDef<QuestionItem>[] = [
    {
      id: 'band',
      label: VIEWS.band,
      kind: 'multi',
      options: BANDS.map((b) => ({ value: b, label: QUESTION.band[b] })),
      test: (q, v) => q.question.difficulty !== null && multi(v).includes(difficultyBand(q.question.difficulty)),
    },
    {
      id: 'difficulty',
      label: VIEWS.difficulty,
      kind: 'range',
      bounds: { min: 1, max: 100 },
      test: (q, v) => {
        const r = v as { min: number; max: number }
        const d = q.question.difficulty
        return d !== null && d >= r.min && d <= r.max
      },
    },
    {
      id: 'answer',
      label: VIEWS.answer,
      kind: 'choice',
      options: [
        { value: 'single', label: QUESTION.single },
        { value: 'multiple', label: QUESTION.multiple },
      ],
      test: (q, v) => answerMode(q.question) === choice(v),
    },
    {
      id: 'completeness',
      label: VIEWS.completeness,
      kind: 'choice',
      options: [
        { value: 'incomplete', label: VIEWS.incomplete },
        { value: 'complete', label: VIEWS.complete },
      ],
      test: (q, v) => (choice(v) === 'incomplete' ? q.gaps.length > 0 : q.gaps.length === 0),
    },
    ...(opts.allQuestions
      ? [
          {
            id: 'domain',
            label: VIEWS.domain,
            kind: 'multi' as const,
            options: opts.domains.map((d) => ({ value: d.id, label: d.name })),
            test: (q: QuestionItem, v: unknown) => q.domains.some((d) => multi(v).includes(d.id)),
          },
        ]
      : []),
    {
      id: 'origin',
      label: VIEWS.origin,
      kind: 'choice',
      options: [
        { value: 'seed', label: VIEWS.sample },
        { value: 'operator', label: VIEWS.mine },
      ],
      test: (q, v) => q.question.origin === choice(v),
    },
    whereFilter<QuestionItem>((q) => q.question.shared === true),
    ...(groups.length > 0
      ? [
          {
            id: 'group',
            label: GROUPS_TAGS.group,
            kind: 'multi' as const,
            options: [...groups.map((g) => ({ value: g.id, label: g.name })), { value: '~none', label: GROUPS_TAGS.noGroup }],
            test: (q: QuestionItem, v: unknown) => multi(v).includes(q.group?.id ?? '~none'),
          },
        ]
      : []),
    ...(tags.length > 0
      ? [
          {
            id: 'tag',
            label: GROUPS_TAGS.tag,
            kind: 'multi' as const,
            options: tags.map((t) => ({ value: foldTag(t), label: t })),
            test: (q: QuestionItem, v: unknown) => (q.question.tags ?? []).some((t) => multi(v).includes(foldTag(t))),
          },
        ]
      : []),
  ]
  return {
    tab: 'library',
    noun: { one: 'question', many: 'questions' },
    filters,
    sorts: [
      { id: 'difficulty', label: VIEWS.difficulty, compare: (a, b) => byNumber(a.question.difficulty as number, b.question.difficulty as number), nullable: (q) => q.question.difficulty === null },
      { id: 'text', label: VIEWS.text, compare: (a, b) => compareText(a.question.stem, b.question.stem) },
      { id: 'domains', label: VIEWS.domains, compare: (a, b) => a.domains.length - b.domains.length },
      { id: 'changed', label: VIEWS.changed, compare: (a, b) => a.question.updatedAt - b.question.updatedAt, defaultDesc: true },
      { id: 'created', label: VIEWS.created, compare: (a, b) => a.question.createdAt - b.question.createdAt, defaultDesc: true },
    ],
    groups: [
      // Inside one domain, grouping by domain would only show its questions' *other* domains.
      ...(opts.allQuestions
        ? [
            {
              id: 'domain',
              label: VIEWS.domain,
              groupsOf: (q: QuestionItem) =>
                q.domains.length > 0 ? q.domains.map((d) => ({ key: d.id, label: d.name, order: d.name })) : [{ key: '~none', label: VIEWS.noDomain, order: 0, last: true }],
            },
          ]
        : []),
      {
        id: 'band',
        label: VIEWS.band,
        groupsOf: (q) => {
          const d = q.question.difficulty
          if (d === null) return [{ key: '~none', label: VIEWS.notSet, order: 0, last: true }]
          const b = difficultyBand(d)
          return [{ key: b, label: QUESTION.band[b], order: BANDS.indexOf(b) }]
        },
      },
      {
        id: 'answer',
        label: VIEWS.answer,
        groupsOf: (q) => {
          const m = answerMode(q.question)
          return [{ key: m, label: m === 'single' ? QUESTION.single : QUESTION.multiple, order: m === 'single' ? 0 : 1 }]
        },
      },
      {
        id: 'completeness',
        label: VIEWS.completeness,
        groupsOf: (q) => (q.gaps.length > 0 ? [{ key: 'incomplete', label: VIEWS.incomplete, order: 0 }] : [{ key: 'complete', label: VIEWS.complete, order: 1 }]),
      },
      whereGroup<QuestionItem>((q) => q.question.shared === true),
      ...(groups.length > 0
        ? [
            {
              id: 'groups',
              label: GROUPS_TAGS.groups,
              groupsOf: (q: QuestionItem) => {
                const at = q.group ? groups.findIndex((g) => g.id === q.group?.id) : -1
                return at >= 0
                  ? [{ key: `g:${groups[at]?.id}`, label: groups[at]?.name ?? '', order: at }]
                  : [{ key: '~none', label: GROUPS_TAGS.noGroup, order: 0, last: true }]
              },
            },
          ]
        : []),
      {
        id: 'tag',
        label: GROUPS_TAGS.tag,
        groupsOf: (q: QuestionItem) => {
          const own = q.question.tags ?? []
          return own.length > 0
            ? own.map((t) => ({ key: `t:${foldTag(t)}`, label: t, order: foldTag(t) }))
            : [{ key: '~none', label: GROUPS_TAGS.noTag, order: 0, last: true }]
        },
      },
    ],
    // A domain with groups opens grouped by them, unless the operator picked a grouping (P15).
    defaults: { sort: { id: 'difficulty', desc: false }, group: groups.length > 0 ? 'groups' : null, pageSize: 100 },
    tiebreak: (q) => q.question.stem,
    changedAt: (q) => q.question.updatedAt,
    isArchived: (q) => isArchived(q.question),
  }
}

// ---- Teams -----------------------------------------------------------------

export const teamsSpec: ListSpec<Team> = {
  tab: 'teams',
  noun: { one: 'team', many: 'teams' },
  filters: [
    {
      id: 'played',
      label: VIEWS.played,
      kind: 'choice',
      options: [
        { value: 'never', label: VIEWS.never },
        { value: 'once', label: VIEWS.atLeastOnce },
      ],
      test: (t, v) => (choice(v) === 'never' ? t.playCount === 0 : t.playCount > 0),
    },
    whereFilter<Team>((t) => t.shared === true),
  ],
  sorts: [
    { id: 'name', label: VIEWS.name, compare: (a, b) => compareText(a.name, b.name) },
    { id: 'plays', label: VIEWS.plays, compare: (a, b) => a.playCount - b.playCount, defaultDesc: true },
    { id: 'lastPlayed', label: VIEWS.lastPlayed, compare: (a, b) => (a.lastPlayAt as number) - (b.lastPlayAt as number), nullable: (t) => t.lastPlayAt === null, defaultDesc: true },
    { id: 'changed', label: VIEWS.changed, compare: (a, b) => a.updatedAt - b.updatedAt, defaultDesc: true },
    { id: 'created', label: VIEWS.created, compare: (a, b) => a.createdAt - b.createdAt, defaultDesc: true },
  ],
  groups: [
    {
      id: 'played',
      label: VIEWS.played,
      groupsOf: (t) => (t.playCount > 0 ? [{ key: 'once', label: VIEWS.atLeastOnce, order: 0 }] : [{ key: 'never', label: VIEWS.never, order: 1 }]),
    },
    whereGroup<Team>((t) => t.shared === true),
  ],
  defaults: { sort: { id: 'name', desc: false }, group: null, pageSize: 100 },
  tiebreak: (t) => t.name,
  changedAt: (t) => t.updatedAt,
  isArchived: (t) => isArchived(t),
}

// ---- Games -----------------------------------------------------------------

export interface GameItem {
  readonly recipe: Recipe
  readonly playing: boolean
  readonly questions: number
}

const distinct = (values: readonly string[]) => [...new Set(values)].sort(compareText)

export function gamesSpec(recipes: readonly Recipe[]): ListSpec<GameItem> {
  return {
    tab: 'games',
    noun: { one: 'game', many: 'games' },
    filters: [
      {
        id: 'folder',
        label: VIEWS.folder,
        kind: 'multi',
        options: distinct(recipes.flatMap((r) => (r.folder ? [r.folder] : []))).map((f) => ({ value: f, label: f })),
        test: (g, v) => g.recipe.folder !== null && multi(v).includes(g.recipe.folder),
      },
      {
        id: 'tag',
        label: VIEWS.tag,
        kind: 'multi',
        options: distinct(recipes.flatMap((r) => r.tags)).map((t) => ({ value: t, label: t })),
        test: (g, v) => g.recipe.tags.some((t) => multi(v).includes(t)),
      },
      { id: 'playing', label: VIEWS.playingNow, kind: 'toggle', test: (g) => g.playing },
    ],
    sorts: [
      { id: 'name', label: VIEWS.name, compare: (a, b) => compareText(a.recipe.name, b.recipe.name) },
      { id: 'teams', label: VIEWS.teams, compare: (a, b) => a.recipe.teams.length - b.recipe.teams.length, defaultDesc: true },
      { id: 'questions', label: VIEWS.questions, compare: (a, b) => a.questions - b.questions, defaultDesc: true },
      { id: 'changed', label: VIEWS.changed, compare: (a, b) => a.recipe.updatedAt - b.recipe.updatedAt, defaultDesc: true },
      { id: 'created', label: VIEWS.created, compare: (a, b) => a.recipe.createdAt - b.recipe.createdAt, defaultDesc: true },
    ],
    groups: [
      {
        id: 'folder',
        label: VIEWS.folder,
        groupsOf: (g) => (g.recipe.folder ? [{ key: `f:${g.recipe.folder}`, label: g.recipe.folder, order: g.recipe.folder }] : [{ key: '~none', label: VIEWS.noFolder, order: 0, last: true }]),
      },
      {
        id: 'status',
        label: VIEWS.status,
        groupsOf: (g) =>
          g.playing
            ? [{ key: 'playing', label: VIEWS.playing, order: 0 }]
            : isArchived(g.recipe)
              ? [{ key: 'archived', label: VIEWS.archived, order: 2 }]
              : [{ key: 'ready', label: VIEWS.ready, order: 1 }],
      },
    ],
    // As 1.0.2: the most recently changed game first.
    defaults: { sort: { id: 'changed', desc: true }, group: null, pageSize: 100 },
    tiebreak: (g) => g.recipe.name,
    changedAt: (g) => g.recipe.updatedAt,
    isArchived: (g) => isArchived(g.recipe),
  }
}

// ---- Operators -------------------------------------------------------------

export interface OperatorItem {
  readonly operator: Operator
  readonly active: boolean
}

export const operatorsSpec: ListSpec<OperatorItem> = {
  tab: 'operators',
  noun: { one: 'operator', many: 'operators' },
  filters: [
    { id: 'pin', label: VIEWS.hasPin, kind: 'toggle', test: (o) => o.operator.pinHash !== null },
    { id: 'active', label: VIEWS.activeOperator, kind: 'toggle', test: (o) => o.active },
  ],
  sorts: [
    { id: 'name', label: VIEWS.name, compare: (a, b) => compareText(a.operator.displayName, b.operator.displayName) },
    { id: 'playsRun', label: VIEWS.playsRun, compare: (a, b) => a.operator.playsRun - b.operator.playsRun, defaultDesc: true },
    { id: 'lastActive', label: VIEWS.lastActive, compare: (a, b) => (a.operator.lastActiveAt as number) - (b.operator.lastActiveAt as number), nullable: (o) => o.operator.lastActiveAt === null, defaultDesc: true },
    { id: 'created', label: VIEWS.created, compare: (a, b) => a.operator.createdAt - b.operator.createdAt, defaultDesc: true },
  ],
  groups: [],
  defaults: { sort: { id: 'name', desc: false }, group: null, pageSize: 100 },
  tiebreak: (o) => o.operator.displayName,
  changedAt: (o) => o.operator.updatedAt,
  isArchived: (o) => isArchived(o.operator),
}
