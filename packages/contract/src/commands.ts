/**
 * Host commands and events (spec §13).
 *
 * The names are the wire contract. A Viewer click, an Action Panel button and a
 * keyboard chord all dispatch the same command — that shared interface is the
 * leverage the Play write seam buys (`01_codebase-design-spec-v1.md`).
 *
 * Payload shapes arrive with each phase that implements the command; the names
 * are frozen now so P3 can stub against them and P6 can wire them.
 */

/** Commands grouped by the module that owns them. */
export const COMMAND_GROUPS = {
  /** CatalogService — libraries and recipes. */
  catalog: [
    'catalog_list',
    'catalog_get',
    'catalog_upsert',
    /** Bulk (spec §2.19): one confirm, and so one transaction and one fsync. */
    'catalog_upsert_many',
    'catalog_archive',
    'catalog_archive_many',
    'catalog_restore',
    'catalog_restore_many',
    'catalog_search',
    /** What still points at a row — what the Archive confirm shows first. */
    'referenced_by',
    'asset_put',
    'recipe_list',
    'recipe_get',
    'recipe_upsert',
    /** A new, empty recipe seeded from the globals' game defaults (spec §12). */
    'recipe_new',
    'recipe_archive',
    'recipe_restore',
    'recipe_duplicate',
    'recipe_set_membership',
    'recipe_set_settings',
    'recipe_set_layout',
    'recipe_set_overlay',
    /** **Dev builds only.** Writes a demo library through the ordinary verbs so
     * P6 can be run before P7 has library tabs; spec §10's optional sample
     * catalog at first run is what replaces it. */
    'seed_demo_library',
  ],
  /** MatchService — the only writer of a Play. */
  match: [
    'play_load',
    'play_start',
    'pause',
    'resume',
    'restart',
    'abandon',
    'get_state',
    'choose_domain',
    'set_selection',
    'lock_selection',
    'start_timer',
    'pause_timer',
    'reveal_outcome',
    'give_token',
    /** Spec §2.6 path 2 as one atomic command: reveal, then pass. */
    'reveal_and_pass',
    'reorder_ring',
    'undo_turn',
    'redo_turn',
    /** The Timeline's rows. A command, not a `play-state` field: the log grows
     * for the life of a show and must not ride the 100ms tick. */
    'play_events',
    'play_list',
  ],
  /** PresentationService — writes reveals through MatchService. */
  presentation: [
    'show_screen',
    'reveal_stem',
    'reveal_next_option',
    'reveal_leaderboard_rank',
    'monitors_list',
    'stage_set_monitor',
    /** Create the Stage window without loading a recipe. */
    'stage_open',
    /** Stage reporting that it has mounted, with the contract version it was
     * built against. Writes nothing; asks for the current state. */
    'stage_ready',
    /** Operator calls an overlay by hand over whatever screen is up (the same
     * request shape the automatic path enqueues). */
    'show_overlay',
    'overlay_ack_complete',
  ],
  /** FlagService — settings and shortcuts. */
  flags: [
    'settings_get',
    'settings_set_global',
    'settings_set_current_game',
    'settings_set_shortcut',
  ],
  /** Read-only projections. */
  stats: ['stats_query'],
} as const

export type CommandGroup = keyof typeof COMMAND_GROUPS

export const COMMANDS = Object.values(COMMAND_GROUPS).flat() as readonly Command[]

export type Command =
  (typeof COMMAND_GROUPS)[CommandGroup][number]

export function groupOf(command: Command): CommandGroup | null {
  for (const [group, commands] of Object.entries(COMMAND_GROUPS)) {
    if ((commands as readonly string[]).includes(command)) return group as CommandGroup
  }
  return null
}

/**
 * Commands the Stage webview may issue. Both are Stage reporting on *itself* —
 * it is a projection, not a controller (spec §5.7).
 *
 * Enforced in the host, not only here: `crates/app/src/guard.rs` refuses every
 * other command that arrives from the `stage` webview, because Tauri does not
 * gate app-defined commands behind capabilities. Keep the two lists identical.
 *
 * `overlay_ack_complete` carries **every** `AnimKey`, not only overlay ones:
 * one door for the whole `anim-complete` handshake (spec §11.G).
 */
export const STAGE_COMMANDS = ['overlay_ack_complete', 'stage_ready'] as const
export type StageCommand = (typeof STAGE_COMMANDS)[number]

export function isStageCommand(command: string): command is StageCommand {
  return (STAGE_COMMANDS as readonly string[]).includes(command)
}

/**
 * Host → webview events.
 *
 * `play-state` goes to both windows and is the only one that does: `main` gets
 * the full snapshot (`PlayStateForMain`), `stage` the stripped one
 * (`PlayStateForStage`). Everything else is operator-facing and reaches `main`
 * alone — a leak onto Stage is a leak on camera (spec §5.7).
 */
export const EVENTS = [
  'catalog-changed',
  'recipe-changed',
  'play-state',
  'health',
  'monitors-changed',
  /** Spec §14 `{ code, severity, targetPath, actions[] }`. */
  'notice',
  'anim-complete',
] as const

export type EventName = (typeof EVENTS)[number]

/** Events the Stage webview subscribes to. */
export const STAGE_EVENTS = ['play-state'] as const
export type StageEvent = (typeof STAGE_EVENTS)[number]

/** `catalog-changed`. */
export interface CatalogChange {
  readonly kind: 'team' | 'domain' | 'question' | 'operator' | 'asset' | 'recipe'
  readonly id: string
  readonly op: 'upserted' | 'archived' | 'restored'
}

/** `recipe-changed`. */
export interface RecipeChange {
  readonly id: string
  readonly rev: number
}

/**
 * Spec §14. The host emits action **ids**, never labels: Studio owns the copy,
 * and anything variable arrives in `detail` for it to interpolate.
 *
 * At most three solve actions; dismiss is not one of them and always exists.
 */
export interface Notice {
  readonly code: string
  readonly severity: 'info' | 'warn' | 'error' | 'block'
  readonly targetPath: string | null
  readonly actions: readonly string[]
  readonly detail: Readonly<Record<string, string>>
}

/**
 * One connected display, in **logical** pixels — the host converts from
 * physical with `toLogical(scaleFactor)` before it emits (spec §7).
 *
 * `key` is the identity that survives an unplug: neither OS exposes a serial
 * number through Tauri, so it pairs the name with the resolution.
 */
export interface MonitorInfo {
  readonly key: string
  readonly name: string | null
  readonly primary: boolean
  readonly position: readonly [number, number]
  readonly size: readonly [number, number]
  readonly scaleFactor: number
}

/**
 * `monitors-changed`. The host **never picks a display** (spec §9): with no
 * remembered pick, Stage stays fullscreen on primary and waits for the operator
 * to send it somewhere.
 */
export interface MonitorsChanged {
  readonly monitors: readonly MonitorInfo[]
  /** The remembered pick, connected or not. */
  readonly stageMonitorId: string | null
  /** Where the Stage window actually stands. Null is the primary display. */
  readonly stageOn: string | null
}

/**
 * `stage.reattach` — what happens when the remembered display reappears
 * **during a Play**. Outside a Play, Stage always goes back to it: there is no
 * show to disturb.
 */
export type StageReattach = 'ask' | 'auto' | 'stay'
