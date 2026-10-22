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
  AppInfo,
  BetaWelcome,
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
  ImportOverrides,
  ImportReport,
  ItemOf,
  LibraryKind,
  Operator,
  PlayRecord,
  Question,
  RecipeEdit,
  QuestionOverlay,
  Recipe,
  SeedDemo,
  SeedMode,
  SeedResult,
  SeedStatus,
  SettingsView,
  StatsDimension,
  StatsMetric,
  StatsQuery,
  StatsResult,
  StatsRow,
  DeletePreview,
  DeleteReport,
  FamilyCopy,
  PropagationPreview,
  Refusal,
  Selection,
  Touched,
  TransferOp,
  TransferReport,
  Workspace,
  WorkspaceGroup,
  Workspaces,
  BulkEdit,
  BulkReport,
  DomainGroup,
  TagCount,
} from './types'
import { FAKE_LEDGER, FAKE_PREVIEW } from './fake/preview'
import { ImportRefused, planImport } from './fake/import'
import { sameBody, seedLibrary, seedRecipe } from './fake/seed'
import { bodyGaps, effectiveBody } from './question'
import { isTwin } from './twins'

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
   *
   * It is read the way the host writes one, by metric name: a query that asks
   * for other columns, or the same ones in another order, gets each row's
   * values for exactly those names, and `null` for one the answer lacks.
   */
  stats: StatsResult
  /**
   * P20: a canned answer per dimension. A query whose `groupBy` has one here
   * gets it; any other gets `stats`. Statistics asks several dimensions at
   * once — Live alone asks team, domain and difficulty — and one answer
   * relabelled for all of them is a table of teams under a Domain heading.
   */
  statsBy: Partial<Record<StatsDimension, StatsResult>>
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
  /** What `app_info.channel` answers; `?fake&channel=beta` makes it Beta. */
  channel: AppInfo['channel']
  /** What a Beta first launch finds where stable keeps its library (P13.1). */
  betaStable: BetaWelcome['stable']
  /** `beta.welcome_seen`: set by *Start empty* and by a copy. */
  betaWelcomeSeen: boolean
  readonly marker: typeof FAKE_HOST_MARKER
  /** The close guard's answers (P12.2): the fake cannot quit, so it counts. */
  quits: number
  closeCancels: number
  /** Set by `app_uninstall`. */
  uninstallerStarted: boolean
  /** Beta 2.0: the workspaces, their groups, and the one Studio works in. */
  workspaces: readonly Workspace[]
  workspaceGroups: readonly WorkspaceGroup[]
  currentWorkspace: string
  /** `kind:id` → family number, for the propagation commands. */
  readonly families: Map<string, number>
  /** Domain id → its groups (P15). */
  readonly domainGroups: Map<string, DomainGroup[]>
}

const now = () => Date.now()

/** The workspace a row seeded without a home lives in. */
export const FIRST_WORKSPACE = 'ws-1'

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
 * A canned answer with the columns a query asked for, in its order. A value
 * belongs to its metric's name, never to its position: `StatsRow.values` is
 * "one per requested metric, same order" on the host, so a fake that kept the
 * old order under new names would put points under Turns. A metric the canned
 * answer does not carry is `null` — nothing to report, not a zero.
 */
