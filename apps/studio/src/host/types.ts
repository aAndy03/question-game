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

import type { RevealChannel, RevealMode, StageReattach } from '@questiongame/contract'

export type { RevealChannel, RevealMode, StageReattach }

// --------------------------------------------------------------------- catalog

export type CatalogKind = 'team' | 'domain' | 'question' | 'operator' | 'asset' | 'recipe'
/** The kinds `catalog_list` accepts — recipes have their own verbs (§11.B). */
export type LibraryKind = Exclude<CatalogKind, 'recipe'>

export type ArchiveScope = 'active' | 'archived' | 'all'

export interface Stamps {
  readonly createdAt: number
  readonly updatedAt: number
  /** Set means archived — soft, restorable, never a delete (§4.1). */
  readonly archivedAt: number | null
}

export interface Team extends Stamps {
  readonly id: string
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
  readonly stem: string
  readonly mediaAssetId: string | null
  readonly options: readonly QuestionOption[]
  /** 1–100. */
  readonly difficulty: number
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

export interface ScoringSettings {
  readonly mode: ScoringMode
  readonly flat_points: number
  readonly difficulty_map: DifficultyMap
  readonly speed_weight: number
  readonly lock_speed_enabled: boolean
  readonly lock_speed_base: LockSpeedBase
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
export interface GameSettings {
  readonly scoring: ScoringSettings
  readonly judging: JudgingSettings
  readonly turn: TurnSettings
  readonly timer: TimerLevel
  readonly reveal: RevealSettings
}

export type OverrideAfterLock = 'allow' | 'refuse_until_reveal'
export type MosaicDensity = 'compact' | 'comfortable' | 'spacious'

export interface ControlSettings {
  readonly override_after_lock: OverrideAfterLock
  readonly reveal: RevealSettings
  readonly overlay_animations_enabled: boolean
  readonly viewer_hit_targets: boolean
  readonly mosaic_density: MosaicDensity
  readonly stage_monitor_id: string | null
  readonly stats_monitor_id: string | null
  readonly stage_reattach: StageReattach
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
  | { readonly key: 'lock_speed_enabled'; readonly value: boolean }
  | { readonly key: 'lock_speed_base'; readonly value: LockSpeedBase }
  | { readonly key: 'max_consecutive_correct'; readonly value: number | null }
  | { readonly key: 'bonus_after_consecutive'; readonly value: ConsecutiveBonus | null }
  | { readonly key: 'partial_credit'; readonly value: boolean }
  | { readonly key: 'order_matters'; readonly value: boolean }
  | { readonly key: 'timer_enabled'; readonly value: boolean | null }
  | { readonly key: 'timer_duration_ms'; readonly value: number | null }
  | { readonly key: 'reveal'; readonly value: readonly [RevealChannel, RevealMode] }

/** `settings_set_global`'s payload. */
export type GlobalSetting =
  | { readonly key: 'timer_enabled'; readonly value: boolean }
  | { readonly key: 'timer_duration_ms'; readonly value: number }
  | { readonly key: 'game'; readonly value: GameSetting }
  | { readonly key: 'override_after_lock'; readonly value: OverrideAfterLock }
  | { readonly key: 'reveal'; readonly value: readonly [RevealChannel, RevealMode] }
  | { readonly key: 'overlay_animations_enabled'; readonly value: boolean }
  | { readonly key: 'viewer_hit_targets'; readonly value: boolean }
  | { readonly key: 'mosaic_density'; readonly value: MosaicDensity }
  | { readonly key: 'stage_monitor_id'; readonly value: string | null }
  | { readonly key: 'stats_monitor_id'; readonly value: string | null }
  | { readonly key: 'stage_reattach'; readonly value: StageReattach }
  | { readonly key: 'feature'; readonly value: readonly [string, boolean] }
  | { readonly key: 'active_operator_id'; readonly value: string | null }

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
