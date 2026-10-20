/**
 * The catalog, recipe and settings shapes as they cross the wire.
 *
 * These mirror `crates/host/src/catalog/model.rs`, `flags.rs` and
 * `settings.rs` field for field. They live in Studio, not in
 * `@questiongame/contract`, because Stage never sees a catalog row and the
 * contract is only what both webviews share.
 *
 * Naming follows the Rust serde attributes exactly: catalog entities are
 * `camelCase`, settings documents are `snake_case`, and `{ key, value }`
 * enums are adjacently tagged. A mismatch here is a runtime `undefined`, so
 * change a field on both sides in one commit.
 */

import type {
  CueKey,
  HealthReport,
  HealthStatus,
  OutcomeVerdict,
  RevealChannel,
  RevealMode,
  StageLanguage,
  StageReattach,
} from '@questiongame/contract'

export type { CueKey, HealthReport, HealthStatus, RevealChannel, RevealMode, StageReattach }

// --------------------------------------------------------------------- catalog

export type CatalogKind = 'team' | 'domain' | 'question' | 'operator' | 'asset' | 'recipe'
/** The kinds `catalog_list` accepts — recipes have their own verbs (§11.B). */
export type LibraryKind = Exclude<CatalogKind, 'recipe'>

export type ArchiveScope = 'active' | 'archived' | 'all'

/**
 * Who wrote the row: the shipped Demo (`seed`, §2.27) or the operator. A
 * seed row is a normal row after insert; the marker is what `catalog_seed_demo`
 * and the `seed` chip key on.
 */
export type Origin = 'seed' | 'operator'

export interface Stamps {
  readonly createdAt: number
  readonly updatedAt: number
  /** Set means archived — soft, restorable, never a delete (§4.1). */
  readonly archivedAt: number | null
  /**
   * In the shared library rather than this workspace (Beta 2.0). Read from
   * the row; on a save it only decides where a **new** row lands — an
   * existing row moves through copy, move or share. Always false for
   * operators and games.
   */
  readonly shared?: boolean
  /** The family of copies this row belongs to; host-owned, never sent back changed. */
  readonly familyId?: number | null
}

export interface Team extends Stamps {
  readonly id: string
  readonly origin: Origin
  readonly name: string
  readonly shortCode: string
  /** A design-system token where possible, otherwise a literal. */
  readonly color: string
  readonly logoAssetId: string | null
  readonly notes: string | null
  readonly playCount: number
  readonly lastPlayAt: number | null
}

export interface DomainMember {
  readonly questionId: string
  readonly sortKey: number
}

export interface Domain extends Stamps {
  readonly id: string
  readonly origin: Origin
  readonly name: string
  /** `TEC_881` — what the Stage card shows. */
  readonly code: string
  readonly description: string | null
  readonly questions: readonly DomainMember[]
}

export interface QuestionOption {
  readonly id: string
  readonly text: string
  readonly correct: boolean
}

export interface Question extends Stamps {
  readonly id: string
  readonly origin: Origin
  readonly stem: string
  readonly mediaAssetId: string | null
  readonly options: readonly QuestionOption[]
  /** 1–100, or `null` while unset — an incomplete question (§2.32). */
  readonly difficulty: number | null
  readonly explanation: string | null
}

export interface Operator extends Stamps {
  readonly id: string
  readonly displayName: string
  /** Never shown; its presence means "pinned" (§2.15). */
  readonly pinHash: string | null
  readonly lastActiveAt: number | null
  readonly playsRun: number
}

export interface Asset extends Stamps {
  readonly id: string
  readonly path: string
  readonly kind: string
}

export type CatalogItem =
  | { readonly kind: 'team'; readonly item: Team }
  | { readonly kind: 'domain'; readonly item: Domain }
  | { readonly kind: 'question'; readonly item: Question }
  | { readonly kind: 'operator'; readonly item: Operator }
  | { readonly kind: 'asset'; readonly item: Asset }

export type ItemOf<K extends LibraryKind> = Extract<CatalogItem, { kind: K }>['item']

