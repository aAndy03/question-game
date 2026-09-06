/**
 * An in-memory host for tests and for the browser-only dev server.
 *
 * It is the second adapter behind `HostTransport`: the same verbs, the same
 * events, a library kept in maps. It implements what the library tabs, the
 * Settings tab and first run call — `catalog_*` (the Demo seed included),
 * `recipe_*`, `referenced_by`, the settings document, shortcuts, pins,
 * `operator_activate`, the gated data commands, paths, health, monitors,
 * `play_list`, `get_state` — and refuses everything else with a `HostError`,
 * the way the real host refuses a command it will not run.
 *
 * It is not a second engine: no Play can be started here. `play-state` is
 * only ever what a test hands to `emit` or sets on `playState`; the gated
 * commands read that field for "a Play is open" (§12.3).
 *
 * Pins: the host hashes with argon2id; the fake stores `fake:<pin>`. Neither
 * ever reaches the webview as anything but "pinned" (§2.15).
 */

import { DEFAULT_AUDIO, type Command, type EventName, type PlayStateForMain } from '@questiongame/contract'
import type { HostError, HostTransport } from './host'
import type {
  AppPaths,
  ArchiveScope,
  AudioSettings,
  CatalogItem,
  ControlSettings,
  Disabled,
  FeatureRoots,
  GameSetting,
  GameSettings,
  GlobalSetting,
  HealthReport,
  LibraryKind,
  Operator,
  PlayRecord,
  Recipe,
  SeedMode,
  SeedResult,
  SeedStatus,
  SettingsView,
  StatsQuery,
  StatsResult,
} from './types'
import { SEED_RECIPE_ID, sameBody, seedLibrary, seedRecipe } from './fake/seed'

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
  /** Closed Plays — what `play_list` returns and `wipe_plays` removes. */
  plays: PlayRecord[]
  playState: PlayStateForMain | null
  /** What `health_get` answers; a test sets it and then `emit('health', …)`. */
  health: HealthReport
  /**
   * What `stats_query` answers (§11.K). A canned result, not a second fold:
   * the arithmetic is the host's and is tested there, so what a Studio test
   * needs from the fake is *an* answer plus the query that asked for it —
   * which `calls` already records.
   */
  stats: StatsResult
  /** Set by `uninstall_data` — the fake cannot quit, so it leaves a flag. */
  uninstalled: boolean
}

const now = () => Date.now()

export const FAKE_PATHS: AppPaths = {
  userData: 'C:\\Users\\operator\\AppData\\Roaming\\com.questiongame.app',
  catalog: 'C:\\Users\\operator\\AppData\\Roaming\\com.questiongame.app\\catalog.sqlite',
  cuePack: 'C:\\Program Files\\questiongame\\resources\\stage\\audio',
}

const DEFAULT_CONTROL: ControlSettings = {
  override_after_lock: 'refuse_until_reveal',
  reveal: { question: 'operator', answers: 'operator', outcome: 'operator', leaderboard: 'operator' },
  overlay_animations_enabled: true,
  viewer_hit_targets: true,
  mosaic_density: 'comfortable',
  stage_monitor_id: null,
  stats_monitor_id: null,
  stage_reattach: 'ask',
  audio: DEFAULT_AUDIO,
}

const DEFAULT_FEATURES: FeatureRoots = { audio: true, audio_synth: false, search: true, statistics: true }

/** The keys §4.2 marks *Game, frozen* — the same list as `flags::GAME_AFFECTING_KEYS`. */
const GAME_AFFECTING_KEYS = [
  'scoring.mode',
  'scoring.flat_points',
  'scoring.difficulty_map',
  'scoring.speed_weight',
  'scoring.lock_speed.enabled',
  'scoring.lock_speed_base',
  'turn.max_consecutive_correct',
  'turn.bonus_after_consecutive',
  'judging.partial_credit',
  'judging.order_matters',
  'timer.enabled',
  'timer.duration_ms',
] as const

