/**
 * An in-memory host for tests and for the browser-only dev server.
 *
 * It is the second adapter behind `HostTransport`: the same verbs, the same
 * events, a library kept in maps. It implements what the library tabs, the
 * Settings tab and first run call — `catalog_*` (both Demo seeds and the
 * import included),
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

import { DEFAULT_AUDIO, type Command, type EventName, type MonitorInfo, type PlayStateForMain } from '@questiongame/contract'
import type { HostError, HostTransport } from './host'
import type {
  AppPaths,
  UpdateStatus,
  ArchiveScope,
  AudioSettings,
  BoardSettings,
  CatalogItem,
  ControlSettings,
  Disabled,
  FeatureRoots,
  GameSetting,
  GameSettings,
  GlobalSetting,
  HealthReport,
  ImportReport,
  ItemOf,
  LibraryKind,
  Operator,
  PlayRecord,
  Question,
  QuestionOverlay,
  Recipe,
  SeedDemo,
  SeedMode,
  SeedResult,
  SeedStatus,
  SettingsView,
  StatsQuery,
  StatsResult,
} from './types'
import { FAKE_LEDGER, FAKE_PREVIEW } from './fake/preview'
import { ImportRefused, planImport } from './fake/import'
import { SEED_RECIPE_IDS, sameBody, seedLibrary, seedRecipe } from './fake/seed'
import { bodyGaps, effectiveBody } from './question'

type Handler = (payload: unknown) => void

export interface FakeHost extends HostTransport {
  /** Fire an event as the host would. */
  emit(name: EventName, payload: unknown): void
  /** Seed rows without going through a command (no event). */
  seed(items: CatalogItem[], recipes?: Recipe[]): void
  /**
   * How many subscriptions are live — all of them, or one event's.
   *
   * The real host holds its JS listeners on the Rust side until `unlisten`, so
   * one left behind is one the host keeps emitting to. This is how a test sees
   * that.
   */
  listenerCount(name?: EventName): number
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
  /** The Statistics window: the fake has no desktop, so it has a boolean. */
  statsOpen: boolean
  /** And the Stage window, the same way. `stage_open` sets it. */
  stageOpen: boolean
  /** What `paths_get` answers; a test may replace it. */
  paths: AppPaths
  /** What `update_check` answers (P12.9); `offline` refuses as the host does when GitHub cannot be reached. */
  update: UpdateStatus | 'offline'
  /** `updates.check_on_start` (P12.9). */
  updatesOnStart: boolean
  /** The versions `update_open_release` was asked to open. */
  readonly openedReleases: string[]
  /** Where What's new starts (P12.10); `whats_new_seen` moves it to 1.0.2. */
  whatsNewSince: string | null
  readonly marker: typeof FAKE_HOST_MARKER
  /** The close guard's answers (P12.2): the fake cannot quit, so it counts. */
  quits: number
  closeCancels: number
  /** Set by `app_uninstall`. */
  uninstallerStarted: boolean
}

const now = () => Date.now()

/** Found by `scripts/release-check.ts` if the fake host ever ships (P12.3). */
export const FAKE_HOST_MARKER = '__QG_FAKE_HOST__'

export const FAKE_PATHS: AppPaths = {
  userData: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop',
  catalog: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\questiongame.sqlite3',
  logFile: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\questiongame.log',
  perfDir: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\perf',
  backups: 'C:\\Users\\operator\\AppData\\Roaming\\org.questiongame.desktop\\backups',
  cuePack: 'C:\\questiongame\\packages\\design-stage\\audio',
  uninstaller: null,
}

const DEFAULT_CONTROL: ControlSettings = {
  override_after_lock: 'refuse_until_reveal',
  reveal: { question: 'operator', answers: 'operator', outcome: 'operator', leaderboard: 'operator' },
  overlay_animations_enabled: true,
  viewer_hit_targets: true,
  mosaic_density: 'comfortable',
  stage_monitor_id: null,
  stage_mirror_ids: [],
  stats_monitor_id: null,
  stats_fullscreen: true,
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
  'scoring.speed_window',
  'scoring.speed_steps',
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
  turns: [],
}

/**
 * Two displays: a 1:1 built-in, and the case that matters — a 1080p TV at
 * Windows' default 150% for an external, where the logical size (1280×720, the
 * CSS viewport Stage gets) and the physical one (1920×1080, what the operator
 * calls it) part company.
 */
