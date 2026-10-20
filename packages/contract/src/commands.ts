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
    /** Many questions from one JSON file (spec §2.32). `commit: false` is the
     * dialog's preview and writes nothing; `commit: true` writes the same plan
     * in one transaction. Studio only. */
    'catalog_import_questions',
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
    /** A sample catalog (spec §2.27, §2.28, P11.17), written through the
     * ordinary verbs. `demo: 'en' | 'ro'` picks the Demo — `en` when absent,
     * which is all an older caller meant; the two share no row. `mode:
     * 'missing'` inserts what is absent and keeps edits; `'overwrite'`
     * rewrites every seed row of that Demo. First run, the Games empty state
     * and Settings ▸ Library are its call sites. */
    'catalog_seed_demo',
    /** How many of one Demo's seed rows are present, missing and edited — what
     * its Restore confirm names before it overwrites anything. */
    'catalog_seed_status',
    /** Rebuild the in-memory Tantivy index from the catalog (a health action). */
    'catalog_rebuild_search',
    /** Delete every closed Play and its events (spec §2.15). Refused while a
     * Play is open; asks the active operator's pin when one is set. Never a
     * library row: Archive is the only thing that happens to those. */
    'wipe_plays',
  ],
  /** MatchService — the only writer of a Play. */
  match: [
    'play_load',
    /** Take the recipe back out of Control. Legal whenever one is loaded; an
     * open Play is abandoned on the way out, and Stage returns to Idle
     * without the window moving or closing. */
    'play_unload',
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
    /**
     * Show the same picture on another display (§9, P11.11) — the operator
     * has two audience screens and no HDMI splitter, so the app is one.
     */
    'stage_add_mirror',
    'stage_remove_mirror',
    /** Create the Stage window without loading a recipe. */
    'stage_open',
    /** Stage reporting that it has mounted, with the contract version it was
     * built against. Writes nothing; asks for the current state. */
    'stage_ready',
    /** Operator calls an overlay by hand over whatever screen is up (the same
     * request shape the automatic path enqueues). */
    'show_overlay',
    'overlay_ack_complete',
    /** Stage reporting a fault on itself (a cue file that failed to load). The
     * host turns it into a health item; Stage never shows a notice (§5.7). */
    'stage_report',
  ],
  /** FlagService — settings and shortcuts. */
  flags: [
    'settings_get',
    'settings_set_global',
    'settings_set_current_game',
    'settings_set_shortcut',
    /** What these rules would pay, before a Play runs them (P11.12): the
     * points matrix over this recipe's own board, the band ladder, which
     * cascade level supplied the countdown, and which keys are currently
     * inert. A read — it computes with the same arithmetic `reveal_outcome`
     * scores with, and writes nothing. */
    'rules_preview',
    /** Set, change or clear an operator's pin. Digits go over the wire; the
     * host hashes (spec §2.15) — Studio never sees or makes a hash. */
    'operator_set_pin',
    /** Switch the active operator, with the pin when the target is pinned. */
    'operator_activate',
    /** Where the user data, the catalog and the cue pack live (first run). */
    'paths_get',
    /** Open one of those directories in the OS file manager. */
    'paths_reveal',
    /** Remove every generated user file and quit (spec §17 platform). Refused
     * while a Play is open; pin-gated. App files are the installer's (P12). */
    'uninstall_data',
    /** The current health report — what `health` last emitted. */
    'health_get',
    /** A webview reporting on itself into the host's log — an uncaught error,
     * a console warning, a render loop the watchdog noticed. Diagnostic only:
     * it changes nothing, and a webview's console does not otherwise survive
     * the window being killed. */
    'client_log',
    /** A webview's second for the performance log (P11.5): heap, DOM,
     * commits, long tasks, what it was showing. Untyped on the host side —
     * the webview owns the shape. Diagnostic only, callable by every webview. */
    'perf_report',
  ],
  /** Read-only projections. */
  stats: [
    'stats_query',
    /** Show or hide the optional Statistics window (§11.K). The host never
     * opens it on its own: a remembered display says *where*, this says *now*. */
    'stats_window',
  ],
  /** Groups inside a domain, tags on questions, bulk edits (Beta, P15) — organising only. */
  organise: [
    /** One edit for every selected question: tag, untag, group, add to / remove from a domain, set difficulty. `preview` writes nothing. */
    'catalog_bulk_edit',
    /** Every tag in view, with how many questions carry it and how many are shared. */
    'tag_list',
    /** Manage tags ▸ Rename (to an existing tag merges). */
    'tag_rename',
    /** Manage tags ▸ Delete, from every question in view. */
    'tag_delete',
    /** A group in a domain, named by the operator. */
    'domain_group_create',
    'domain_group_rename',
    'domain_group_reorder',
    /** The group goes; its questions stay in the domain, ungrouped. */
    'domain_group_delete',
  ],
  /** Workspaces (Beta 2.0): several libraries in one file and a shared one. The scope is the host's. */
  workspace: [
    /** Every workspace (archived ones flagged), every group, and which one Studio works in. */
    'workspace_list',
    /** A workspace the operator named; no name is ever suggested. */
    'workspace_create',
    /** Rename one — and name the one a library starts in. */
    'workspace_rename',
    /** Into a group, or none, at a place in it. */
    'workspace_set_group',
    /** A copy of every local row and game, no Plays; each copy joins its original's family. */
    'workspace_duplicate',
    /** Out of the switcher, rows kept. Not the current one. */
    'workspace_archive',
    'workspace_restore',
    /** What *Delete permanently* would remove: rows, games, Plays. */
    'workspace_delete_preview',
    /** An archived workspace, permanently. Pin-gated, refused while a game is loaded, backed up first. */
    'workspace_delete',
    /** Work in another workspace. Refused while a game is loaded. */
    'workspace_switch',
    'workspace_group_create',
    'workspace_group_rename',
    'workspace_group_reorder',
    /** The group goes; its workspaces stay, ungrouped. */
    'workspace_group_delete',
    /** What a copy, move or share would do: what comes along, what is reused, what refuses. Writes nothing. */
    'transfer_preview',
    /** New rows in another workspace, with what they need; a needed row with an active copy there is reused. */
    'catalog_copy_to',
    /** The same rows into another workspace, with what they need; refused while something staying uses one. */
    'catalog_move_to',
    /** This workspace's rows into the shared library, with a domain's questions and a row's asset. */
    'catalog_make_shared',
    /** Shared rows into this workspace; refused while another workspace uses one. */
    'catalog_make_local',
    /** Who else a save would update (its family), and who it would skip, and why. */
    'catalog_propagation_preview',
    /** *Also update {n} copies*: the save and every copy it can reach, one transaction. */
    'catalog_upsert_propagating',
    /** *Stop following its copies*: the row leaves its family. */
    'catalog_unfollow',
  ],
  /** The app itself (P12): the close guard's answers and the uninstaller. */
  app: [
    /** Studio's answer to `close-requested`: quit now. */
    'app_quit',
    /** Studio's answer to `close-requested`: keep working; the next close asks again. */
    'app_close_cancelled',
    /** Open the Windows uninstaller beside the exe and quit. Pin-gated, refused while a Play is loaded. */
    'app_uninstall',
    /** Settings ▸ About: version, build (`dev` | `release`), identifier. */
    'app_info',
    /** Is there a newer release on GitHub? The app's one network call, made in Rust (P12.9). */
    'update_check',
    /** Open a release's page; takes a version, never a URL (P12.9). */
    'update_open_release',
    /** Where What's new starts for this library; stamps a new one silently (P12.10). */
    'whats_new_get',
    /** The operator closed What's new (P12.10). */
    'whats_new_seen',
    /** questiongame Beta: is there a first-launch welcome to show, and is a stable library there to copy (P13.1). */
    'beta_welcome_get',
    /** questiongame Beta: *Start empty* — the welcome is done (P13.1). */
    'beta_welcome_done',
    /** questiongame Beta: copy the stable library, read-only, into an empty Beta library (P13.1). */
    'beta_copy_stable_library',
  ],
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
export const STAGE_COMMANDS = ['overlay_ack_complete', 'stage_ready', 'stage_report', 'client_log', 'perf_report'] as const
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
  'workspace-changed',
  'recipe-changed',
  'play-state',
  /** The countdown, and only the countdown. See {@link PlayTick}. */
  'play-tick',
  'health',
  'monitors-changed',
  /** Spec §14 `{ code, severity, targetPath, actions[] }`. */
  'notice',
  'anim-complete',
  /**
   * Studio's close button was pressed (P12). The host holds the window open
   * until Studio answers with `app_quit` or `app_close_cancelled`; a second
   * press exits regardless. `main` only.
   */
  'close-requested',
] as const