/** The empty answer: what a fresh library has to say about a Play nobody ran. */
const EMPTY_STATS: StatsResult = {
  groupBy: 'team',
  metrics: ['turns', 'correct', 'accuracy', 'points'],
  rows: [],
  totals: { key: '', label: '', values: [0, 0, null, 0], turns: 0, plays: 0 },
  playCount: 0,
  turnCount: 0,
}

const PIN = /^[0-9]{4,8}$/
/** The fake's "hash" — never shown, only compared. */
const hashPin = (pin: string) => `fake:${pin}`

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
  let gameDefaults: GameSettings = DEFAULT_GAME_SETTINGS
  let control: ControlSettings = DEFAULT_CONTROL
  let features: FeatureRoots = DEFAULT_FEATURES
  let shortcuts: Record<string, string> = {}

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

  /** The gated commands' first check (§12.3): nothing here can reach a Play. */
  const playOpen = () => {
    const status = fake.playState?.status
    return status === 'loaded' || status === 'playing' || status === 'paused'
  }

  const operatorRow = (id: string): Operator => {
    const row = library.get(key('operator', id))
    if (!row || row.kind !== 'operator') refuse('catalog', `operator ${id} not found`)
    return row.item
  }

  /** `PinRequired` / wrong pin, spelled as the host does (`operator.<id>.pin`). */
  const verifyPin = (operator: Operator, pin: string | null | undefined) => {
    if (operator.pinHash === null) return
    if (!pin) refuse('catalog', `operator.${operator.id}.pin: a pin is required`)
    if (operator.pinHash !== hashPin(pin)) refuse('catalog', `operator.${operator.id}.pin: wrong pin`)
  }

  /** Wipe and uninstall ask the *active* operator's pin, when one is set. */
  const verifyActivePin = (pin: string | null | undefined) => {
    if (activeOperatorId === null) return
    const row = library.get(key('operator', activeOperatorId))
    if (row?.kind === 'operator') verifyPin(row.item, pin)
  }

  const settingsView = (): SettingsView => ({
    globals: {
      timer: globalsTimer,
      game_defaults: gameDefaults,
      control,
      features,
      shortcuts,
      active_operator_id: activeOperatorId,
    },
    currentGame: null,
    control,
    gameAffectingFrozen: playOpen(),
    disabled: disabledKeys(),
  })

  /**
   * The §4.2 `disabled` list, as much of it as a host with no recipe in
   * Control can have: the freeze while a Play is open, and the audio feature
   * graph. The inert interlocks need `currentGame`, which the fake never
   * loads — Studio reads the reason, it never recomputes one, so what matters
   * here is that a reason arrives at all.
   */
  const disabledKeys = (): Disabled[] => {
    const out: Disabled[] = []
    if (!features.audio) out.push({ key: 'feat.audio.synth', reason: 'feature_off', detail: 'feat.audio' })
    if (playOpen()) for (const key of GAME_AFFECTING_KEYS) out.push({ key, reason: 'frozen' })
    return out
  }

  const setAudio = (patch: Partial<AudioSettings>) => {
    control = { ...control, audio: { ...control.audio, ...patch } }
  }

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
        origin: 'operator',
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
    recipe_set_layout: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      const next = bumpRecipe({ ...r, layout: a.layout as Recipe['layout'] })
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
    catalog_seed_demo: (a) => {
      const mode = a.mode as SeedMode
      let inserted = 0
      let overwritten = 0
      for (const item of seedLibrary()) {
        const k = key(item.kind, item.item.id)
        const existing = library.get(k)
        if (!existing) {
          upsert(item)
          inserted += 1
        } else if (mode === 'overwrite') {
          upsert(item)
          setArchived(item.kind as LibraryKind, item.item.id, null)
          overwritten += 1
        } else if (existing.item.archivedAt !== null) {
          // `missing` restores an archived seed row and keeps its edits.
          setArchived(item.kind as LibraryKind, item.item.id, null)
        } else {
          continue
        }
        emit('catalog-changed', { kind: item.kind, id: item.item.id, op: 'upserted' })
      }
      const recipe = seedRecipe(gameDefaults)
      const existing = recipes.get(recipe.id)
      if (!existing) {
        bumpRecipe(recipe)
        inserted += 1
      } else if (mode === 'overwrite') {
        bumpRecipe({ ...recipe, archivedAt: null })
        overwritten += 1
      } else if (existing.archivedAt !== null) {
        bumpRecipe({ ...existing, archivedAt: null })
      }
      return { recipeId: SEED_RECIPE_ID, inserted, overwritten } satisfies SeedResult
    },
    catalog_seed_status: () => {
      const status = { present: 0, missing: 0, edited: 0 }
      const count = (stored: unknown, shipped: unknown) => {
        if (!stored) status.missing += 1
        else {
          status.present += 1
          if (!sameBody(stored, shipped)) status.edited += 1
        }
      }
      for (const item of seedLibrary()) count(library.get(key(item.kind, item.item.id))?.item, item.item)
      count(recipes.get(SEED_RECIPE_ID), seedRecipe(gameDefaults))
      return status satisfies SeedStatus
    },
    catalog_rebuild_search: () => ({ indexed: library.size }),
    wipe_plays: (a) => {
      if (playOpen()) refuse('match', 'a Play is open')
      verifyActivePin(a.pin as string | null | undefined)
      const removed = fake.plays.length
      const touched = new Set(fake.plays.map((p) => p.recipeId))
      fake.plays = []
      touched.forEach((id) => emit('catalog-changed', { kind: 'recipe', id, op: 'upserted' }))
      return { removed }
    },
    operator_set_pin: (a) => {
      const id = a.id as string
      const pin = a.pin as string | null
      const operator = operatorRow(id)
      if (pin !== null && !PIN.test(pin)) refuse('catalog', `operator.${id}.pin: a pin is 4-8 digits`)
      // Changing or clearing an existing pin proves the old one first.
      verifyPin(operator, a.currentPin as string | null | undefined)
      upsert({ kind: 'operator', item: { ...operator, pinHash: pin === null ? null : hashPin(pin) } })
      emit('catalog-changed', { kind: 'operator', id, op: 'upserted' })
      return null
    },
    operator_activate: (a) => {
      const id = a.id as string
      const operator = operatorRow(id)
      if (operator.archivedAt !== null) refuse('match', 'an archived operator cannot be active')
      verifyPin(operator, a.pin as string | null | undefined)
      activeOperatorId = id
      upsert({ kind: 'operator', item: { ...operator, lastActiveAt: now() } })
      emit('catalog-changed', { kind: 'operator', id, op: 'upserted' })
      return null
    },
    uninstall_data: (a) => {
      if (playOpen()) refuse('match', 'a Play is open')
      verifyActivePin(a.pin as string | null | undefined)
      fake.uninstalled = true
      return null
    },
    paths_get: () => FAKE_PATHS,
    paths_reveal: () => null,
    health_get: () => fake.health,
    // Read-only by construction: there is no stats verb that writes (§11.K).
    stats_query: (a) => {
      const query = (a.query ?? {}) as StatsQuery
      return {
        ...fake.stats,
        groupBy: query.groupBy ?? fake.stats.groupBy,
        metrics: query.metrics?.length ? query.metrics : fake.stats.metrics,
      }
    },
    settings_get: () => settingsView(),
    settings_set_shortcut: (a) => {
      const cmd = a.command as string
      const chord = a.chord as string | null
      if (chord === null) {
        shortcuts = Object.fromEntries(Object.entries(shortcuts).filter(([other]) => other !== cmd))
        return null
      }
      const taken = Object.entries(shortcuts).find(([other, bound]) => other !== cmd && bound === chord)
      if (taken) refuse('catalog', 'shortcuts: that chord is already bound to another command')
      shortcuts = { ...shortcuts, [cmd]: chord }
      return null
    },
    settings_set_global: (a) => {
      const setting = a.setting as GlobalSetting
      switch (setting.key) {
        case 'active_operator_id': {
          if (setting.value !== null) {
            const row = library.get(key('operator', setting.value))
            if (!row) refuse('catalog', `operator ${setting.value} not found`)
            if (row.item.archivedAt !== null) refuse('match', 'an archived operator cannot be active')
          }
          activeOperatorId = setting.value
          break
        }
        case 'timer_enabled':
          globalsTimer = { ...globalsTimer, enabled: setting.value }
          break
        case 'timer_duration_ms':
          globalsTimer = { ...globalsTimer, duration_ms: setting.value }
          break
        case 'game':
          gameDefaults = applyGameSetting(gameDefaults, setting.value)
          break
        case 'reveal':
          control = { ...control, reveal: { ...control.reveal, [setting.value[0]]: setting.value[1] } }
          break
        case 'override_after_lock':
        case 'overlay_animations_enabled':
        case 'viewer_hit_targets':
        case 'mosaic_density':
        case 'stage_monitor_id':
        case 'stats_monitor_id':
        case 'stage_reattach':
          control = { ...control, [setting.key]: setting.value }
          break
        case 'feature': {
          // `feat.audio.synth` and `audio_synth` name the same root.
          const root = setting.value[0].replace(/^feat\./, '').replace(/\./g, '_') as keyof FeatureRoots
          if (!(root in features)) refuse('catalog', `feature ${setting.value[0]} not found`)
          features = { ...features, [root]: setting.value[1] }
          break
        }
        case 'audio_volume':
          if (setting.value < 0 || setting.value > 100) refuse('catalog', 'audio.volume: volume is 0-100')
          setAudio({ volume: setting.value })
          break
        case 'audio_muted':
          setAudio({ muted: setting.value })
          break
        case 'audio_cue':
          setAudio({ cues: { ...control.audio.cues, [setting.value[0]]: setting.value[1] } })
          break
      }
      return null
    },
    monitors_list: () => [
      { key: 'primary', name: 'Built-in display', primary: true, position: [0, 0], size: [1920, 1080], scaleFactor: 1 },
    ],
    stage_set_monitor: (a) => {
      control = { ...control, stage_monitor_id: (a.monitorId as string | null | undefined) ?? null }
      return null
    },
    stage_open: () => null,
    play_list: (a) => {
      const recipeId = (a.recipeId as string | null | undefined) ?? null
      return recipeId === null ? fake.plays : fake.plays.filter((p) => p.recipeId === recipeId)
    },
    play_events: () => [],
    get_state: () => fake.playState,
  }

  const fake: FakeHost = {
    calls,
    library,
    recipes,
    plays: [],
    playState: null,
    health: { status: 'ok', items: [] },
    stats: EMPTY_STATS,
    uninstalled: false,
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

/** One `settings_set_current_game` key applied to a B5 document (`game_defaults`). */
function applyGameSetting(g: GameSettings, s: GameSetting): GameSettings {
  switch (s.key) {
    case 'scoring_mode':
      return { ...g, scoring: { ...g.scoring, mode: s.value } }
    case 'flat_points':
      return { ...g, scoring: { ...g.scoring, flat_points: s.value } }
    case 'difficulty_map':
      return { ...g, scoring: { ...g.scoring, difficulty_map: s.value } }
    case 'speed_weight':
      return { ...g, scoring: { ...g.scoring, speed_weight: s.value } }
    case 'lock_speed_enabled':
      return { ...g, scoring: { ...g.scoring, lock_speed_enabled: s.value } }
    case 'lock_speed_base':
      return { ...g, scoring: { ...g.scoring, lock_speed_base: s.value } }
    case 'max_consecutive_correct':
      return { ...g, turn: { ...g.turn, max_consecutive_correct: s.value } }
    case 'bonus_after_consecutive':
      return { ...g, turn: { ...g.turn, bonus_after_consecutive: s.value } }
    case 'partial_credit':
      return { ...g, judging: { ...g.judging, partial_credit: s.value } }
    case 'order_matters':
      return { ...g, judging: { ...g.judging, order_matters: s.value } }
    case 'timer_enabled':
      return { ...g, timer: { ...g.timer, enabled: s.value } }
    case 'timer_duration_ms':
      return { ...g, timer: { ...g.timer, duration_ms: s.value } }
    case 'reveal':
      return { ...g, reveal: { ...g.reveal, [s.value[0]]: s.value[1] } }
  }
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
