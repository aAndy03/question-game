/**
 * The contract both webviews and the host schema depend on.
 *
 * P0 scaffold: only the pieces the boundary rules and the P1 work need.
 * `PlayStateForStage`, the full node-id map and the reveal-key union are P1
 * deliverables (docs/v1/04_ROADMAP.md).
 *
 * Import discipline (enforced by eslint):
 *   - anything may import ids, keys and command names from here;
 *   - only organisms and pages may import `PlayStateForStage`.
 */

/** The Stage screens. `currentTeam` is the handoff interstitial (§11 / Figma). */
export const STAGE_SCREENS = [
  'idle',
  'teamOrder',
  'chooseDomain',
  'question',
  'scoreboard',
  'finalLeaderboard',
  'currentTeam',
] as const;

export type StageScreen = (typeof STAGE_SCREENS)[number];

/**
 * Stable node id for one Stage element: `<screen>.<slot>[.<key>]`.
 *
 * `recipe_set_layout` overrides key off exactly these strings, so the key
 * segment is always an entity id or a rank — never an array index and never a
 * label, both of which move when a recipe is edited.
 */
export type NodeId = `${StageScreen}.${string}`;

export function nodeId(screen: StageScreen, slot: string, key?: string): NodeId {
  return (key === undefined ? `${screen}.${slot}` : `${screen}.${slot}.${key}`) as NodeId;
}

/** What `PresentationService` addresses when it reveals part of a screen. */
export type RevealKey =
  | 'stem'
  | `option:${string}`
  | 'outcome'
  | `leader:${number}`;

/**
 * Host commands (optimized_first_spec.md §13). Names are the wire contract:
 * a Viewer click, an Action Panel button and a keyboard chord all dispatch the
 * same one.
 */
export const COMMANDS = [
  'play_load',
  'play_start',
  'pause',
  'resume',
  'restart',
  'abandon',
  'get_state',
  'choose_domain',
  'reveal_stem',
  'reveal_next_option',
  'set_selection',
  'lock_selection',
  'start_timer',
  'pause_timer',
  'reveal_outcome',
  'give_token',
  'reorder_ring',
  'show_screen',
  'stage_set_monitor',
  'overlay_ack_complete',
  'undo_turn',
  'redo_turn',
] as const;

export type Command = (typeof COMMANDS)[number];

/** Host → webview event names. */
export const EVENTS = [
  'catalog-changed',
  'recipe-changed',
  'play-state',
  'health',
  'monitors-changed',
  'anim-complete',
] as const;

export type EventName = (typeof EVENTS)[number];