export type EventName = (typeof EVENTS)[number]

/** Events the Stage webview subscribes to. */
export const STAGE_EVENTS = ['play-state', 'play-tick'] as const
export type StageEvent = (typeof STAGE_EVENTS)[number]

/**
 * The 100 ms show loop, once the wire was split (P11.9).
 *
 * `play-state` used to carry the whole projection ten times a second while a
 * timer ran — ~8.4 KB × three webviews × 10 Hz, ~34 MB of JSON over a
 * fifteen-minute show — when the only fields that differed from the previous
 * emission were the two below. The host now decides which it is: a tick that
 * cannot change anything but the clock sends **this**, and `play-state` goes
 * back to being event-driven, emitted when something an operator did changed
 * the Play.
 *
 * The host's own rule is what makes that safe: `MatchService::tick` mutates
 * nothing except through the T=0 table, and everything else that can move a
 * Play arrives as a command. So a tick where T=0 is not due cannot have
 * changed anything else — the host asks `tick_due` and takes this path.
 *
 * A consumer merges it into the Play it already holds. `playId` is how a tick
 * that outlived its Play is dropped rather than applied to the next one.
 */
export interface PlayTick {
  readonly playId: string
  /** `session.timer.remainingMs`, or null at operator pace / with no session. */
  readonly remainingMs: number | null
  /** `clock.elapsedMs` — how long this Play has been running. */
  readonly elapsedMs: number
  /** `clock.running` — false while paused, so Stage does not interpolate. */
  readonly running: boolean
}

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
  /** Logical pixels. */
  readonly position: readonly [number, number]
  /**
   * **Logical** pixels: the panel's mode divided by `scaleFactor`, and so the
   * size of the CSS viewport a fullscreen webview on this display gets. On a
   * 1080p TV at Windows' default 150% that is 1280×720 — which is why Stage
   * fits its fixed canvas rather than laying it out at 1:1
   * (`apps/stage/src/templates/StageFit.tsx`).
   */
  readonly size: readonly [number, number]
  /**
   * The panel's real mode — 1920×1080 for that same TV, and the number its
   * owner and the OS display settings both call its resolution. **This is what
   * the operator is shown**; `size` is for geometry, not for reading.
   */
  readonly physicalSize: readonly [number, number]
  readonly scaleFactor: number
  /**
   * The panel's own name from its EDID (`Atomos Ninja V`), when the OS
   * exposes it; shown in preference to `name`, which on Windows is
   * `DISPLAY3`. Never part of the key.
   */
  readonly friendlyName: string | null
  /**
   * Panels the OS is **duplicating** this display onto. Windows reports a
   * Duplicate group as one display, so a recorder plugged in that way shows
   * up here and nowhere else: it already receives whatever this display
   * shows.
   */
  readonly alsoOn: readonly string[]
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
  /**
   * Where the **pacer** actually stands — the *place*, not the pick.
   *
   * **Resolved**: the primary display's own key rather than `null` when Stage
   * is on primary, so a consumer can tell "Stage is on primary" from "there is
   * no Stage". `null` means the window does not exist. Conflating the two is
   * what made Settings ▸ Monitors show no Stage anywhere while it was
   * fullscreen on the primary display (P11.11).
   */
  readonly stageOn: string | null
  /** Whether the Stage window exists at all. */
  readonly stageOpen: boolean
  /**
   * The displays mirroring the pacer right now, in the order they were added
   * (§9, P11.11). `stageOn` is still the pacer's, so a card knows which of the
   * three states it is in without a second field.
   */
  readonly stageMirrors: readonly string[]
  /** The display Statistics would open on, connected or not. */
  readonly statsMonitorId: string | null
  /**
   * Whether the Statistics window is on screen right now. Window state, not
   * settings state: the operator opens and closes it (§11.K), and the button
   * that does so takes its label from here.
   */
  readonly statsOpen: boolean
}

/**
 * `stage.reattach` — what happens when the remembered display reappears
 * **during a Play**. Outside a Play, Stage always goes back to it: there is no
 * show to disturb.
 */
export type StageReattach = 'ask' | 'auto' | 'stay'

/**
 * `health` (spec §11.J, 05_STUDIO_DESIGN.md §12.6). Silent until there is
 * something to say: the host emits a report only when it changed, and an `ok`
 * after a `warn` is a change too, so the status-bar dot clears. Every item is
 * a §14 notice with at least one action — a message is always paired with a
 * suggestion.
 */
export type HealthStatus = 'ok' | 'warn' | 'error'

export interface HealthReport {
  readonly status: HealthStatus
  readonly items: readonly Notice[]
}