export interface SearchQuery {
  readonly text: string
  /** Empty means every kind. */
  readonly kinds: readonly CatalogKind[]
  readonly scope: ArchiveScope
  readonly limit: number
}

export interface SearchHit {
  readonly kind: CatalogKind
  readonly id: string
  readonly score: number
}

// ---------------------------------------------------------------------- recipe

export interface TeamOverlay {
  readonly name?: string | null
  readonly shortCode?: string | null
  readonly color?: string | null
  readonly logoAssetId?: string | null
}

export interface DomainOverlay {
  readonly name?: string | null
  readonly code?: string | null
}

export interface QuestionOverlay {
  readonly stem?: string | null
  readonly options?: readonly QuestionOption[] | null
  readonly difficulty?: number | null
  readonly durationMs?: number | null
}

export interface RecipeOverlays {
  readonly teams: Readonly<Record<string, TeamOverlay>>
  readonly domains: Readonly<Record<string, DomainOverlay>>
  readonly questions: Readonly<Record<string, QuestionOverlay>>
}

/** Which side of ScopeConfirm an inline edit landed on (§2.17). */
export type EditScope = 'this_game' | 'original'

/** `recipe_set_overlay`'s target. `patch: null` is Reset. */
export type OverlaySpec =
  | { readonly target: 'team'; readonly id: string; readonly patch: TeamOverlay | null }
  | { readonly target: 'domain'; readonly id: string; readonly patch: DomainOverlay | null }
  | { readonly target: 'question'; readonly id: string; readonly patch: QuestionOverlay | null }

export interface BoardDomain {
  readonly domainId: string
  readonly questionIds: readonly string[]
}

export interface Recipe extends Stamps {
  readonly id: string
  readonly origin: Origin
  readonly name: string
  readonly folder: string | null
  readonly tags: readonly string[]
  /** Roster in play order — the opening ring (§4.3). */
  readonly teams: readonly string[]
  readonly board: readonly BoardDomain[]
  readonly settings: GameSettings
  readonly layout: Record<string, unknown>
  readonly overlays: RecipeOverlays
  readonly rev: number
}

/** One Timeline row (`play_events`). The kind is `{ type, ...fields }`. */
export interface PlayEvent {
  readonly seq: number
  readonly id: string
  readonly atMs: number
  readonly kind: { readonly type: string } & Record<string, unknown>
}

export interface PlayRecord {
  readonly id: string
  readonly recipeId: string
  /** Who ran it, from the log. Null for a Play run with no active operator. */
  readonly operatorId: string | null
  readonly status: string
  readonly startedAtMs: number | null
  readonly endedAtMs: number | null
  readonly eventCount: number
  readonly questionsConsumed: number
  readonly scores: Readonly<Record<string, number>>
}

// -------------------------------------------------------------------- settings

export type ScoringMode = 'flat' | 'difficulty' | 'lock_speed'
export type LockSpeedBase = 'flat' | 'difficulty'

export interface DifficultyBand {
  readonly up_to: number
  readonly points: number
}

export type DifficultyMap =
  | { readonly kind: 'linear'; readonly factor: number }
  | { readonly kind: 'bands'; readonly bands: readonly DifficultyBand[] }

/**
 * Where the lock-speed bonus reaches zero (P11.12). `{ kind: 'fraction',
 * value: 1 }` is the whole clock — the pre-P11.12 formula, and the default.
 * `{ kind: 'ms' }` decays over absolute milliseconds, so the same answer time
 * is worth the same on every question whatever its countdown.
 */
export type SpeedWindow =
  | { readonly kind: 'fraction'; readonly value: number }
  | { readonly kind: 'ms'; readonly value: number }

export interface ScoringSettings {
  readonly mode: ScoringMode
  readonly flat_points: number
  readonly difficulty_map: DifficultyMap
  readonly speed_weight: number
  readonly lock_speed_enabled: boolean
  readonly lock_speed_base: LockSpeedBase
  readonly speed_window: SpeedWindow
  /** Equal bands across the window; every lock inside one is worth the same. */
  readonly speed_steps: number | null
}

export interface JudgingSettings {
  readonly partial_credit: boolean
  readonly order_matters: boolean
}

