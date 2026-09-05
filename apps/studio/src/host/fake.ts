/**
 * An in-memory host for tests and for the browser-only dev server.
 *
 * It is the second adapter behind `HostTransport`: the same verbs, the same
 * events, a library kept in maps. It implements only what the library tabs
 * need — `catalog_*`, `recipe_*`, `referenced_by`, `settings_get`,
 * `settings_set_global`, `monitors_list`, `play_list`, `get_state` — and
 * refuses everything else with a `HostError`, the way the real host refuses a
 * command it will not run.
 *
 * It is not a second engine: no Play can be started here. `play-state` is
 * only ever what a test hands to `emit`.
 */

import type { Command, EventName, PlayStateForMain } from '@questiongame/contract'
import type { HostError, HostTransport } from './host'
import type {
  ArchiveScope,
  CatalogItem,
  GlobalSetting,
  LibraryKind,
  Recipe,
  SettingsView,
  GameSettings,
} from './types'

type Handler = (payload: unknown) => void

export interface FakeHost extends HostTransport {
  /** Fire an event as the host would. */
  emit(name: EventName, payload: unknown): void
  /** Seed rows without going through a command (no event). */
  seed(items: CatalogItem[], recipes?: Recipe[]): void
  /** Every command that reached the fake, in order. */
  readonly calls: Array<{ name: Command; args: Record<string, unknown> | undefined }>
  /** The current documents, for assertions. */
  readonly library: Map<string, CatalogItem>
  readonly recipes: Map<string, Recipe>
  playState: PlayStateForMain | null
}

const now = () => Date.now()

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  scoring: {
    mode: 'difficulty',
    flat_points: 10,
    difficulty_map: { kind: 'linear', factor: 1 },
    speed_weight: 0,
    lock_speed_enabled: false,
    lock_speed_base: 'difficulty',
  },
  judging: { partial_credit: false, order_matters: false },
  turn: { max_consecutive_correct: null, bonus_after_consecutive: null },
  timer: { enabled: null, duration_ms: null },
  reveal: { question: 'operator', answers: 'operator', outcome: 'operator', leaderboard: 'operator' },
}

function refuse(code: string, message: string): never {
  throw { code, message } satisfies HostError
}

function key(kind: string, id: string): string {
  return `${kind}:${id}`
}

function inScope(archivedAt: number | null, scope: ArchiveScope): boolean {
  if (scope === 'all') return true
  return scope === 'active' ? archivedAt === null : archivedAt !== null
}