function byMetric(result: StatsResult, metrics: readonly StatsMetric[]): StatsResult {
  const at = metrics.map((metric) => result.metrics.indexOf(metric))
  const pick = (row: StatsRow): StatsRow => ({ ...row, values: at.map((i) => (i < 0 ? null : (row.values[i] ?? null))) })
  return { ...result, metrics, rows: result.rows.map(pick), totals: pick(result.totals) }
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

/** One board rule a recipe breaks, as `checkBoard` refuses it and `rules_preview` warns of it. */
type BoardProblem =
  | { readonly kind: 'incomplete'; readonly message: string }
  | { readonly kind: 'duplicate'; readonly difficulty: number; readonly message: string }

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
  /** `kind:id` → the workspace a library row lives in. */
  const homes = new Map<string, string>()
  const recipeHomes = new Map<string, string>()
  const families = new Map<string, number>()
  const domainGroups = new Map<string, DomainGroup[]>()
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

  /** Tags as the host stores them (P15): trimmed, one per fold, the spelling in view, at most 20. */
  const cleanTags = (q: Question): Question => {
    const out: string[] = []
    for (const raw of q.tags ?? []) {
      const tag = raw.trim()
      if (!tag) continue
      if ([...tag].length > 40) refuse('catalog', `question.${q.id}.tags: a tag is at most 40 characters`)
      const fold = tag.toLowerCase()
      if (out.some((t) => t.toLowerCase() === fold)) continue
      out.push(spellingInView(fold, q.id) ?? tag)
    }
    if (out.length > 20) refuse('catalog', `question.${q.id}.tags: a question has at most 20 tags`)
    return { ...q, tags: out }
  }
  const spellingInView = (fold: string, except: string): string | undefined => {
    for (const [k, row] of library) {
      if (row.kind !== 'question' || row.item.id === except || !inView(k)) continue
      const hit = (row.item.tags ?? []).find((t) => t.toLowerCase() === fold)
      if (hit) return hit
    }
    return undefined
  }

  const upsert = (input: CatalogItem): CatalogItem => {
    let item = input
    if (item.kind === 'question') item = { kind: 'question', item: cleanTags(item.item) }
    if (item.kind === 'domain') {
      const own = domainGroups.get(item.item.id) ?? []
      const foreign = item.item.questions.find((m) => m.groupId && !own.some((g) => g.id === m.groupId))
      if (foreign) refuse('catalog', `domain.${item.item.id}.group.${foreign.groupId}: that group belongs to another domain`)
      // Groups are the group commands' to write, never a domain save's.
      const rest = { ...item.item }
      delete (rest as { groups?: unknown }).groups
      item = { kind: 'domain', item: rest }
    }
    const k = key(item.kind, item.item.id)
    const existing = library.get(k)
    // A new row lands in this workspace; an existing one stays put.
    if (!existing && item.kind !== 'operator') homes.set(k, fake.currentWorkspace)
    if (existing && item.kind !== 'operator' && !inView(k)) refuse('catalog', `${item.kind} ${item.item.id} belongs to another workspace`)
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
   * `rules_preview` reports the same problems as warnings (P12.12).
   */
  const boardProblems = (recipe: Recipe, pending?: Question): BoardProblem[] => {
    const out: BoardProblem[] = []
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
          out.push({ kind: 'incomplete', message: `recipe.${recipe.id}.board.${board.domainId}.question.${qid}: this question is incomplete; finish it in the library or take it off the board` })
          continue
        }
        if (body.difficulty === null || allowRepeats) continue
        if (claimed.has(body.difficulty)) {
          out.push({ kind: 'duplicate', difficulty: body.difficulty, message: `recipe.${recipe.id}.board.${board.domainId}.difficulty.${body.difficulty}: two questions in this domain share a difficulty; turn on Allow repeated difficulties in Board, or keep one` })
        }
        claimed.set(body.difficulty, qid)
      }
    }
    return out
  }
  const checkBoard = (recipe: Recipe, pending?: Question) => {
    const first = boardProblems(recipe, pending)[0]
    if (first) refuse('catalog', first.message)
  }

  const bumpRecipe = (recipe: Recipe): Recipe => {
    const existing = recipes.get(recipe.id)
    if (!existing) recipeHomes.set(recipe.id, fake.currentWorkspace)
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
      return [...library.values()]
        .filter((r) => r.kind === kind && inScope(r.item.archivedAt, scope) && inView(key(r.kind, r.item.id)))
        .map(asRead)
    },
    catalog_get: (a) => {
      const row = library.get(key(a.kind as string, a.id as string))
      if (!row || !inView(key(row.kind, row.item.id))) refuse('catalog', `${a.kind} ${a.id} not found`)
      return asRead(row)
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
      // One transaction, as the host's: a refused item leaves nothing written.
      const savedLibrary = new Map(library)
      const savedHomes = new Map(homes)
      let changes: { kind: CatalogItem['kind']; id: string; op: 'upserted' }[]
      try {
        changes = items.map((i) => {
          const stored = upsert(i)
          return { kind: stored.kind, id: stored.item.id, op: 'upserted' as const }
        })
      } catch (error) {
        library.clear()
        savedLibrary.forEach((v, k) => library.set(k, v))
        homes.clear()
        savedHomes.forEach((v, k) => homes.set(k, v))
        throw error
      }
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
        .filter((r) => (q.kinds.length === 0 || q.kinds.includes(r.kind)) && inScope(r.item.archivedAt, q.scope) && inView(key(r.kind, r.item.id)))
        .filter((r) => JSON.stringify(r.item).toLowerCase().includes(needle))
        .slice(0, q.limit)
        .map((r) => ({ kind: r.kind, id: r.item.id, score: 1 }))
    },
    referenced_by: (a) => {
      // By name, as the host says it (beta.3): "the game Friday", "the games A and B".
      // One row (`id`) or a selection (`ids`), as the host takes it; active users only.
      const picked = new Set([...((a.ids as string[] | undefined) ?? []), ...(typeof a.id === 'string' ? [a.id] : [])])
      const named = (one: string, many: string, names: string[]): string | null => {
        const sorted = [...names].sort()
        if (sorted.length === 0) return null
        if (sorted.length === 1) return `the ${one} ${sorted[0]}`
        if (sorted.length === 2) return `the ${many} ${sorted[0]} and ${sorted[1]}`
        return `the ${many} ${sorted[0]} and ${sorted.length - 1} more`
      }
      const games = [...recipes.values()].filter(
        (r) =>
          r.archivedAt === null &&
          ((a.kind === 'team' && r.teams.some((t) => picked.has(t))) ||
            (a.kind === 'domain' && r.board.some((b) => picked.has(b.domainId))) ||
            (a.kind === 'question' && r.board.some((b) => b.questionIds.some((q) => picked.has(q))))),
      )
      const byGame = named('game', 'games', games.map((r) => r.name))
      if (byGame || a.kind !== 'question') return byGame
      const domains = [...library.values()].flatMap((row) =>
        row.kind === 'domain' && row.item.archivedAt === null && row.item.questions.some((m) => picked.has(m.questionId)) ? [row.item.name] : [],
      )
      return named('domain', 'domains', domains)
    },
    recipe_list: (a) => [...recipes.values()].filter((r) => inScope(r.archivedAt, a.scope as ArchiveScope) && visibleRecipe(r.id)),
    recipe_get: (a) => {
      const r = recipes.get(a.id as string)
      if (!r || !visibleRecipe(r.id)) refuse('catalog', `recipe ${a.id} not found`)
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
    // Folders and game tags (P20), the host's `labels.rs` case for case: one
    // batch, refused whole, the preview the same plan unwritten, a tag written
    // as another game of this workspace already spells it.
    recipe_bulk_edit: (a) => {
      const ids = [...new Set(a.ids as string[])]
      const edits = a.edits as RecipeEdit[]
      if (ids.length === 0) refuse('catalog', 'recipes: nothing is selected')
      const key = (t: string) => t.trim().toLowerCase()
      const folderOf = (f: string) => {
        const t = f.trim()
        if (!t) refuse('catalog', 'recipes.folder: a folder needs a name')
        if ([...t].length > 60) refuse('catalog', 'recipes.folder: a folder name is at most 60 characters')
        return t
      }
      const tagOf = (t: string) => {
        const s = t.trim()
        if (!s) refuse('catalog', 'recipes.tags: a game tag needs a name')
        if ([...s].length > 40) refuse('catalog', 'recipes.tags: a game tag is at most 40 characters')
        return s
      }
      const clean = edits.map((e) =>
        e.op === 'set_folder' ? { op: 'set_folder' as const, folder: e.folder === null ? null : folderOf(e.folder) } : e.op === 'tag' ? { op: 'tag' as const, tag: tagOf(e.tag) } : { op: 'untag' as const, tag: e.tag.trim() },
      )
      const inView = [...recipes.values()].filter((r) => recipeHomeOf(r.id) === fake.currentWorkspace).flatMap((r) => r.tags)
      const spelled = (t: string) => inView.find((x) => key(x) === key(t)) ?? t
      const report: { changed: string[]; unchanged: string[] } = { changed: [], unchanged: [] }
      const next: Recipe[] = []
      for (const id of ids) {
        const r = recipes.get(id)
        if (!r || recipeHomeOf(id) !== fake.currentWorkspace) refuse('catalog', `recipe ${id} not found`)
        let folder = r.folder
        let tags = [...r.tags]
        for (const e of clean) {
          if (e.op === 'set_folder') folder = e.folder
          else if (e.op === 'tag') {
            if (!tags.some((t) => key(t) === key(e.tag))) tags = [...tags, spelled(e.tag)]
          } else tags = tags.filter((t) => key(t) !== key(e.tag))
        }
        if (folder === r.folder && JSON.stringify(tags) === JSON.stringify(r.tags)) {
          report.unchanged.push(id)
          continue
        }
        if (tags.length > 20) refuse('catalog', `recipe.${id}.tags: a game has at most 20 game tags`)
        report.changed.push(id)
        next.push({ ...r, folder, tags })
      }
      if (a.preview !== true) next.forEach(bumpRecipe)
      return report
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
          const item = { kind: row.kind, item: { ...row.item, ...patched } } as CatalogItem
          upsert(item)
          emit('catalog-changed', { kind: row.kind, id: row.item.id, op: 'upserted' })
          // `alsoCopies` (beta.4): the editors' *Also update copies*, from the Game page.
          if (a.alsoCopies === true) followCopies(item)
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
      for (const item of scopedSeed(seedLibrary(demo))) {
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
      const recipe = scopedSeed(seedRecipe(demo, gameDefaults))
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
      return { recipeId: recipe.id, inserted, overwritten } satisfies SeedResult
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
      for (const item of scopedSeed(seedLibrary(demo))) count(library.get(key(item.kind, item.item.id))?.item, item.item)
      const shipped = scopedSeed(seedRecipe(demo, gameDefaults))
      count(recipes.get(shipped.id), shipped)
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
          { edits: (a.overrides as ImportOverrides | undefined)?.edits ?? [], skip: (a.overrides as ImportOverrides | undefined)?.skip ?? [] },
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
    app_info: () => ({ version: '1.0.2', build: 'dev', identifier: 'org.questiongame.app', channel: fake.channel }),
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
    rules_preview: (a) => {
      const recipe = typeof a.recipeId === 'string' ? recipes.get(a.recipeId) : undefined
      if (!recipe) return FAKE_PREVIEW
      const problems = boardProblems(recipe)
      const incomplete = problems.filter((p) => p.kind === 'incomplete').length
      const duplicate = problems.find((p) => p.kind === 'duplicate')
      const archivedName = (kind: 'team' | 'domain' | 'question', id: string): string[] => {
        const row = library.get(key(kind, id))
        if (!row || row.item.archivedAt == null) return []
        return [row.kind === 'question' ? row.item.stem : (row.item as { name: string }).name]
      }
      const once = (names: string[]) => [...new Set(names)]
      const archived = {
        teams: once(recipe.teams.flatMap((id) => archivedName('team', id))),
        domains: once(recipe.board.flatMap((b) => archivedName('domain', b.domainId))),
        questions: once(recipe.board.flatMap((b) => b.questionIds.flatMap((q) => archivedName('question', q)))),
      }
      const anyArchived = archived.teams.length + archived.domains.length + archived.questions.length > 0
      return {
        ...FAKE_PREVIEW,
        warnings: [
          ...(anyArchived ? [{ code: 'archivedOnGame' as const, ...archived }] : []),
          ...FAKE_PREVIEW.warnings,
          ...(duplicate?.kind === 'duplicate' ? [{ code: 'duplicateDifficulty' as const, difficulty: duplicate.difficulty, questions: 2 }] : []),
          ...(incomplete > 0 ? [{ code: 'incompleteQuestions' as const, questions: incomplete }] : []),
        ],
      }
    },
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
      const canned = (query.groupBy ? fake.statsBy[query.groupBy] : undefined) ?? fake.stats
      return {
        ...byMetric(canned, query.metrics?.length ? query.metrics : canned.metrics),
        groupBy: query.groupBy ?? canned.groupBy,
        // The ledger is opt-in on the real host too, so a view that does not
        // ask must not receive one — that is the thing worth reproducing.
        turns: detail > 0 ? (canned.turns?.length ? canned.turns : FAKE_LEDGER).slice(0, detail) : [],
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
      const mine = fake.plays.filter((p) => visibleRecipe(p.recipeId))
      return recipeId === null ? mine : mine.filter((p) => p.recipeId === recipeId)
    },
    play_events: () => [],
    update_check: () => {
      if (fake.update === 'offline') refuse('network', 'could not reach GitHub: offline')
      return fake.update
    },
    whats_new_get: () => ({ since: fake.whatsNewSince, current: '1.0.2' }),
    // questiongame Beta's first launch (P13.1), refusing as the host does.
    beta_welcome_get: () => ({
      show: fake.channel === 'beta' && !fake.betaWelcomeSeen && library.size === 0 && recipes.size === 0,
      stable: fake.channel === 'beta' ? fake.betaStable : 'missing',
    }),
    beta_welcome_done: () => {
      if (fake.channel !== 'beta') refuse('beta.not_beta', 'only questiongame Beta copies a stable library')
      fake.betaWelcomeSeen = true
      return null
    },
    beta_copy_stable_library: () => {
      if (fake.channel !== 'beta') refuse('beta.not_beta', 'only questiongame Beta copies a stable library')
      if (library.size > 0 || recipes.size > 0) refuse('beta.library_not_empty', 'this Beta library already holds work; nothing was copied')
      if (fake.betaStable === 'running') refuse('beta.stable_running', 'questiongame is running; close it first, then copy')
      if (fake.betaStable === 'missing') refuse('beta.no_stable', 'there is no stable library to copy')
      for (const item of seedLibrary('en')) upsert(item)
      upsert({ kind: 'operator', item: { id: 'op-stable', displayName: 'Stable operator', pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null } })
      activeOperatorId = 'op-stable'
      fake.betaWelcomeSeen = true
      // A stable library 1.0.1 left: What's new starts after it, as the host says.
      fake.whatsNewSince = '1.0.1'
      return null
    },
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
      for (const id of r.teams) {
        const row = library.get(key('team', id))
        if (row?.kind === 'team' && row.item.archivedAt != null) {
          refuse('catalog', `recipe.${r.id}.roster.team.${id}: the roster has the archived team ${row.item.name}; restore it or take it off the roster`)
        }
      }
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


  // ---------------------------------------------------------------- workspaces
  //
  // Beta 2.0, kept honest enough for shell work: every row has a home (a row
  // seeded without one lives in the first workspace), and every read is this
  // workspace's (no shared library since beta.2). The closure, reuse and
  // family rules are the host's and are tested there; the fake copies and
  // moves what was picked and what a domain or a game obviously needs —
  // a picked question with its domains — and refuses the way the host does.

  const homeOf = (k: string): string => homes.get(k) ?? FIRST_WORKSPACE
  const recipeHomeOf = (id: string): string => recipeHomes.get(id) ?? FIRST_WORKSPACE
  const inView = (k: string) => {
    // Operators are the app's, not a workspace's.
    if (k.startsWith('operator:')) return true
    return homeOf(k) === fake.currentWorkspace
  }
  const visibleRecipe = (id: string) => recipeHomeOf(id) === fake.currentWorkspace
  const asRead = (row: CatalogItem): CatalogItem =>
    ({
      kind: row.kind,
      item: {
        ...row.item,
        ...(row.kind === 'domain' ? { groups: domainGroups.get(row.item.id) ?? [] } : {}),
      },
    }) as CatalogItem

  const workspaceView = (): Workspaces => ({
    current: fake.currentWorkspace,
    workspaces: fake.workspaces,
    groups: fake.workspaceGroups,
  })
  const workspacesChanged = () => {
    const view = workspaceView()
    emit('workspace-changed', view)
    return view
  }
  const workspaceRow = (id: string): Workspace => {
    const found = fake.workspaces.find((w) => w.id === id)
    if (!found) refuse('catalog', `workspace/${id}: no such workspace`)
    return found
  }
  const cleanName = (name: string, path: string, taken: readonly string[]) => {
    const clean = name.trim()
    if (!clean) refuse('catalog', `${path}: a name is required`)
    if ([...clean].length > 60) refuse('catalog', `${path}: a name is at most 60 characters`)
    if (taken.some((n) => n.trim().toLowerCase() === clean.toLowerCase())) refuse('catalog', `${path}: another workspace has this name`)
    return clean
  }
  const activeNames = (except?: string) =>
    fake.workspaces.filter((w) => w.archivedAt === null && w.id !== except && w.name !== null).map((w) => w.name as string)
  const putWorkspace = (next: Workspace) => {
    fake.workspaces = fake.workspaces.some((w) => w.id === next.id)
      ? fake.workspaces.map((w) => (w.id === next.id ? next : w))
      : [...fake.workspaces, next]
  }
  const freshId = (prefix: string) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 8)}`

  /** The rows a selection carries: what was picked, a domain's questions, a game's roster and board. */
  const closureOf = (sel: Selection) => {
    const out = new Map<string, { kind: LibraryKind; id: string; picked: boolean }>()
    const add = (kind: LibraryKind, id: string, picked: boolean) => {
      const k = key(kind, id)
      if (!library.has(k) || out.has(k)) return
      out.set(k, { kind, id, picked })
      const row = library.get(k)
      if (row?.kind === 'domain') row.item.questions.forEach((m) => add('question', m.questionId, false))
    }
    const games = (sel.recipes ?? []).map((id) => recipes.get(id)).filter((r): r is Recipe => r !== undefined)
    ;(sel.teams ?? []).forEach((id) => add('team', id, true))
    ;(sel.domains ?? []).forEach((id) => add('domain', id, true))
    ;(sel.questions ?? []).forEach((id) => add('question', id, true))
    for (const game of games) {
      game.teams.forEach((id) => add('team', id, false))
      game.board.forEach((b) => {
        add('domain', b.domainId, false)
        b.questionIds.forEach((q) => add('question', q, false))
      })
    }
    return { rows: [...out.values()], games }
  }

  /** Who in this workspace still uses `id` and is not going with it. */
  const stayingUsers = (kind: LibraryKind, id: string, going: Set<string>, goingGames: Set<string>): string[] => {
    const users: string[] = []
    for (const [k, row] of library) {
      if (going.has(k) || homeOf(k) !== fake.currentWorkspace) continue
      if (kind === 'question' && row.kind === 'domain' && row.item.questions.some((m) => m.questionId === id)) users.push(`domain ${row.item.name}`)
    }
    for (const game of recipes.values()) {
      if (goingGames.has(game.id) || recipeHomeOf(game.id) !== fake.currentWorkspace) continue
      const uses =
        (kind === 'team' && game.teams.includes(id)) ||
        (kind === 'domain' && game.board.some((b) => b.domainId === id)) ||
        (kind === 'question' && game.board.some((b) => b.questionIds.includes(id)))
      if (uses) users.push(`game ${game.name}`)
    }
    return users
  }

  const emptyReport = (): TransferReport => ({ created: [], reused: [], moved: [], joined: [], homes: [], refused: [] })
  const familyOf = (k: string): number => {
    const known = families.get(k)
    if (known !== undefined) return known
    const fresh = Math.max(0, ...families.values()) + 1
    families.set(k, fresh)
    return fresh
  }

  const transfer = (op: TransferOp, sel: Selection, target: string | null, write: boolean, withDomains = true): TransferReport => {
    const report = emptyReport() as { created: Touched[]; reused: Touched[]; moved: Touched[]; joined: Touched[]; homes: Touched[]; refused: Refusal[] }
    if (target === null) refuse('catalog', 'transfer.target: copy and move need a workspace to go to')
    if (target === fake.currentWorkspace) refuse('catalog', `workspace/${target}: that is this workspace; use Duplicate for a second copy here`)
    if (workspaceRow(target).archivedAt !== null) refuse('catalog', `workspace/${target}: an archived workspace takes nothing`)
    const { rows, games } = closureOf(sel)
    if (op === 'copy') {
      // A row that only came along reuses an active member of its family in
      // the target, as the host does; a picked row is always new.
      // A question a copied game boards is reused only by a member that the
      // game sees as it sees the source — difficulty and completeness, its
      // overlay applied — else it is copied fresh (beta.3, as the host).
      const plays = (q: Question, overlay: QuestionOverlay | undefined) => {
        const body = effectiveBody(q, overlay)
        return `${body.difficulty}|${bodyGaps(body).length === 0}`
      }
      const member = (kind: LibraryKind, id: string): string | undefined => {
        const family = families.get(key(kind, id))
        if (family === undefined) return undefined
        const source = library.get(key(kind, id))
        const boarding = kind === 'question' ? games.find((g) => g.board.some((b) => b.questionIds.includes(id))) : undefined
        const overlay = boarding?.overlays?.questions?.[id]
        const found = [...families.entries()]
          .filter(([k, f]) => f === family && k.startsWith(`${kind}:`) && homeOf(k) === target && library.get(k)?.item.archivedAt === null)
          .map(([k]) => library.get(k) as CatalogItem)
          .sort((x, y) => x.item.createdAt - y.item.createdAt || (x.item.id < y.item.id ? -1 : 1))
          .find((there) => !boarding || source?.kind !== 'question' || there.kind !== 'question' || plays(there.item, overlay) === plays(source.item, overlay))
        return found?.item.id
      }
      const reused = new Map(rows.filter((r) => !r.picked).flatMap((r) => {
        const there = member(r.kind, r.id)
        return there ? [[key(r.kind, r.id), there] as const] : []
      }))
      const ids = new Map(rows.map((r) => [key(r.kind, r.id), reused.get(key(r.kind, r.id)) ?? freshId(r.kind === 'question' ? 'q' : r.kind === 'domain' ? 'dom' : r.kind)]))
      const map = (kind: LibraryKind, id: string) => ids.get(key(kind, id)) ?? id
      for (const r of rows) {
        if (reused.has(key(r.kind, r.id))) {
          report.reused.push({ kind: r.kind, id: map(r.kind, r.id), from: r.id, picked: false })
          continue
        }
        report.created.push({ kind: r.kind, id: map(r.kind, r.id), from: r.id, picked: r.picked })
        if (!write) continue
        const row = library.get(key(r.kind, r.id)) as CatalogItem
        const item = { ...row.item, id: map(r.kind, r.id) } as CatalogItem['item']
        if (row.kind === 'domain') (item as { questions: unknown }).questions = row.item.questions.map((m) => ({ ...m, questionId: map('question', m.questionId) }))
        library.set(key(r.kind, map(r.kind, r.id)), { kind: row.kind, item } as CatalogItem)
        homes.set(key(r.kind, map(r.kind, r.id)), target)
        families.set(key(r.kind, map(r.kind, r.id)), familyOf(key(r.kind, r.id)))
      }
      // A picked question arrives in its domains: the target's copy (same
      // family), joined at the end in no group; else a copy holding only the
      // picked questions (beta.2).
      if (withDomains) {
        const homesOf = new Map<string, string[]>()
        for (const q of sel.questions ?? []) {
          for (const [k, row] of library) {
            if (row.kind !== 'domain' || homeOf(k) !== fake.currentWorkspace || row.item.archivedAt !== null) continue
            if (rows.some((r) => r.kind === 'domain' && r.id === row.item.id)) continue
            if (row.item.questions.some((m) => m.questionId === q)) homesOf.set(row.item.id, [...(homesOf.get(row.item.id) ?? []), q])
          }
        }
        for (const [domainId, picked] of homesOf) {
          const source = library.get(key('domain', domainId))
          if (source?.kind !== 'domain') continue
          const family = families.get(key('domain', domainId))
          const there = family === undefined ? undefined : [...families.entries()].find(([k, f]) => f === family && k.startsWith('domain:') && homeOf(k) === target && library.get(k)?.item.archivedAt === null)
          if (there) {
            const existing = library.get(there[0]) as CatalogItem & { kind: 'domain' }
            report.joined.push({ kind: 'domain', id: existing.item.id, from: domainId, picked: false })
            if (!write) continue
            let next = Math.max(-1, ...existing.item.questions.map((m) => m.sortKey)) + 1
            const fresh = picked.map((q) => map('question', q)).filter((q) => !existing.item.questions.some((m) => m.questionId === q))
            const questions = [...existing.item.questions, ...fresh.map((questionId) => ({ questionId, sortKey: next++, groupId: null }))]
            library.set(there[0], { kind: 'domain', item: { ...existing.item, questions } })
          } else {
            const id = freshId('dom')
            report.created.push({ kind: 'domain', id, from: domainId, picked: false })
            report.homes.push({ kind: 'domain', id, from: domainId, picked: false })
            if (!write) continue
            const questions = source.item.questions.filter((m) => picked.includes(m.questionId)).map((m) => ({ ...m, questionId: map('question', m.questionId), groupId: null }))
            library.set(key('domain', id), { kind: 'domain', item: { ...source.item, id, questions } })
            homes.set(key('domain', id), target)
            families.set(key('domain', id), familyOf(key('domain', domainId)))
          }
        }
      }
      for (const game of games) {
        const id = freshId('game')
        report.created.push({ kind: 'recipe', id, from: game.id, picked: true })
        if (!write) continue
        recipes.set(id, {
          ...game,
          id,
          rev: 1,
          teams: game.teams.map((t) => map('team', t)),
          board: game.board.map((b) => ({ domainId: map('domain', b.domainId), questionIds: b.questionIds.map((q) => map('question', q)) })),
        })
        recipeHomes.set(id, target)
      }
      return finish(report, write, target)
    }
    // move
    const going = new Set(rows.map((r) => key(r.kind, r.id)))
    const goingGames = new Set(games.map((g) => g.id))
    for (const r of rows) {
      for (const usedBy of stayingUsers(r.kind, r.id, going, goingGames)) report.refused.push({ kind: r.kind, id: r.id, usedBy })
    }
    report.moved.push(...rows.map((r) => ({ kind: r.kind, id: r.id, from: r.id, picked: r.picked })))
    report.moved.push(...games.map((g) => ({ kind: 'recipe' as const, id: g.id, from: g.id, picked: true })))
    if (report.refused.length === 0 && write) {
      rows.forEach((r) => homes.set(key(r.kind, r.id), target))
      games.forEach((g) => recipeHomes.set(g.id, target))
    }
    return finish(report, write, target)
  }

  const finish = (report: TransferReport, write: boolean, target?: string | null): TransferReport => {
    // Picked teams, domains and games beside a row of the same name there (beta.3).
    if (target) {
      const twins: string[] = []
      for (const t of [...report.created, ...report.moved].filter((t) => t.picked)) {
        const source = t.kind === 'recipe' ? recipes.get(t.from) : library.get(key(t.kind, t.from))?.item
        const name = (source as { name?: string } | undefined)?.name
        if (!name || !['team', 'domain', 'recipe'].includes(t.kind)) continue
        const others =
          t.kind === 'recipe'
            ? [...recipes.values()].filter((r) => r.id !== t.id && recipeHomeOf(r.id) === target && r.archivedAt === null)
            : [...library.entries()]
                .filter(([k, row]) => k.startsWith(`${t.kind}:`) && row.item.id !== t.id && homeOf(k) === target && row.item.archivedAt === null)
                .map(([, row]) => row.item as { name: string })
        const line = `${t.kind === 'recipe' ? 'game' : t.kind} ${name}`
        if (isTwin(name, others) && !twins.includes(line)) twins.push(line)
      }
      report = { ...report, twins }
    }
    if (!write) return report
    const first = report.refused[0]
    if (first) {
      const row = first.kind === 'recipe' ? recipes.get(first.id) : library.get(key(first.kind, first.id))?.item
      const name = (row as { name?: string; stem?: string } | undefined)?.name ?? (row as { stem?: string } | undefined)?.stem ?? first.id
      refuse('catalog', `${first.kind === 'recipe' ? 'game' : first.kind} ${name} is still used by ${[...new Set(report.refused.map((r) => r.usedBy))].join(', ')}`)
    }
    for (const t of [...report.created, ...report.moved, ...(report.joined ?? [])]) emit('catalog-changed', { kind: t.kind, id: t.id, op: 'upserted' })
    return report
  }

  /** `item`'s body onto every copy of it (*Also update copies*). */
  const followCopies = (item: CatalogItem): void => {
    for (const copy of familyCopies(item)) {
      const k = key(item.kind, copy.id)
      const stored = library.get(k) as CatalogItem
      // The body only: never the id, the stamps or where the row lives.
      const body: Record<string, unknown> = { ...(item.item as unknown as Record<string, unknown>) }
      for (const own of ['id', 'createdAt', 'updatedAt', 'archivedAt', 'familyId']) delete body[own]
      if (stored.kind === 'domain') delete body.questions
      library.set(k, { kind: stored.kind, item: { ...stored.item, ...body, updatedAt: now() } } as CatalogItem)
      emit('catalog-changed', { kind: item.kind, id: copy.id, op: 'upserted' })
    }
  }

  /** The other members of a row's family, as the host names them. */
  const familyCopies = (item: CatalogItem): FamilyCopy[] => {
    const family = families.get(key(item.kind, item.item.id))
    if (family === undefined) return []
    return [...families.entries()]
      .filter(([k, f]) => f === family && k !== key(item.kind, item.item.id) && library.has(k))
      .map(([k]) => {
        const home = homeOf(k)
        const row = library.get(k) as CatalogItem
        return { id: row.item.id, workspace: home, workspaceName: workspaceRow(home).name ?? null, archived: row.item.archivedAt !== null }
      })
  }

  // ---------------------------------------------------- groups, tags, bulk (P15)

  const questionInView = (id: string): Question => {
    const row = library.get(key('question', id))
    if (!row || row.kind !== 'question' || !inView(key('question', id))) refuse('catalog', `question ${id} not found`)
    return row.item
  }
  const domainInView = (id: string) => {
    const row = library.get(key('domain', id))
    if (!row || row.kind !== 'domain' || !inView(key('domain', id))) refuse('catalog', `domain ${id} not found`)
    return row.item
  }
  const putGroups = (domainId: string, groups: DomainGroup[]) => {
    domainGroups.set(domainId, groups.map((g, i) => ({ ...g, sortKey: i })))
    emit('catalog-changed', { kind: 'domain', id: domainId, op: 'upserted' })
  }
  const groupName = (domainId: string, name: string, except?: string) => {
    const clean = name.trim()
    const path = `domain.${domainId}.group.name`
    if (!clean) refuse('catalog', `${path}: a name is required`)
    if ([...clean].length > 60) refuse('catalog', `${path}: a name is at most 60 characters`)
    if ((domainGroups.get(domainId) ?? []).some((g) => g.id !== except && g.name.toLowerCase() === clean.toLowerCase())) {
      refuse('catalog', `${path}: another group in this domain has this name`)
    }
    return clean
  }
  const tagsInView = (): TagCount[] => {
    const by = new Map<string, TagCount>()
    for (const [k, row] of library) {
      if (row.kind !== 'question' || !inView(k)) continue
      for (const t of row.item.tags ?? []) {
        const fold = t.toLowerCase()
        const was = by.get(fold)
        by.set(fold, was ? { ...was, questions: was.questions + 1 } : { tag: t, questions: 1 })
      }
    }
    return [...by.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([, v]) => v)
  }
  /** A group's own domain, as the host reads it — never the caller's word for it. */
  const groupHome = (id: string): string => {
    for (const [domainId, groups] of domainGroups) if (groups.some((g) => g.id === id)) return domainId
    return refuse('catalog', `domain-group/${id}: no such group`)
  }
  const bulk = (ids: readonly string[], edit: BulkEdit, write: boolean): BulkReport => {
    const unique = [...new Set(ids)]
    if (unique.length === 0) refuse('catalog', 'bulk: nothing is selected')
    const questions = unique.map(questionInView)
    const changed: string[] = []
    const unchanged: string[] = []
    const writes: Array<() => void> = []
    const fold = (t: string) => t.trim().toLowerCase()
    switch (edit.op) {
      case 'tag': {
        const tag = edit.tag.trim()
        if (!tag) refuse('catalog', 'tag.name: a tag needs a name')
        const lacking = questions.filter((q) => !(q.tags ?? []).some((t) => fold(t) === fold(tag)))
        const full = lacking.filter((q) => (q.tags ?? []).length >= 20).length
        if (full > 0) refuse('catalog', `a question has at most 20 tags: ${full} ${full === 1 ? 'question' : 'questions'} would have more than 20`)
        for (const q of questions) {
          if (lacking.includes(q)) {
            changed.push(q.id)
            writes.push(() => void upsert({ kind: 'question', item: { ...q, tags: [...(q.tags ?? []), tag] } }))
          } else unchanged.push(q.id)
        }
        break
      }
      case 'untag':
        for (const q of questions) {
          if ((q.tags ?? []).some((t) => fold(t) === fold(edit.tag))) {
            changed.push(q.id)
            writes.push(() => void upsert({ kind: 'question', item: { ...q, tags: (q.tags ?? []).filter((t) => fold(t) !== fold(edit.tag)) } }))
          } else unchanged.push(q.id)
        }
        break
      case 'set_difficulty':
        if (edit.difficulty !== null && (edit.difficulty < 1 || edit.difficulty > 100)) refuse('catalog', 'bulk.difficulty: a difficulty is 1 to 100')
        for (const q of questions) {
          if (q.difficulty === edit.difficulty) unchanged.push(q.id)
          else {
            changed.push(q.id)
            writes.push(() => void upsert({ kind: 'question', item: { ...q, difficulty: edit.difficulty } }))
          }
        }
        break
      case 'group':
      case 'add_to_domain':
      case 'remove_from_domain': {
        const d = domainInView(edit.domainId)
        let members = [...d.questions]
        if (edit.op === 'group') {
          if (edit.groupId && !(domainGroups.get(d.id) ?? []).some((g) => g.id === edit.groupId)) {
            refuse('catalog', `domain.${d.id}.group.${edit.groupId}: that group belongs to another domain`)
          }
          members = members.map((m) => {
            if (!unique.includes(m.questionId) || (m.groupId ?? null) === edit.groupId) return m
            changed.push(m.questionId)
            return { ...m, groupId: edit.groupId }
          })
          unchanged.push(...unique.filter((id) => !changed.includes(id)))
        } else if (edit.op === 'add_to_domain') {
          let next = Math.max(-1, ...members.map((m) => m.sortKey)) + 1
          for (const id of unique) {
            if (members.some((m) => m.questionId === id)) unchanged.push(id)
            else {
              members.push({ questionId: id, sortKey: next++, groupId: null })
              changed.push(id)
            }
          }
        } else {
          for (const id of unique) (members.some((m) => m.questionId === id) ? changed : unchanged).push(id)
          members = members.filter((m) => !changed.includes(m.questionId))
        }
        if (changed.length > 0) writes.push(() => void upsert({ kind: 'domain', item: { ...d, questions: members } }))
        break
      }
    }
    if (write) {
      writes.forEach((w) => w())
      changed.forEach((id) => emit('catalog-changed', { kind: 'question', id, op: 'upserted' }))
      if ('domainId' in edit && changed.length > 0) emit('catalog-changed', { kind: 'domain', id: edit.domainId, op: 'upserted' })
    }
    return { changed, unchanged }
  }
  const retag = (from: string, to: string | null, write: boolean): BulkReport => {
    const fold = (t: string) => t.trim().toLowerCase()
    if (to !== null && !to.trim()) refuse('catalog', 'tag.name: a tag needs a name')
    const target = to === null ? null : (fold(to) === fold(from) ? to.trim() : (tagsInView().find((t) => fold(t.tag) === fold(to))?.tag ?? to.trim()))
    const changed: string[] = []
    for (const [k, row] of [...library]) {
      if (row.kind !== 'question' || !inView(k) || !(row.item.tags ?? []).some((t) => fold(t) === fold(from))) continue
      changed.push(row.item.id)
      if (!write) continue
      const next: string[] = []
      for (const t of row.item.tags ?? []) {
        const v = fold(t) === fold(from) ? target : t
        if (v !== null && !next.some((n) => fold(n) === fold(v))) next.push(target !== null && fold(v) === fold(target) ? target : v)
      }
      library.set(k, { kind: 'question', item: { ...row.item, tags: next, updatedAt: now() } })
      emit('catalog-changed', { kind: 'question', id: row.item.id, op: 'upserted' })
    }
    return { changed, unchanged: [] }
  }

  Object.assign(commands, {
    tag_list: () => tagsInView(),
    catalog_bulk_edit: (a: Record<string, unknown>) => bulk(a.ids as string[], a.edit as BulkEdit, a.preview !== true),
    tag_rename: (a: Record<string, unknown>) => retag(a.from as string, a.to as string, a.preview !== true),
    tag_delete: (a: Record<string, unknown>) => retag(a.tag as string, null, a.preview !== true),
    domain_group_create: (a: Record<string, unknown>) => {
      const domainId = domainInView(a.domainId as string).id
      const group: DomainGroup = { id: `grp-${crypto.randomUUID().slice(0, 8)}`, domainId, name: groupName(domainId, a.name as string), sortKey: 0 }
      putGroups(domainId, [...(domainGroups.get(domainId) ?? []), group])
      return group
    },
    domain_group_rename: (a: Record<string, unknown>) => {
      const domainId = groupHome(a.id as string)
      const name = groupName(domainId, a.name as string, a.id as string)
      putGroups(domainId, (domainGroups.get(domainId) ?? []).map((g) => (g.id === a.id ? { ...g, name } : g)))
      return null
    },
    domain_group_reorder: (a: Record<string, unknown>) => {
      const domainId = a.domainId as string
      const order = a.order as string[]
      const groups = domainGroups.get(domainId) ?? []
      if (order.some((id) => !groups.some((g) => g.id === id))) refuse('catalog', `domain.${domainId}.group: no such group in this domain`)
      const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
      putGroups(domainId, [...groups].sort((x, y) => rank(x.id) - rank(y.id)))
      return null
    },
    // With `into`, a merge (P20): the questions join that group of the same domain, then the group goes.
    domain_group_delete: (a: Record<string, unknown>) => {
      const domainId = groupHome(a.id as string)
      const into = (a.into as string | null | undefined) ?? null
      if (into !== null) {
        if (into === a.id) refuse('catalog', `domain-group/${a.id}.into: a domain group cannot merge into itself`)
        if (groupHome(into) !== domainId) refuse('catalog', `domain-group/${a.id}.into: that domain group is in another domain`)
      }
      putGroups(domainId, (domainGroups.get(domainId) ?? []).filter((g) => g.id !== a.id))
      const row = library.get(key('domain', domainId))
      if (row?.kind === 'domain') {
        library.set(key('domain', domainId), {
          kind: 'domain',
          item: { ...row.item, questions: row.item.questions.map((m) => (m.groupId === a.id ? { ...m, groupId: into } : m)) },
        })
      }
      return null
    },
  })

  Object.assign(commands, {
    workspace_list: () => workspaceView(),
    workspace_create: (a: Record<string, unknown>) => {
      const name = cleanName(a.name as string, 'workspace/new/name', activeNames())
      const created: Workspace = {
        id: freshId('ws'),
        name,
        groupId: (a.groupId as string | null | undefined) ?? null,
        sortKey: fake.workspaces.length,
        settings: null,
        createdAt: now(),
        updatedAt: now(),
        archivedAt: null,
      }
      putWorkspace(created)
      workspacesChanged()
      return created
    },
    workspace_rename: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      putWorkspace({ ...row, name: cleanName(a.name as string, `workspace/${row.id}/name`, activeNames(row.id)), updatedAt: now() })
      workspacesChanged()
      return null
    },
    workspace_set_group: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      putWorkspace({ ...row, groupId: (a.groupId as string | null | undefined) ?? null, sortKey: a.sortKey as number, updatedAt: now() })
      workspacesChanged()
      return null
    },
    workspace_duplicate: (a: Record<string, unknown>) => {
      const source = workspaceRow(a.id as string)
      const name = cleanName(a.name as string, 'workspace/new/name', activeNames())
      const copy: Workspace = { ...source, id: freshId('ws'), name, sortKey: fake.workspaces.length, createdAt: now(), updatedAt: now(), archivedAt: null }
      putWorkspace(copy)
      const ids = new Map<string, string>()
      for (const [k, row] of [...library]) {
        if (homeOf(k) !== source.id) continue
        const id = freshId(row.kind === 'question' ? 'q' : row.kind === 'domain' ? 'dom' : row.kind)
        ids.set(k, id)
      }
      const map = (kind: string, id: string) => ids.get(key(kind, id)) ?? id
      for (const [k, row] of [...library]) {
        const id = ids.get(k)
        if (!id) continue
        const item = { ...row.item, id } as CatalogItem['item']
        if (row.kind === 'domain') (item as { questions: unknown }).questions = row.item.questions.map((m) => ({ ...m, questionId: map('question', m.questionId) }))
        library.set(key(row.kind, id), { kind: row.kind, item } as CatalogItem)
        homes.set(key(row.kind, id), copy.id)
      }
      for (const game of [...recipes.values()]) {
        if (recipeHomeOf(game.id) !== source.id) continue
        const id = freshId('game')
        recipes.set(id, {
          ...game,
          id,
          rev: 1,
          teams: game.teams.map((t) => map('team', t)),
          board: game.board.map((b) => ({ domainId: map('domain', b.domainId), questionIds: b.questionIds.map((q) => map('question', q)) })),
        })
        recipeHomes.set(id, copy.id)
      }
      workspacesChanged()
      return copy
    },
    workspace_archive: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      if (row.id === fake.currentWorkspace) refuse('catalog', `workspace/${row.id}: open another workspace before archiving this one`)
      putWorkspace({ ...row, archivedAt: now(), updatedAt: now() })
      workspacesChanged()
      return null
    },
    workspace_restore: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      if (row.name !== null) cleanName(row.name, `workspace/${row.id}/name`, activeNames(row.id))
      putWorkspace({ ...row, archivedAt: null, updatedAt: now() })
      workspacesChanged()
      return null
    },
    workspace_delete_preview: (a: Record<string, unknown>) => {
      const id = workspaceRow(a.id as string).id
      const games = [...recipes.keys()].filter((g) => recipeHomeOf(g) === id)
      return {
        rows: [...library.keys()].filter((k) => homeOf(k) === id && !k.startsWith('operator:')).length,
        games: games.length,
        plays: fake.plays.filter((p) => games.includes(p.recipeId)).length,
      } satisfies DeletePreview
    },
    workspace_delete: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      if (playOpen()) refuse('match', 'a Play is open')
      verifyActivePin(a.pin as string | null | undefined)
      if (row.archivedAt === null) refuse('catalog', `workspace/${row.id}: only an archived workspace can be deleted`)
      const counts = commands.workspace_delete_preview?.({ id: row.id }) as DeletePreview
      for (const k of [...library.keys()]) if (homeOf(k) === row.id && !k.startsWith('operator:')) library.delete(k)
      const games = [...recipes.keys()].filter((g) => recipeHomeOf(g) === row.id)
      games.forEach((g) => recipes.delete(g))
      fake.plays = fake.plays.filter((p) => !games.includes(p.recipeId))
      fake.workspaces = fake.workspaces.filter((w) => w.id !== row.id)
      workspacesChanged()
      return { ...counts, backup: `${fake.paths.backups}\\questiongame-pre-delete.sqlite3` } satisfies DeleteReport
    },
    workspace_switch: (a: Record<string, unknown>) => {
      const row = workspaceRow(a.id as string)
      if (playOpen()) refuse('match', 'a Play is open')
      if (row.archivedAt !== null) refuse('catalog', `workspace/${row.id}: an archived workspace cannot be opened`)
      fake.currentWorkspace = row.id
      return workspacesChanged()
    },
    workspace_group_create: (a: Record<string, unknown>) => {
      const name = cleanName(a.name as string, 'workspace-group/new/name', fake.workspaceGroups.map((g) => g.name))
      const group: WorkspaceGroup = { id: freshId('wsg'), name, sortKey: fake.workspaceGroups.length, createdAt: now(), updatedAt: now() }
      fake.workspaceGroups = [...fake.workspaceGroups, group]
      workspacesChanged()
      return group
    },
    workspace_group_rename: (a: Record<string, unknown>) => {
      const id = a.id as string
      const name = cleanName(a.name as string, `workspace-group/${id}/name`, fake.workspaceGroups.filter((g) => g.id !== id).map((g) => g.name))
      fake.workspaceGroups = fake.workspaceGroups.map((g) => (g.id === id ? { ...g, name, updatedAt: now() } : g))
      workspacesChanged()
      return null
    },
    workspace_group_reorder: (a: Record<string, unknown>) => {
      const order = a.order as string[]
      const rank = (id: string) => (order.includes(id) ? order.indexOf(id) : order.length)
      fake.workspaceGroups = [...fake.workspaceGroups].sort((x, y) => rank(x.id) - rank(y.id)).map((g, i) => ({ ...g, sortKey: i }))
      workspacesChanged()
      return null
    },
    workspace_group_delete: (a: Record<string, unknown>) => {
      const id = a.id as string
      fake.workspaceGroups = fake.workspaceGroups.filter((g) => g.id !== id)
      fake.workspaces = fake.workspaces.map((w) => (w.groupId === id ? { ...w, groupId: null } : w))
      workspacesChanged()
      return null
    },
    transfer_preview: (a: Record<string, unknown>) =>
      transfer(a.op as TransferOp, a.selection as Selection, (a.target as string | null | undefined) ?? null, false, a.withDomains !== false),
    catalog_copy_to: (a: Record<string, unknown>) => transfer('copy', a.selection as Selection, a.target as string, true, a.withDomains !== false),
    catalog_move_to: (a: Record<string, unknown>) => {
      const sel = a.selection as Selection
      if (fake.playState && sel.recipes?.includes(fake.playState.operator.recipeId)) refuse('match', 'a Play is open')
      return transfer('move', sel, a.target as string, true)
    },
    catalog_propagation_preview: (a: Record<string, unknown>) =>
      ({ update: familyCopies(a.item as CatalogItem), skipped: [] }) satisfies PropagationPreview,
    catalog_upsert_propagating: (a: Record<string, unknown>) => {
      const item = a.item as CatalogItem
      // `with`: this workspace's rows the same save changes (beta.3), written
      // in the same go — all of it, or nothing of it.
      const alongside = (a.with as CatalogItem[] | undefined) ?? []
      validate(item)
      alongside.forEach(validate)
      const copies = familyCopies(item)
      const before = new Map(library)
      try {
        upsert(item)
        alongside.forEach((row) => upsert(row))
      } catch (e) {
        library.clear()
        for (const [k, v] of before) library.set(k, v)
        throw e
      }
      emit('catalog-changed', { kind: item.kind, id: item.item.id, op: 'upserted' })
      for (const row of alongside) emit('catalog-changed', { kind: row.kind, id: row.item.id, op: 'upserted' })
      followCopies(item)
      return { update: copies, skipped: [] } satisfies PropagationPreview
    },
    catalog_family: (a: Record<string, unknown>) => {
      const row = library.get(key(a.kind as string, a.id as string))
      return row ? familyCopies(row) : []
    },
    // *Duplicate* here (beta.5), as the host does: new ids, no family, "(copy)" names numbered when taken.
    catalog_duplicate: (a: Record<string, unknown>) => {
      const kind = a.kind as 'team' | 'domain' | 'question'
      const ids = a.ids as string[]
      const sources = ids.map((id) => {
        const row = library.get(key(kind, id))
        if (!row || !inView(key(kind, id))) refuse('catalog', `${kind} ${id} not found`)
        return row
      })
      const named = (name: string) => {
        const taken = [...library.entries()]
          .filter(([k]) => k.startsWith(`${kind}:`) && inView(k))
          .map(([, r]) => (r.item as { name?: string }).name?.trim().toLowerCase())
        for (let n = 1; ; n++) {
          const candidate = n === 1 ? `${name} (copy)` : `${name} (copy ${n})`
          if (!taken.includes(candidate.toLowerCase())) return candidate
        }
      }
      const made: string[] = []
      for (const row of sources) {
        const id = freshId(kind === 'question' ? 'q' : kind === 'domain' ? 'dom' : 'team')
        const item = { ...row.item, id, createdAt: now(), updatedAt: now(), archivedAt: null, familyId: null } as CatalogItem['item']
        if (kind !== 'question') (item as { name: string }).name = named((row.item as { name: string }).name)
        library.set(key(kind, id), { kind, item } as CatalogItem)
        homes.set(key(kind, id), fake.currentWorkspace)
        if (kind === 'domain') {
          const remap = new Map<string, string>()
          domainGroups.set(id, (domainGroups.get(row.item.id) ?? []).map((g) => {
            const next = freshId('grp')
            remap.set(g.id, next)
            return { ...g, id: next, domainId: id }
          }))
          const d = library.get(key('domain', id))
          if (d?.kind === 'domain') library.set(key('domain', id), { kind: 'domain', item: { ...d.item, questions: d.item.questions.map((m) => ({ ...m, groupId: m.groupId ? (remap.get(m.groupId) ?? null) : null })) } })
        }
        if (kind === 'question') {
          for (const [k, d] of library) {
            if (d.kind !== 'domain' || !inView(k)) continue
            const member = d.item.questions.find((m) => m.questionId === row.item.id)
            if (!member) continue
            const sortKey = Math.max(-1, ...d.item.questions.map((m) => m.sortKey)) + 1
            library.set(k, { kind: 'domain', item: { ...d.item, questions: [...d.item.questions, { questionId: id, sortKey, groupId: member.groupId ?? null }] } })
            emit('catalog-changed', { kind: 'domain', id: d.item.id, op: 'upserted' })
          }
        }
        emit('catalog-changed', { kind, id, op: 'upserted' })
        made.push(id)
      }
      return made
    },
    // The fake's library holds no broken references: Repair finds none.
    library_repair: () => 0,
    tags_unify: () => 0,
    workspace_counts: () =>
      fake.workspaces.map((w) => {
        const count = (kind: string) => [...library.entries()].filter(([k, r]) => k.startsWith(`${kind}:`) && homeOf(k) === w.id && r.item.archivedAt === null).length
        return { workspace: w.id, teams: count('team'), domains: count('domain'), questions: count('question'), games: [...recipes.values()].filter((r) => recipeHomeOf(r.id) === w.id && r.archivedAt === null).length }
      }),
    catalog_unfollow: (a: Record<string, unknown>) => {
      families.delete(key(a.kind as string, a.id as string))
      emit('catalog-changed', { kind: a.kind, id: a.id, op: 'upserted' })
      return null
    },
  })

  /** Another workspace's Demo is its own rows, as on the host: `seed-<ws>-…`. */
  function scopedSeed<T>(value: T): T {
    if (fake.currentWorkspace === FIRST_WORKSPACE) return value
    return JSON.parse(JSON.stringify(value).replaceAll('"seed-', `"seed-${fake.currentWorkspace}-`)) as T
  }

  const fake: FakeHost = {
    calls,
    workspaces: [
      { id: FIRST_WORKSPACE, name: 'My library', groupId: null, sortKey: 0, settings: null, createdAt: 0, updatedAt: 0, archivedAt: null },
    ],
    workspaceGroups: [],
    currentWorkspace: FIRST_WORKSPACE,
    families,
    domainGroups,
    library,
    recipes,
    plays: [],
    playState: null,
    health: { status: 'ok', items: [] },
    stats: EMPTY_STATS,
    statsBy: {},
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
    channel: 'dev',
    betaStable: 'available',
    betaWelcomeSeen: false,
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