export interface ConsecutiveBonus {
  readonly count: number
  readonly award: number
}

export interface TurnSettings {
  readonly max_consecutive_correct: number | null
  readonly bonus_after_consecutive: ConsecutiveBonus | null
}

/** One level of the §2.18 cascade; `null` inherits the level below. */
export interface TimerLevel {
  readonly enabled: boolean | null
  readonly duration_ms: number | null
}

export interface RevealSettings {
  readonly question: RevealMode
  readonly answers: RevealMode
  readonly outcome: RevealMode
  readonly leaderboard: RevealMode
}

/** The recipe's B5 document. */
export interface BoardSettings {
  readonly allow_repeated_difficulty: boolean
}

export interface GameSettings {
  readonly scoring: ScoringSettings
  readonly judging: JudgingSettings
  readonly turn: TurnSettings
  readonly timer: TimerLevel
  readonly reveal: RevealSettings
  /** Stage's authored-copy language (`stage.language`). Live, never frozen. */
  readonly language: StageLanguage
  /** What the board may select (`board.allow_repeated_difficulty`, P12.7). Game-affecting: frozen at Play start. */
  readonly board: BoardSettings
}

export type OverrideAfterLock = 'allow' | 'refuse_until_reveal'
export type MosaicDensity = 'compact' | 'comfortable' | 'spacious'

/**
 * Control-behaviour audio (§2.25, §12.5). `cues` maps every key to a file in
 * the bundled pack, or `null` for a cue the operator muted. Live mid-Play.
 */
export interface AudioSettings {
  /** 0–100. */
  readonly volume: number
  readonly muted: boolean
  readonly cues: Readonly<Record<CueKey, string | null>>
}

export interface ControlSettings {
  readonly override_after_lock: OverrideAfterLock
  readonly reveal: RevealSettings
  readonly overlay_animations_enabled: boolean
  readonly viewer_hit_targets: boolean
  readonly mosaic_density: MosaicDensity
  readonly stage_monitor_id: string | null
  /** The displays mirroring the pacer (§9, P11.11). Empty is one display. */
  readonly stage_mirror_ids: readonly string[]
  /** Where Statistics opens **when asked**. Remembering is not showing (§13.3). */
  readonly stats_monitor_id: string | null
  /** Fullscreen that window, or leave it sizable. */
  readonly stats_fullscreen: boolean
  readonly stage_reattach: StageReattach
  readonly audio: AudioSettings
}

export interface FeatureRoots {
  readonly audio: boolean
  readonly audio_synth: boolean
  readonly search: boolean
  readonly statistics: boolean
}

export interface GlobalSettings {
  readonly timer: TimerLevel
  readonly game_defaults: GameSettings
  readonly control: ControlSettings
  readonly features: FeatureRoots
  readonly shortcuts: Readonly<Record<string, string>>
  /** Who is at the keyboard (§2.15). Null until an operator exists. */
  readonly active_operator_id: string | null
  /** "Is there a newer release?" (P12.9). The app's only network call. */
  readonly updates: { readonly check_on_start: boolean }
}

/** `update_check` (P12.9): the running version, GitHub's latest, and whether it is newer. */
export interface UpdateStatus {
  readonly current: string
  readonly latest: string | null
  readonly url: string | null
  readonly newer: boolean
  /** Beta running a prerelease only: a stable release newer than it. Absent on stable. */
  readonly stableNewer?: string
}

export type DisabledReason =
  | { readonly reason: 'frozen' }
  | { readonly reason: 'inert'; readonly detail: string }
  | { readonly reason: 'feature_off'; readonly detail: string }

export type Disabled = { readonly key: string } & DisabledReason

/** `settings_get` — the whole document plus what is disabled right now. */
export interface SettingsView {
  readonly globals: GlobalSettings
  readonly currentGame: GameSettings | null
  readonly control: ControlSettings
  readonly gameAffectingFrozen: boolean
  readonly disabled: readonly Disabled[]
}