export function createFakeHost(): FakeHost {
  const listeners = new Map<EventName, Set<Handler>>()
  const library = new Map<string, CatalogItem>()
  const recipes = new Map<string, Recipe>()
  const calls: FakeHost['calls'] = []
  let activeOperatorId: string | null = null
  let globalsTimer = { enabled: true as boolean | null, duration_ms: 30_000 as number | null }

  const emit = (name: EventName, payload: unknown) => {
    for (const h of listeners.get(name) ?? []) h(payload)
  }

  const stamp = <T extends { archivedAt: number | null; createdAt: number; updatedAt: number }>(
    row: T,
    existing: T | undefined,
  ): T => ({
    ...row,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
    archivedAt: existing?.archivedAt ?? null,
  })

  const upsert = (item: CatalogItem): CatalogItem => {
    const k = key(item.kind, item.item.id)
    const existing = library.get(k)
    const stamped = {
      kind: item.kind,
      item: stamp(item.item as never, existing?.item as never),
    } as CatalogItem
    library.set(k, stamped)
    return stamped
  }

  const setArchived = (kind: LibraryKind, id: string, at: number | null) => {
    const k = key(kind, id)
    const row = library.get(k)
    if (!row) refuse('catalog', `${kind} ${id} not found`)
    library.set(k, { kind: row.kind, item: { ...row.item, archivedAt: at } } as CatalogItem)
  }

  const settingsView = (): SettingsView => ({
    globals: {
      timer: globalsTimer,
      game_defaults: DEFAULT_GAME_SETTINGS,
      control: {
        override_after_lock: 'refuse_until_reveal',
        reveal: DEFAULT_GAME_SETTINGS.reveal,
        overlay_animations_enabled: true,
        viewer_hit_targets: true,
        mosaic_density: 'comfortable',
        stage_monitor_id: null,
        stats_monitor_id: null,
        stage_reattach: 'ask',
      },
      features: { audio: true, audio_synth: false, search: true, statistics: true },
      shortcuts: {},
      active_operator_id: activeOperatorId,
    },
    currentGame: null,
    control: {
      override_after_lock: 'refuse_until_reveal',
      reveal: DEFAULT_GAME_SETTINGS.reveal,
      overlay_animations_enabled: true,
      viewer_hit_targets: true,
      mosaic_density: 'comfortable',
      stage_monitor_id: null,
      stats_monitor_id: null,
      stage_reattach: 'ask',
    },
    gameAffectingFrozen: false,
    disabled: [],
  })

  const bumpRecipe = (recipe: Recipe): Recipe => {
    const existing = recipes.get(recipe.id)
    const next = { ...stamp(recipe, existing), rev: (existing?.rev ?? 0) + 1 }
    recipes.set(recipe.id, next)
    emit('recipe-changed', { id: next.id, rev: next.rev })
    return next
  }

  const commands: Partial<Record<Command, (args: Record<string, unknown>) => unknown>> = {
    catalog_list: (a) => {
      const kind = a.kind as LibraryKind
      const scope = a.scope as ArchiveScope
      if ((kind as string) === 'recipe') refuse('catalog', 'recipes have their own verbs')
      return [...library.values()].filter((r) => r.kind === kind && inScope(r.item.archivedAt, scope))
    },
    catalog_get: (a) => {
      const row = library.get(key(a.kind as string, a.id as string))
      if (!row) refuse('catalog', `${a.kind} ${a.id} not found`)
      return row
    },
    catalog_upsert: (a) => {
      const item = a.item as CatalogItem
      validate(item)
      const stored = upsert(item)
      const change = { kind: stored.kind, id: stored.item.id, op: 'upserted' as const }
      emit('catalog-changed', change)
      return change
    },
    catalog_upsert_many: (a) => {
      const items = a.items as CatalogItem[]
      items.forEach(validate)
      const changes = items.map((i) => {
        const stored = upsert(i)
        return { kind: stored.kind, id: stored.item.id, op: 'upserted' as const }
      })
      changes.forEach((c) => emit('catalog-changed', c))
      return changes
    },
    catalog_archive: (a) => {
      setArchived(a.kind as LibraryKind, a.id as string, now())
      const change = { kind: a.kind, id: a.id, op: 'archived' as const }
      emit('catalog-changed', change)
      return change
    },
    catalog_archive_many: (a) => {
      const ids = a.ids as string[]
      ids.forEach((id) => setArchived(a.kind as LibraryKind, id, now()))
      const changes = ids.map((id) => ({ kind: a.kind, id, op: 'archived' as const }))
      changes.forEach((c) => emit('catalog-changed', c))
      return changes
    },
    catalog_restore: (a) => {
      setArchived(a.kind as LibraryKind, a.id as string, null)
      const change = { kind: a.kind, id: a.id, op: 'restored' as const }
      emit('catalog-changed', change)
      return change
    },
    catalog_restore_many: (a) => {
      const ids = a.ids as string[]
      ids.forEach((id) => setArchived(a.kind as LibraryKind, id, null))
      const changes = ids.map((id) => ({ kind: a.kind, id, op: 'restored' as const }))
      changes.forEach((c) => emit('catalog-changed', c))
      return changes
    },
    catalog_search: (a) => {
      const q = a.query as { text: string; kinds: string[]; scope: ArchiveScope; limit: number }
      const needle = q.text.toLowerCase()
      return [...library.values()]
        .filter((r) => (q.kinds.length === 0 || q.kinds.includes(r.kind)) && inScope(r.item.archivedAt, q.scope))
        .filter((r) => JSON.stringify(r.item).toLowerCase().includes(needle))
        .slice(0, q.limit)
        .map((r) => ({ kind: r.kind, id: r.item.id, score: 1 }))
    },
    referenced_by: (a) => {
      const id = a.id as string
      for (const recipe of recipes.values()) {
        if (a.kind === 'team' && recipe.teams.includes(id)) return 'recipe'
        if (a.kind === 'domain' && recipe.board.some((b) => b.domainId === id)) return 'recipe'
        if (a.kind === 'question' && recipe.board.some((b) => b.questionIds.includes(id))) return 'recipe'
      }
      if (a.kind === 'question') {
        for (const row of library.values()) {
          if (row.kind === 'domain' && row.item.questions.some((m) => m.questionId === id)) return 'domain'
        }
      }
      return null
    },
    recipe_list: (a) => [...recipes.values()].filter((r) => inScope(r.archivedAt, a.scope as ArchiveScope)),
    recipe_get: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      return r
    },
    recipe_new: (a) => {
      const recipe: Recipe = {
        id: a.id as string,
        name: a.name as string,
        folder: null,
        tags: [],
        teams: [],
        board: [],
        settings: DEFAULT_GAME_SETTINGS,
        layout: {},
        overlays: { teams: {}, domains: {}, questions: {} },
        rev: 0,
        createdAt: 0,
        updatedAt: 0,
        archivedAt: null,
      }
      return bumpRecipe(recipe)
    },
    recipe_upsert: (a) => {
      const r = a.recipe as Recipe
      if (!r.name.trim()) refuse('catalog', `recipe.${r.id}.name: a recipe needs a name`)
      const next = bumpRecipe(r)
      return { id: next.id, rev: next.rev }
    },
    recipe_duplicate: (a) => {
      const source = recipes.get(a.id as string)
      if (!source) refuse('catalog', `recipe ${a.id} not found`)
      return bumpRecipe({ ...source, id: a.newId as string, name: a.newName as string, rev: 0 })
    },
    recipe_archive: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      recipes.set(r.id, { ...r, archivedAt: now() })
      const change = { kind: 'recipe', id: r.id, op: 'archived' as const }
      emit('catalog-changed', change)
      return change
    },
    recipe_restore: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      recipes.set(r.id, { ...r, archivedAt: null })
      const change = { kind: 'recipe', id: r.id, op: 'restored' as const }
      emit('catalog-changed', change)
      return change
    },
    recipe_set_membership: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      const next = bumpRecipe({ ...r, teams: a.teams as string[], board: a.board as Recipe['board'] })
      return { id: next.id, rev: next.rev }
    },
    recipe_set_settings: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      const next = bumpRecipe({ ...r, settings: a.settings as GameSettings })
      return { id: next.id, rev: next.rev }
    },
    recipe_set_overlay: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      const target = a.target as { target: 'team' | 'domain' | 'question'; id: string; patch: unknown }
      const bucket = `${target.target}s` as keyof Recipe['overlays']
      const overlays = { ...r.overlays, [bucket]: { ...r.overlays[bucket] } } as Recipe['overlays']
      const map = overlays[bucket] as Record<string, unknown>
      if (a.scope === 'original') {
        delete map[target.id]
        const row = library.get(key(target.target, target.id))
        if (row && target.patch) {
          const patched = Object.fromEntries(
            Object.entries(target.patch as Record<string, unknown>).filter(([, v]) => v !== null && v !== undefined),
          )
          upsert({ kind: row.kind, item: { ...row.item, ...patched } } as CatalogItem)
          emit('catalog-changed', { kind: row.kind, id: row.item.id, op: 'upserted' })
        }
      } else if (target.patch === null) {
        delete map[target.id]
      } else {
        map[target.id] = target.patch
      }
      const next = bumpRecipe({ ...r, overlays })
      return { id: next.id, rev: next.rev }
    },
    settings_get: () => settingsView(),
    settings_set_global: (a) => {
      const setting = a.setting as GlobalSetting
      if (setting.key === 'active_operator_id') {
        if (setting.value !== null) {
          const row = library.get(key('operator', setting.value))
          if (!row) refuse('catalog', `operator ${setting.value} not found`)
          if (row.item.archivedAt !== null) refuse('match', 'an archived operator cannot be active')
        }
        activeOperatorId = setting.value
      } else if (setting.key === 'timer_enabled') {
        globalsTimer = { ...globalsTimer, enabled: setting.value }
      } else if (setting.key === 'timer_duration_ms') {
        globalsTimer = { ...globalsTimer, duration_ms: setting.value }
      }
      return null
    },
    monitors_list: () => [
      { key: 'primary', name: 'Built-in display', primary: true, position: [0, 0], size: [1920, 1080], scaleFactor: 1 },
    ],
    play_list: () => [],
    play_events: () => [],
    get_state: () => fake.playState,
  }

  const fake: FakeHost = {
    calls,
    library,
    recipes,
    playState: null,
    emit,
    seed(items, seededRecipes = []) {
      items.forEach((i) => library.set(key(i.kind, i.item.id), i))
      seededRecipes.forEach((r) => recipes.set(r.id, r))
    },
    async invoke<T>(name: Command, args?: Record<string, unknown>): Promise<T> {
      calls.push({ name, args })
      const handler = commands[name]
      if (!handler) refuse('fake', `the fake host does not run ${name}`)
      return handler(args ?? {}) as T
    },
    async listen<T>(name: EventName, handler: (payload: T) => void): Promise<() => void> {
      const set = listeners.get(name) ?? new Set()
      listeners.set(name, set)
      const h = handler as Handler
      set.add(h)
      return () => set.delete(h)
    },
  }
  return fake
}

/** The host's §4.1 rules, mirrored so a page test sees the same refusals. */
function validate(item: CatalogItem): void {
  switch (item.kind) {
    case 'team':
      if (!item.item.name.trim()) refuse('catalog', `team.${item.item.id}.name: a team needs a name`)
      break
    case 'domain':
      if (!item.item.name.trim()) refuse('catalog', `domain.${item.item.id}.name: a domain needs a name`)
      break
    case 'question': {
      const q = item.item
      const path = `question.${q.id}`
      if (!q.stem.trim()) refuse('catalog', `${path}.stem: a question needs a stem`)
      if (q.options.length < 2) refuse('catalog', `${path}.options: a question needs at least two options`)
      if (!q.options.some((o) => o.correct)) refuse('catalog', `${path}.options: a question needs at least one correct mark`)
      if (q.difficulty < 1 || q.difficulty > 100) refuse('catalog', `${path}.difficulty: difficulty is 1-100`)
      break
    }
    case 'operator':
      if (!item.item.displayName.trim()) refuse('catalog', `operator.${item.item.id}.name: an operator needs a display name`)
      break
    case 'asset':
      break
  }
}