const FAKE_MONITORS: MonitorInfo[] = [
  {
    key: 'primary',
    name: 'Built-in display',
    primary: true,
    position: [0, 0],
    size: [1920, 1080],
    physicalSize: [1920, 1080],
    scaleFactor: 1,
    friendlyName: null,
    alsoOn: [],
  },
  {
    key: 'tv@1920x1080',
    name: 'Living-room TV',
    primary: false,
    position: [1920, 0],
    size: [1280, 720],
    physicalSize: [1920, 1080],
    scaleFactor: 1.5,
    friendlyName: null,
    alsoOn: [],
  },
]

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
    speed_window: { kind: 'fraction', value: 1 },
    speed_steps: null,
  },
  judging: { partial_credit: false, order_matters: false },
  turn: { max_consecutive_correct: null, bonus_after_consecutive: null },
  timer: { enabled: null, duration_ms: null },
  reveal: { question: 'operator', answers: 'operator', outcome: 'operator', leaderboard: 'operator' },
  language: 'en',
  board: { allow_repeated_difficulty: false },
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

  /** The display picture, after anything that changes it (§9, P11.11). */
  const emitMonitors = () => {
    emit('monitors-changed', {
      monitors: FAKE_MONITORS,
      stageMonitorId: control.stage_monitor_id,
      stageMirrors: control.stage_mirror_ids,
      // Resolved the way the host resolves it: `null` only when there is no
      // Stage window, the primary display's key when it is on primary.
      stageOn: fake.stageOpen
        ? (control.stage_monitor_id ?? (FAKE_MONITORS.find((m) => m.primary)?.key ?? null))
        : null,
      stageOpen: fake.stageOpen,
      statsMonitorId: control.stats_monitor_id,
      statsOpen: fake.statsOpen,
    })
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
      updates: { check_on_start: fake.updatesOnStart },
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

  /**
   * The board rules as the host runs them in `recipe_upsert` and
   * `recipe_set_overlay` (P11.13, §2.32): every selected question complete on
   * its effective body, and one question per difficulty per domain. `pending`
   * is the catalog row an `original` edit is about to write. A fake that never
   * refuses is exactly the fake a shell passes against and the app rejects.
   */
  const checkBoard = (recipe: Recipe, pending?: Question) => {
    // A recipe written before P12.7 has no `board` key; the host reads it as off.
    const allowRepeats = (recipe.settings.board as BoardSettings | undefined)?.allow_repeated_difficulty === true
    for (const board of recipe.board) {
      const claimed = new Map<number, string>()
      for (const qid of board.questionIds) {
        const row = library.get(key('question', qid))
        const question = pending?.id === qid ? pending : row?.kind === 'question' ? row.item : undefined
        if (!question) continue
        const body = effectiveBody(question, recipe.overlays.questions[qid])
        if (bodyGaps(body).length > 0) {
          refuse(
            'catalog',
            `recipe.${recipe.id}.board.${board.domainId}.question.${qid}: this question is incomplete; finish it in the library or take it off the board`,
          )
        }
        if (body.difficulty === null || allowRepeats) continue
        if (claimed.has(body.difficulty)) {
          refuse(
            'catalog',
            `recipe.${recipe.id}.board.${board.domainId}.difficulty.${body.difficulty}: two questions in this domain share a difficulty; turn on Allow repeated difficulties in Board, or keep one`,
          )
        }
        claimed.set(body.difficulty, qid)
      }
    }
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
      checkBoard(r)
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
      const board = a.board as Recipe['board']
      checkBoard({ ...r, board })
      const next = bumpRecipe({ ...r, teams: a.teams as string[], board })
      return { id: next.id, rev: next.rev }
    },
    recipe_set_settings: (a) => {
      const r = recipes.get(a.id as string)
      if (!r) refuse('catalog', `recipe ${a.id} not found`)
      // Every recipe write funnels through the board rule on the host, this one
      // included: switching repeats off on a board that holds them is refused.
      checkBoard({ ...r, settings: a.settings as GameSettings })
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

      // P11.13, §2.32, before anything is written — a refused write changes
      // nothing, and the `original` scope below would otherwise have already
      // touched the catalog row by the time the board was found illegal.
      if (target.target === 'question') {
        const patch = target.patch as QuestionOverlay | null
        const questions = { ...overlays.questions } as Record<string, QuestionOverlay>
        if (a.scope === 'original' || patch === null) delete questions[target.id]
        else questions[target.id] = patch
        const row = library.get(key('question', target.id))
        const pending: Question | undefined =
          a.scope === 'original' && patch && row?.kind === 'question'
            ? {
                ...row.item,
                ...(patch.stem != null ? { stem: patch.stem } : {}),
                ...(patch.options != null ? { options: patch.options } : {}),
                ...(patch.difficulty != null ? { difficulty: patch.difficulty } : {}),
              }
            : undefined
        checkBoard({ ...r, overlays: { ...overlays, questions } as Recipe['overlays'] }, pending)
      }

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
      const demo = (a.demo as SeedDemo | undefined) ?? 'en'
      const mode = a.mode as SeedMode
      let inserted = 0
      let overwritten = 0
      for (const item of seedLibrary(demo)) {
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
      const recipe = seedRecipe(demo, gameDefaults)
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
      return { recipeId: SEED_RECIPE_IDS[demo], inserted, overwritten } satisfies SeedResult
    },
    catalog_seed_status: (a) => {
      const demo = (a.demo as SeedDemo | undefined) ?? 'en'
      const status = { present: 0, missing: 0, edited: 0 }
      const count = (stored: unknown, shipped: unknown) => {
        if (!stored) status.missing += 1
        else {
          status.present += 1
          if (!sameBody(stored, shipped)) status.edited += 1
        }
      }
      for (const item of seedLibrary(demo)) count(library.get(key(item.kind, item.item.id))?.item, item.item)
      count(recipes.get(SEED_RECIPE_IDS[demo]), seedRecipe(demo, gameDefaults))
      return status satisfies SeedStatus
    },
    // §2.32 — the host's planner, mirrored (`fake/import.ts`). A preview
    // writes nothing; a commit writes the plan and announces each kind once.
    catalog_import_questions: (a) => {
      const active = <K extends LibraryKind>(kind: K) =>
        [...library.values()].filter((r) => r.kind === kind && r.item.archivedAt === null).map((r) => r.item as ItemOf<K>)
      let plan: ReturnType<typeof planImport>
      try {
        plan = planImport(
          a.text as string,
          { questions: active('question'), domains: active('domain') },
          (a.defaultDomainId as string | null | undefined) ?? null,
          () => crypto.randomUUID().replace(/-/g, '').slice(0, 8),
        )
      } catch (e) {
        if (e instanceof ImportRefused) refuse('catalog', e.message)
        throw e
      }
      if (a.commit !== true) return plan.report
      plan.questions.forEach((item) => upsert({ kind: 'question', item }))
      plan.domains.forEach((item) => upsert({ kind: 'domain', item }))
      if (plan.questions.length > 0) {
        emit('catalog-changed', { kind: 'question', id: '', op: 'upserted' })
        emit('catalog-changed', { kind: 'domain', id: '', op: 'upserted' })
      }
      return { ...plan.report, committed: true } satisfies ImportReport
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
    // The app itself (P12.2), refusing in the host's order.
    app_info: () => ({ version: '1.0.2', build: 'dev', identifier: 'org.questiongame.app' }),
    app_quit: () => {
      fake.quits += 1
      return null
    },
    app_close_cancelled: () => {
      fake.closeCancels += 1
      return null
    },
    app_uninstall: (a) => {
      if (!fake.paths.uninstaller) refuse('window', 'this copy was not installed by the Windows installer')
      if (playOpen()) refuse('match', 'a Play is open')
      verifyActivePin(a.pin as string | null | undefined)
      fake.uninstallerStarted = true
      return null
    },
    // A canned document, not a second fold — see `fake/preview.ts`. It does
    // not vary with the settings, so shell work can lay the panel out but
    // cannot check the arithmetic; that is `crates/host`'s job and its tests.
    rules_preview: () => FAKE_PREVIEW,
    paths_get: () => fake.paths,
    paths_reveal: () => null,
    health_get: () => fake.health,
    // `stats_window` opens or closes a window of numbers and writes nothing
    // else; the fake reports it the way the host does, through the event.
    stats_window: (a) => {
      fake.statsOpen = a.open === true
      emitMonitors()
      return null
    },
    // Read-only by construction: there is no stats verb that writes (§11.K).
    stats_query: (a) => {
      const query = (a.query ?? {}) as StatsQuery
      const detail = query.detail ?? 0
      return {
        ...fake.stats,
        groupBy: query.groupBy ?? fake.stats.groupBy,
        metrics: query.metrics?.length ? query.metrics : fake.stats.metrics,
        // The ledger is opt-in on the real host too, so a view that does not
        // ask must not receive one — that is the thing worth reproducing.
        turns: detail > 0 ? (fake.stats.turns?.length ? fake.stats.turns : FAKE_LEDGER).slice(0, detail) : [],
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
        case 'updates_check_on_start':
          fake.updatesOnStart = setting.value
          break
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
        case 'stats_fullscreen':
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
    monitors_list: () => FAKE_MONITORS,
    stage_set_monitor: (a) => {
      const id = (a.monitorId as string | null | undefined) ?? null
      control = {
        ...control,
        stage_monitor_id: id,
        // One pane per display: the operator asked for the pacer here, so the
        // mirror that was on this display stands down (§9, P11.11).
        stage_mirror_ids: control.stage_mirror_ids.filter((k) => k !== id),
      }
      emitMonitors()
      return null
    },
    stage_add_mirror: (a) => {
      const id = a.monitorId as string
      if (control.stage_monitor_id === id || control.stage_mirror_ids.includes(id)) {
        refuse('monitor.already_showing_stage', `${id} is already showing Stage`)
      }
      if (!FAKE_MONITORS.some((m) => m.key === id)) {
        refuse('monitor.not_connected', `${id} is not connected`)
      }
      control = { ...control, stage_mirror_ids: [...control.stage_mirror_ids, id] }
      emitMonitors()
      return null
    },
    stage_remove_mirror: (a) => {
      const id = a.monitorId as string
      control = { ...control, stage_mirror_ids: control.stage_mirror_ids.filter((k) => k !== id) }
      emitMonitors()
      return null
    },
    stage_open: () => {
      fake.stageOpen = true
      emitMonitors()
      return null
    },
    play_list: (a) => {
      const recipeId = (a.recipeId as string | null | undefined) ?? null
      return recipeId === null ? fake.plays : fake.plays.filter((p) => p.recipeId === recipeId)
    },
    play_events: () => [],
    update_check: () => {
      if (fake.update === 'offline') refuse('network', 'could not reach GitHub: offline')
      return fake.update
    },
    whats_new_get: () => ({ since: fake.whatsNewSince, current: '1.0.2' }),
    whats_new_seen: () => {
      fake.whatsNewSince = '1.0.2'
      return null
    },
    update_open_release: (a) => {
      fake.openedReleases.push(a.version as string)
      return null
    },
    // `build_snapshot`'s second line: a board can become illegal from outside
    // the recipe, and Load is where the host says so (§2.31, §2.32). The fake
    // builds no Play — a shell test that needs one seeds `playState` itself.
    play_load: (a) => {
      const r = recipes.get(a.recipeId as string)
      if (!r) refuse('catalog', `recipe ${a.recipeId} not found`)
      checkBoard(r)
      return null
    },
    get_state: () => fake.playState,
    // The recipe leaves Control: the host emits `null`, and so does this.
    play_unload: (a) => {
      const id = fake.playState?.playId
      fake.playState = null
      if (a.discard === true && id) fake.plays = fake.plays.filter((p) => p.id !== id)
      emit('play-state', null)
      return null
    },
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
    quits: 0,
    closeCancels: 0,
    uninstallerStarted: false,
    statsOpen: false,
    stageOpen: false,
    paths: { ...FAKE_PATHS },
    update: { current: '1.0.2', latest: '1.0.2', url: null, newer: false },
    updatesOnStart: true,
    openedReleases: [],
    whatsNewSince: null,
    marker: FAKE_HOST_MARKER,
    emit,
    listenerCount(name) {
      if (name) return listeners.get(name)?.size ?? 0
      let total = 0
      for (const set of listeners.values()) total += set.size
      return total
    },
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
    case 'speed_window':
      return { ...g, scoring: { ...g.scoring, speed_window: s.value } }
    case 'speed_steps':
      return { ...g, scoring: { ...g.scoring, speed_steps: s.value } }
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
    case 'language':
      return { ...g, language: s.value }
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
      // The §2.32 floor, as `Question::validate` has it. Everything above it
      // is a gap the library stores and a board refuses.
      const q = item.item
      const path = `question.${q.id}`
      if (!q.stem.trim() && q.options.length === 0) refuse('catalog', `${path}.stem: a question needs a stem or at least one option`)
      if (new Set(q.options.map((o) => o.id)).size !== q.options.length) refuse('catalog', `${path}.options: two options share an id`)
      if (q.options.some((o) => !o.text.trim())) refuse('catalog', `${path}.options: an option needs text`)
      if (q.difficulty !== null && (q.difficulty < 1 || q.difficulty > 100)) refuse('catalog', `${path}.difficulty: difficulty is 1-100`)
      break
    }
    case 'operator':
      if (!item.item.displayName.trim()) refuse('catalog', `operator.${item.item.id}.name: an operator needs a display name`)
      break
    case 'asset':
      break
  }
}