/** `settings_set_current_game`'s payload, `{ key, value }`. */
export type GameSetting =
  | { readonly key: 'scoring_mode'; readonly value: ScoringMode }
  | { readonly key: 'flat_points'; readonly value: number }
  | { readonly key: 'difficulty_map'; readonly value: DifficultyMap }
  | { readonly key: 'speed_weight'; readonly value: number }
  | { readonly key: 'speed_window'; readonly value: SpeedWindow }
  | { readonly key: 'speed_steps'; readonly value: number | null }
  | { readonly key: 'lock_speed_enabled'; readonly value: boolean }
  | { readonly key: 'lock_speed_base'; readonly value: LockSpeedBase }
  | { readonly key: 'max_consecutive_correct'; readonly value: number | null }
  | { readonly key: 'bonus_after_consecutive'; readonly value: ConsecutiveBonus | null }
  | { readonly key: 'partial_credit'; readonly value: boolean }
  | { readonly key: 'order_matters'; readonly value: boolean }
  | { readonly key: 'timer_enabled'; readonly value: boolean | null }
  | { readonly key: 'timer_duration_ms'; readonly value: number | null }
  | { readonly key: 'reveal'; readonly value: readonly [RevealChannel, RevealMode] }
  | { readonly key: 'language'; readonly value: StageLanguage }

/** `settings_set_global`'s payload. */
export type GlobalSetting =
  | { readonly key: 'timer_enabled'; readonly value: boolean }
  | { readonly key: 'updates_check_on_start'; readonly value: boolean }
  | { readonly key: 'timer_duration_ms'; readonly value: number }
  | { readonly key: 'game'; readonly value: GameSetting }
  | { readonly key: 'override_after_lock'; readonly value: OverrideAfterLock }
  | { readonly key: 'reveal'; readonly value: readonly [RevealChannel, RevealMode] }
  | { readonly key: 'overlay_animations_enabled'; readonly value: boolean }
  | { readonly key: 'viewer_hit_targets'; readonly value: boolean }
  | { readonly key: 'mosaic_density'; readonly value: MosaicDensity }
  | { readonly key: 'stage_monitor_id'; readonly value: string | null }
  | { readonly key: 'stats_monitor_id'; readonly value: string | null }
  | { readonly key: 'stats_fullscreen'; readonly value: boolean }
  | { readonly key: 'stage_reattach'; readonly value: StageReattach }
  | { readonly key: 'feature'; readonly value: readonly [string, boolean] }
  | { readonly key: 'active_operator_id'; readonly value: string | null }
  | { readonly key: 'audio_volume'; readonly value: number }
  | { readonly key: 'audio_muted'; readonly value: boolean }
  | { readonly key: 'audio_cue'; readonly value: readonly [CueKey, string | null] }

// ------------------------------------------------ incomplete questions · import

/** §2.32 — one reason a question cannot go on a board yet, in reading order. */
export type QuestionGap = 'stem' | 'options' | 'correct' | 'difficulty' | 'domain'

/** A value an imported row carried and the import dropped — said, not swallowed. */
export interface ImportIgnored {
  /** `difficulty`, `options[2]`, `options[3].correct`, or an unknown key as written. */
  readonly field: string
  readonly why: 'unknown' | 'wrong_type' | 'out_of_range' | 'empty'
}

/** One row of `catalog_import_questions`' report (§2.32, 05_STUDIO_DESIGN.md §17.3). */
export interface ImportRow {
  /** 1-based, as a list is numbered. */
  readonly index: number
  readonly status: 'complete' | 'incomplete' | 'duplicate' | 'rejected'
  readonly stem: string
  /** The domains it lands in, by name — existing or new. */
  readonly domains: readonly string[]
  readonly gaps: readonly QuestionGap[]
  readonly ignored: readonly ImportIgnored[]
  readonly reason: 'not_an_object' | 'no_content' | null
}

export interface ImportCounts {
  readonly complete: number
  readonly incomplete: number
  readonly duplicate: number
  readonly rejected: number
}

/** `catalog_import_questions`' answer — the preview and the commit alike. */
export interface ImportReport {
  readonly committed: boolean
  readonly rows: readonly ImportRow[]
  readonly newDomains: readonly { readonly name: string; readonly code: string }[]
  readonly counts: ImportCounts
}

