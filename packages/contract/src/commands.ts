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
    'catalog_archive',
    'catalog_restore',
    'catalog_search',
    'asset_put',
    'recipe_list',
    'recipe_get',
    'recipe_upsert',
    'recipe_archive',
    'recipe_duplicate',
    'recipe_set_membership',
    'recipe_set_settings',
    'recipe_set_layout',
    'recipe_set_overlay',
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
    'reorder_ring',
    'undo_turn',
    'redo_turn',
  ],
  /** PresentationService — writes reveals through MatchService. */
  presentation: [
    'show_screen',
    'reveal_stem',
    'reveal_next_option',
    'stage_set_monitor',
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
 * Commands the Stage webview may issue. Stage acknowledges its own animations
 * and nothing more — it is a projection, not a controller (spec §5.7).
 */
export const STAGE_COMMANDS = ['overlay_ack_complete'] as const
export type StageCommand = (typeof STAGE_COMMANDS)[number]

export function isStageCommand(command: string): command is StageCommand {
  return (STAGE_COMMANDS as readonly string[]).includes(command)
}

/** Host → webview events. */
export const EVENTS = [
  'catalog-changed',
  'recipe-changed',
  'play-state',
  'health',
  'monitors-changed',
  'anim-complete',
] as const

export type EventName = (typeof EVENTS)[number]

/** Events the Stage webview subscribes to. */
export const STAGE_EVENTS = ['play-state'] as const
export type StageEvent = (typeof STAGE_EVENTS)[number]
