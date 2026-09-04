/**
 * Stable node ids for every Stage element the Screens canvas can restyle.
 *
 * Format: `<screen>.<slot>` or `<screen>.<slot>.<key>`.
 *
 * `recipe_set_layout` overrides key off exactly these strings, so a key is
 * always an entity id or a rank — never an array position and never a label.
 * A renamed team or a reordered board must not move an operator's layout work.
 *
 * Adding a slot is one entry in SCREEN_SLOTS. The builder, the parser and the
 * validator all derive from it.
 */

import type { StageScreen } from './screens'
import { isStageScreen } from './screens'

/**
 * How a slot is addressed.
 * - `static`   exactly one instance per screen; no key.
 * - `entity`   one per catalog entity; keyed by that entity's id.
 * - `ranked`   one per finishing position; keyed by rank (1-based).
 * - `indexed`  decorative repeats with no entity behind them; keyed by index.
 */
export type SlotKind = 'static' | 'entity' | 'ranked' | 'indexed'

export const SCREEN_SLOTS = {
  idle: {
    eyebrow: 'static',
    wordmark: 'static',
    tagline: 'static',
    status: 'static',
    session: 'static',
    decor: 'indexed',
  },
  teamOrder: {
    header: 'static',
    title: 'static',
    row: 'entity',
    decor: 'indexed',
  },
  chooseDomain: {
    header: 'static',
    title: 'static',
    card: 'entity',
    decor: 'indexed',
  },
  question: {
    header: 'static',
    category: 'static',
    stem: 'static',
    option: 'entity',
    timer: 'static',
    result: 'static',
    decor: 'indexed',
  },
  scoreboard: {
    header: 'static',
    title: 'static',
    row: 'entity',
    decor: 'indexed',
  },
  finalLeaderboard: {
    header: 'static',
    title: 'static',
    row: 'ranked',
    decor: 'indexed',
  },
  currentTeam: { header: 'static', teamName: 'static', decor: 'indexed' },
} as const satisfies Record<StageScreen, Record<string, SlotKind>>

export type SlotOf<S extends StageScreen> = keyof (typeof SCREEN_SLOTS)[S] & string

export type NodeId = string

/** A slot key: entity id, rank, or decor index depending on the slot kind. */
export type NodeKey = string | number

const SEPARATOR = '.'

/**
 * Build a node id. The key is required exactly when the slot is not `static`,
 * which the type system enforces at the call site and `parseNodeId` re-checks
 * for values arriving from the host or a saved layout.
 */
export function nodeId<S extends StageScreen>(
  screen: S,
  slot: SlotOf<S>,
  key?: NodeKey,
): NodeId {
  const kind = (SCREEN_SLOTS[screen] as Record<string, SlotKind>)[slot]
  if (kind === undefined) {
    throw new Error(`unknown slot "${slot}" on screen "${screen}"`)
  }
  if (kind === 'static') {
    if (key !== undefined) {
      throw new Error(`slot "${screen}.${slot}" is static and takes no key`)
    }
    return `${screen}${SEPARATOR}${slot}`
  }
  if (key === undefined) {
    throw new Error(`slot "${screen}.${slot}" is ${kind} and requires a key`)
  }
  return `${screen}${SEPARATOR}${slot}${SEPARATOR}${key}`
}

export interface ParsedNodeId {
  readonly screen: StageScreen
  readonly slot: string
  readonly kind: SlotKind
  readonly key: string | null
}

/**
 * Parse a node id that came from outside this process — a saved layout, a host
 * event, a Screens-canvas selection. Returns null rather than throwing so a
 * stale override from an older recipe revision can be reported and skipped
 * instead of crashing Stage.
 */
export function parseNodeId(id: NodeId): ParsedNodeId | null {
  const parts = id.split(SEPARATOR)
  const screen = parts[0]
  const slot = parts[1]
  if (screen === undefined || slot === undefined || parts.length > 3) return null
  if (!isStageScreen(screen)) return null

  const kind = (SCREEN_SLOTS[screen] as Record<string, SlotKind>)[slot]
  if (kind === undefined) return null

  const key = parts.length === 3 ? (parts[2] ?? null) : null
  if (kind === 'static' && key !== null) return null
  if (kind !== 'static' && (key === null || key === '')) return null

  return { screen, slot, kind, key }
}

export function isValidNodeId(id: NodeId): boolean {
  return parseNodeId(id) !== null
}

/** Every static node id, for exhaustiveness checks in tests and the canvas. */
export function staticNodeIds(): readonly NodeId[] {
  const ids: NodeId[] = []
  for (const [screen, slots] of Object.entries(SCREEN_SLOTS)) {
    for (const [slot, kind] of Object.entries(slots as Record<string, SlotKind>)) {
      if (kind === 'static') ids.push(`${screen}${SEPARATOR}${slot}`)
    }
  }
  return ids
}

/**
 * Slots that live in the Stage frame rather than inside a page, so a screen
 * change never unmounts them.
 *
 * This is the structural half of spec §2.6: an overlay animates over the live
 * screen and "does not remount and does not reset reveal/select/lock". A node
 * listed here is mounted once for the life of the Stage window and animated,
 * never re-created.
 */
export const PERSISTENT_SLOTS = ['header', 'wordmark', 'timer', 'decor'] as const

export type PersistentSlot = (typeof PERSISTENT_SLOTS)[number]

export function isPersistentSlot(slot: string): slot is PersistentSlot {
  return (PERSISTENT_SLOTS as readonly string[]).includes(slot)
}