// ---------------------------------------------------------- seed · data · paths

/** Which shipped Demo (P11.17): English, or Romanian. They share no row. */
export type SeedDemo = 'en' | 'ro'

/** `catalog_seed_demo`: insert what is absent, or rewrite every seed row (§2.28). */
export type SeedMode = 'missing' | 'overwrite'

/** `catalog_seed_status` — what Restore Demo's confirm names. */
export interface SeedStatus {
  readonly present: number
  readonly missing: number
  /** Present, but the body differs from the shipped Demo. */
  readonly edited: number
}

/** `catalog_seed_demo`'s answer. */
export interface SeedResult {
  readonly recipeId: string
  readonly inserted: number
  readonly overwritten: number
}

/** `paths_get` — where the generated files live (§12.1, §12.3). */
/** `app_info` — what Settings ▸ About says this build is (P12.3). */
export interface AppInfo {
  readonly version: string
  readonly build: 'dev' | 'release' | 'e2e' | 'beta'
  readonly identifier: string
  /** What the Beta chip and the welcome read (`identity::Channel::wire`). */
  readonly channel: 'stable' | 'beta' | 'dev'
}

// ---------------------------------------------------------------- workspaces

/** One library among several in the file (Beta 2.0). `name` is null until the operator names it. */
export interface Workspace {
  readonly id: string
  readonly name: string | null
  readonly groupId: string | null
  readonly sortKey: number
  readonly settings: unknown
  readonly createdAt: number
  readonly updatedAt: number
  readonly archivedAt: number | null
}

export interface WorkspaceGroup {
  readonly id: string
  readonly name: string
  readonly sortKey: number
  readonly createdAt: number
  readonly updatedAt: number
}

/** What `workspace_list` answers and `workspace-changed` carries. */
export interface Workspaces {
  readonly current: string
  readonly workspaces: readonly Workspace[]
  readonly groups: readonly WorkspaceGroup[]
}

/** *Delete permanently*'s counts, asked before it runs. */
export interface DeletePreview {
  readonly rows: number
  readonly games: number
  readonly plays: number
}

export interface DeleteReport extends DeletePreview {
  readonly backup: string
}

/** What a transfer acts on, by kind. */
export interface Selection {
  readonly teams?: readonly string[]
  readonly domains?: readonly string[]
  readonly questions?: readonly string[]
  readonly recipes?: readonly string[]
}

export type TransferOp = 'copy' | 'move' | 'make_shared' | 'make_local'

/** One row a transfer touched: where it ends up, where it came from, whether it was picked. */
export interface Touched {
  readonly kind: CatalogKind
  readonly id: string
  readonly from: string
  readonly picked: boolean
}

export interface Refusal {
  readonly kind: CatalogKind
  readonly id: string
  /** `game Demo`, `domain Science in workspace Club`. */
  readonly usedBy: string
}

export interface TransferReport {
  readonly created: readonly Touched[]
  readonly reused: readonly Touched[]
  readonly moved: readonly Touched[]
  readonly refused: readonly Refusal[]
}

export interface FamilyCopy {
  readonly id: string
  /** null — the shared library. */
  readonly workspace: string | null
  readonly workspaceName: string | null
  readonly archived: boolean
}

export interface PropagationPreview {
  readonly update: readonly FamilyCopy[]
  readonly skipped: readonly { readonly copy: FamilyCopy; readonly reason: string }[]
}

/** What `beta_welcome_get` answers (P13.1). */
export interface BetaWelcome {
  readonly show: boolean
  readonly stable: 'available' | 'missing' | 'running'
}

export interface AppPaths {
  readonly userData: string
  readonly catalog: string
  /** `questiongame.log`, beside the library (P12.1). */
  readonly logFile: string
  /** The performance log's folder (P12.1). */
  readonly perfDir: string
  /** Copies of the library taken before an update changed it, the newest five (P12.6). */
  readonly backups: string
  /** Null in a release build: the pack is embedded, so there is no folder (P12.1). */
  readonly cuePack: string | null
  /** The Windows uninstaller beside the exe; null when this copy was not installed (P12.2). */
  readonly uninstaller: string | null
}

/** `paths_reveal { which }` — the directories the OS file manager can open. */
export type PathKind = 'userData' | 'cuePack' | 'displaySettings'

// ------------------------------------------------------------------ helpers

export function isArchived(row: Stamps): boolean {
  return row.archivedAt !== null
}

/** Derived from the correct ticks, never authored (§2.17). */
export function answerMode(question: Pick<Question, 'options'>): 'single' | 'multiple' {
  return question.options.filter((o) => o.correct).length > 1 ? 'multiple' : 'single'
}

export type DifficultyBandName = 'easy' | 'medium' | 'hard'

/** Fixed thresholds (05_STUDIO_DESIGN.md §4.6): ≤33 easy, ≤66 medium, else hard. */
export function difficultyBand(difficulty: number): DifficultyBandName {
  if (difficulty <= 33) return 'easy'
  if (difficulty <= 66) return 'medium'
  return 'hard'
}

// ------------------------------------------------------------------ statistics

/** What one row of a `stats_query` answer stands for (§11.K). */
export type StatsDimension = 'team' | 'domain' | 'question' | 'difficulty' | 'operator' | 'recipe' | 'play' | 'day'

/** A column. The unit is the metric's, so a table and a chart agree. */
export type StatsMetric =
  | 'turns'
  | 'correct'
  | 'incorrect'
  | 'partial'
  | 'accuracy'
  | 'points'
  | 'bonus'
  | 'avg_points'
  | 'avg_lock_ms'
  | 'fastest_lock_ms'
  | 'plays'

export type StatsUnit = 'count' | 'points' | 'ratio' | 'milliseconds'

/** §11.K's compound filter: every variable, and time. An empty list is "any". */
export interface StatsFilter {
  readonly fromMs?: number | null
  readonly toMs?: number | null
  readonly playIds?: readonly string[]
  readonly recipeIds?: readonly string[]
  readonly operatorIds?: readonly string[]
  readonly teamIds?: readonly string[]
  readonly domainIds?: readonly string[]
  readonly questionIds?: readonly string[]
  readonly verdicts?: readonly OutcomeVerdict[]
  readonly minDifficulty?: number | null
  readonly maxDifficulty?: number | null
  /** A one-team Play is legal and skews an average; off unless asked for. */
  readonly includeRehearsal?: boolean
  /** Every workspace's Plays, not only this one's (Beta 2.0). */
  readonly allWorkspaces?: boolean
}

export interface StatsQuery {
  readonly filter?: StatsFilter
  readonly groupBy?: StatsDimension
  /** The columns, in order. Empty means the host's defaults. */
  readonly metrics?: readonly StatsMetric[]
  readonly limit?: number | null
  /**
   * How many individual turns to return alongside the rows, newest first —
   * the award ledger (P11.12). Omitted or `0` returns none, so a view that
   * only draws numbers pays nothing for one it does not.
   */
  readonly detail?: number
}

export interface StatsRow {
  readonly key: string
  readonly label: string
  /** One per requested metric, same order. `null` = nothing to average. */
  readonly values: readonly (number | null)[]
  readonly turns: number
  readonly plays: number
}

export interface StatsResult {
  readonly groupBy: StatsDimension
  readonly metrics: readonly StatsMetric[]
  readonly rows: readonly StatsRow[]
  readonly totals: StatsRow
  readonly playCount: number
  readonly turnCount: number
  /** The award ledger, when `query.detail` asked for it. */
  readonly turns?: readonly TurnAward[]
}

// ------------------------------------------------------------- the award ledger

export type Verdict = 'correct' | 'incorrect' | 'partial'

export interface Judgement {
  readonly verdict: Verdict
  readonly correctLocked: number
  readonly incorrectLocked: number
  readonly correctTotal: number
}

/** One band of `difficulty_map: bands`, with both bounds resolved. */
export interface BandSpan {
  readonly index: number
  readonly from: number
  readonly upTo: number
  /** False when an earlier band already covers this ceiling: it can never pay. */
  readonly reachable: boolean
  readonly points: number
}

/** Which base paid, and everything needed to say so in words. */
export type BaseSource =
  | { readonly kind: 'flat'; readonly points: number }
  | { readonly kind: 'linear'; readonly factor: number; readonly difficulty: number }
  | ({ readonly kind: 'band'; readonly aboveLast: boolean } & BandSpan)
  | { readonly kind: 'noBands' }

/** Why the speed factor was exactly 1.0 — five distinct ways a weight does nothing. */
export type SpeedOff = 'mode_off' | 'operator_pace' | 'never_locked' | 'weight_zero' | 'outside_window'

export type SpeedFactor =
  | { readonly state: 'off'; readonly reason: SpeedOff }
  | {
      readonly state: 'on'
      readonly weight: number
      readonly durationMs: number
      readonly windowMs: number
      readonly elapsedMs: number
      readonly remainingMs: number
      readonly steps: number | null
      /** 0–1: the share of the bonus this lock earned. */
      readonly progress: number
      /** `1 + weight × progress`. */
      readonly multiplier: number
    }

export interface PartialShare {
  readonly correctLocked: number
  readonly incorrectLocked: number
  readonly correctTotal: number
  readonly share: number
}

export interface BonusAward {
  readonly streak: number
  readonly count: number
  readonly award: number
}

/** One award, step by step, in the order the steps are applied. */
export interface AwardBreakdown {
  readonly judgement: Judgement
  readonly base: number
  readonly baseFrom: BaseSource
  readonly speed: SpeedFactor
  /** `floor(base × multiplier)`, before the verdict has its say. */
  readonly scaled: number
  readonly share: PartialShare | null
  readonly points: number
  readonly bonus: BonusAward | null
  readonly total: number
}

/**
 * One resolved turn with its award taken apart.
 *
 * **`points + bonus` is the truth; `award.total` is the working.** They agree
 * — the host has property tests and a whole-Play replay saying so — but the
 * record is what the scoreboard showed, so the ledger's TOTAL column reads the
 * recorded number and uses the breakdown to explain it.
 */
export interface TurnAward {
  readonly playId: string
  readonly recipeId: string
  readonly atMs: number
  readonly teamId: string
  readonly teamName: string
  readonly domainId: string
  readonly domainName: string
  readonly questionId: string
  readonly questionStem: string
  readonly difficulty: number
  readonly verdict: Verdict
  readonly points: number
  readonly bonus: number
  readonly remainingMsAtLock: number | null
  readonly timerDurationMs: number | null
  readonly autoLocked: boolean
  /** Consecutive corrects on this token including this one; 0 if not correct. */
  readonly streak: number
  readonly tokenEnds: boolean
  readonly operatorId: string | null
  readonly rehearsal: boolean
  readonly award: AwardBreakdown
}

// ----------------------------------------------------------- the rules preview

export type LockSample =
  | { readonly kind: 'instant' }
  | { readonly kind: 'quarters'; readonly left: number }
  | { readonly kind: 'buzzer' }
  | { readonly kind: 'neverLocked' }
  | { readonly kind: 'operatorPace' }

export interface PreviewColumn {
  readonly lock: LockSample
  readonly remainingMs: number | null
}

export interface PreviewRow {
  readonly difficulty: number
  readonly questionCount: number
  readonly domains: readonly string[]
  readonly base: number
  readonly baseFrom: BaseSource
  readonly correct: readonly AwardBreakdown[]
  readonly partial: readonly AwardBreakdown[] | null
  readonly incorrect: number
}

export type TimerSource = 'recipe' | 'globals' | 'operator_pace'

export interface TimerResolution {
  readonly enabled: boolean
  readonly durationMs: number | null
  readonly source: TimerSource
  /** Board questions carrying a duration of their own. */
  readonly perQuestion: number
  readonly speedWindowMs: number | null
}

export interface DomainLadder {
  readonly id: string
  readonly name: string
  readonly questions: number
  readonly minDifficulty: number
  readonly maxDifficulty: number
  /** Difficulties in walk order — easy to hard, the order questions issue in. */
  readonly ladder: readonly number[]
  readonly pointsAvailable: number
}

export interface Rung {
  readonly index: number
  readonly difficulty: number
  readonly base: number
}

/**
 * What kind of board this is. `aligned` — same count *and* the same ladder in
 * every domain — is the one that collapses to a single rung table, because
 * then one table is the whole truth about the board.
 */
export type BoardShape =
  | { readonly kind: 'empty' }
  | {
      readonly kind: 'aligned'
      readonly perDomain: number
      readonly rungs: readonly Rung[]
      readonly domains: readonly DomainLadder[]
    }
  | { readonly kind: 'uniform'; readonly perDomain: number; readonly domains: readonly DomainLadder[] }
  | {
      readonly kind: 'ragged'
      readonly min: number
      readonly max: number
      readonly domains: readonly DomainLadder[]
    }

/** Something about this combination that will surprise the operator mid-show. */
export type PreviewWarning =
  | { readonly code: 'mixedDurations'; readonly questions: number }
  | { readonly code: 'speedWithoutTimer' }
  | { readonly code: 'bandsNotMonotonic'; readonly index: number }
  | { readonly code: 'unreachableBand'; readonly index: number; readonly upTo: number }
  | { readonly code: 'aboveLastBand'; readonly questions: number; readonly upTo: number }
  | { readonly code: 'bonusUnreachable'; readonly count: number; readonly cap: number }
  | { readonly code: 'raggedBoard'; readonly min: number; readonly max: number }
  | { readonly code: 'flatBoard'; readonly difficulty: number }
  | { readonly code: 'duplicateDifficulty'; readonly difficulty: number; readonly questions: number }
  | { readonly code: 'incompleteQuestions'; readonly questions: number }

/**
 * What a setting is set to, structured. The host sends codes and numbers; the
 * readable string is `copy/preview.ts`'s, like every other host label.
 */
export type RuleValue =
  | { readonly kind: 'unset' }
  | { readonly kind: 'flag'; readonly value: boolean }
  | { readonly kind: 'points'; readonly value: number }
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'ms'; readonly value: number }
  | { readonly kind: 'choice'; readonly value: string }
  | { readonly kind: 'linear'; readonly value: number }
  | { readonly kind: 'bands'; readonly value: number }
  | { readonly kind: 'fraction'; readonly value: number }
  | { readonly kind: 'streak'; readonly value: { readonly count: number; readonly award: number } }
  | { readonly kind: 'inherited'; readonly value: boolean }

/**
 * What one award key is doing right now.
 *
 * **`off` and `disabled` are different, and conflating them was a bug.** A
 * switch the operator turned off is perfectly usable and simply not
 * contributing; a disabled key cannot contribute whatever its value, because a
 * sibling setting neutralised it. Reading only the second made an off switch
 * render as "in use" — Rules claimed partial credit was on while the form
 * right above it showed the switch off (2026-09-10).
 */
export type RuleState =
  | { readonly state: 'active' }
  | { readonly state: 'off' }
  | ({ readonly state: 'disabled' } & DisabledReason)

/** One award key: what it is doing, and what it is set to. */
export type RuleEffect = { readonly key: string; readonly value: RuleValue } & RuleState

/** `rules_preview` — what these rules would pay, before a Play runs them. */
export interface RulesPreview {
  readonly timer: TimerResolution
  readonly bands: readonly BandSpan[]
  readonly columns: readonly PreviewColumn[]
  readonly rows: readonly PreviewRow[]
  readonly board: BoardShape
  /**
   * The point of truth for the effects table: every award key, in the order
   * the formula applies them, with its state and its current value.
   */
  readonly rules: readonly RuleEffect[]
  /** The disabled subset, for the form's greying. Derived from `rules`. */
  readonly effects: readonly Disabled[]
  readonly warnings: readonly PreviewWarning[]
}

/** The metric's unit, mirroring `StatsMetric::unit` in the host. */
export function statsUnit(metric: StatsMetric): StatsUnit {
  switch (metric) {
    case 'accuracy':
      return 'ratio'
    case 'points':
    case 'bonus':
    case 'avg_points':
      return 'points'
    case 'avg_lock_ms':
    case 'fastest_lock_ms':
      return 'milliseconds'
    default:
      return 'count'
  }
}
