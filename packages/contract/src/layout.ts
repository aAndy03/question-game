/**
 * The recipe layout document (spec §12, §17; 05_STUDIO_DESIGN.md §11.1).
 *
 * `recipe.layout` is stored opaquely by the catalog; this is its shape. The
 * Screens tab writes it with `recipe_set_layout`, the host passes `nodes`
 * and `screens` through to Stage on `play-state.layout`, and Stage applies
 * them through one hook. Node ids are the contract's (`screen.slot[.key]`),
 * keyed on entity ids, so a rename never moves an override.
 *
 * `parseLayout` is the whole validator: anything it does not know is
 * dropped, so a saved document can never carry a Viewer handle, a hit
 * target, or a key a later build does not expect.
 */

import { DEFAULT_DECOR_SETTINGS, type StageDecorSettings } from './play-state'
import { parseNodeId, SCREEN_SLOTS, type NodeId } from './nodes'
import { STAGE_SCREENS, type StageScreen } from './screens'
import { parseText, type StageText } from './text'

export const LAYOUT_VERSION = 1

/** Every field optional; absent means the built-in default. */
export interface NodeStyle {
  /** px, in the 1920×1080 frame. */
  readonly fontSize?: number
  /** A questiongame token name (`ink`, `correct`, …) or a CSS literal. */
  readonly color?: string
  readonly fontFamily?: 'display' | 'mono'
  /** Offset from the built-in position, frame px. */
  readonly dx?: number
  readonly dy?: number
  /** Explicit size, frame px. */
  readonly width?: number
  readonly height?: number
  readonly hidden?: boolean
}

export interface ScreenBox {
  /** The decor field's boundary, frame px (may extend a little past the canvas). */
  readonly boundary?: { readonly x: number; readonly y: number; readonly width: number; readonly height: number }
  /** The anchor point, as fractions of the boundary. */
  readonly anchor?: { readonly x: number; readonly y: number }
}

/** What Stage receives on `play-state.layout`: everything but `decor`, which has its own field. */
export interface StageLayoutNodes {
  readonly nodes: Readonly<Record<NodeId, NodeStyle>>
  readonly screens: Readonly<Partial<Record<StageScreen, ScreenBox>>>
  /** Operator-edited authored text, per language (P11.16, `text.ts`). */
  readonly text: StageText
}

export interface StageLayout extends StageLayoutNodes {
  readonly version: typeof LAYOUT_VERSION
  readonly decor: StageDecorSettings
}

export const EMPTY_LAYOUT_NODES: StageLayoutNodes = { nodes: {}, screens: {}, text: {} }

export const EMPTY_LAYOUT: StageLayout = {
  version: LAYOUT_VERSION,
  decor: DEFAULT_DECOR_SETTINGS,
  ...EMPTY_LAYOUT_NODES,
}

const NODE_KEYS: readonly (keyof NodeStyle)[] = ['fontSize', 'color', 'fontFamily', 'dx', 'dy', 'width', 'height', 'hidden']

function num(v: unknown, min: number, max: number): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : undefined
}

export function parseNodeStyle(raw: unknown): NodeStyle | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const out: { -readonly [K in keyof NodeStyle]: NodeStyle[K] } = {}
  const fontSize = num(r['fontSize'], 8, 400)
  if (fontSize !== undefined) out.fontSize = fontSize
  if (typeof r['color'] === 'string' && r['color'].length > 0 && r['color'].length <= 64) out.color = r['color']
  if (r['fontFamily'] === 'display' || r['fontFamily'] === 'mono') out.fontFamily = r['fontFamily']
  const dx = num(r['dx'], -1920, 1920)
  if (dx !== undefined) out.dx = dx
  const dy = num(r['dy'], -1080, 1080)
  if (dy !== undefined) out.dy = dy
  const width = num(r['width'], 1, 1920)
  if (width !== undefined) out.width = width
  const height = num(r['height'], 1, 1080)
  if (height !== undefined) out.height = height
  if (r['hidden'] === true) out.hidden = true
  return Object.keys(out).length === 0 ? null : out
}

function parseScreenBox(raw: unknown): ScreenBox | null {
  if (typeof raw !== 'object' || raw === null) return null
  const r = raw as Record<string, unknown>
  const out: { -readonly [K in keyof ScreenBox]: ScreenBox[K] } = {}
  const b = r['boundary'] as Record<string, unknown> | undefined
  if (b && typeof b === 'object') {
    const x = num(b['x'], -400, 1920)
    const y = num(b['y'], -400, 1080)
    const width = num(b['width'], 1, 2800)
    const height = num(b['height'], 1, 1900)
    if (x !== undefined && y !== undefined && width !== undefined && height !== undefined) out.boundary = { x, y, width, height }
  }
  const a = r['anchor'] as Record<string, unknown> | undefined
  if (a && typeof a === 'object') {
    const x = num(a['x'], 0, 1)
    const y = num(a['y'], 0, 1)
    if (x !== undefined && y !== undefined) out.anchor = { x, y }
  }
  return Object.keys(out).length === 0 ? null : out
}

function parseDecor(raw: unknown): StageDecorSettings {
  if (typeof raw !== 'object' || raw === null) return DEFAULT_DECOR_SETTINGS
  const r = raw as Record<string, unknown>
  const a = (r['anchor'] ?? {}) as Record<string, unknown>
  const d = DEFAULT_DECOR_SETTINGS
  return {
    mode: r['mode'] === 'collide-attract' ? 'collide-attract' : 'collide',
    anchor: {
      enabled: typeof a['enabled'] === 'boolean' ? a['enabled'] : d.anchor.enabled,
      attractSeconds: num(a['attractSeconds'], 0, 600) ?? d.anchor.attractSeconds,
      repelSeconds: num(a['repelSeconds'], 0, 600) ?? d.anchor.repelSeconds,
      strength: num(a['strength'], 0, 1) ?? d.anchor.strength,
    },
    drift: num(r['drift'], 0, 400) ?? d.drift,
    attraction: num(r['attraction'], 0, 1) ?? d.attraction,
    bounce: num(r['bounce'], 0, 1) ?? d.bounce,
    spin: num(r['spin'], 0, 360) ?? d.spin,
    maxSpeed: num(r['maxSpeed'], 0, 2000) ?? d.maxSpeed,
  }
}

/** Parse a stored document. Unknown keys, node ids and out-of-range values are dropped. */
export function parseLayout(raw: unknown): StageLayout {
  if (typeof raw !== 'object' || raw === null) return EMPTY_LAYOUT
  const r = raw as Record<string, unknown>
  const nodes: Record<NodeId, NodeStyle> = {}
  const rawNodes = r['nodes']
  if (typeof rawNodes === 'object' && rawNodes !== null) {
    for (const [id, style] of Object.entries(rawNodes as Record<string, unknown>)) {
      if (!parseNodeId(id)) continue
      const parsed = parseNodeStyle(style)
      if (parsed) nodes[id] = parsed
    }
  }
  const screens: Partial<Record<StageScreen, ScreenBox>> = {}
  const rawScreens = r['screens']
  if (typeof rawScreens === 'object' && rawScreens !== null) {
    for (const screen of STAGE_SCREENS) {
      const parsed = parseScreenBox((rawScreens as Record<string, unknown>)[screen])
      if (parsed) screens[screen] = parsed
    }
  }
  return { version: LAYOUT_VERSION, decor: parseDecor(r['decor']), nodes, screens, text: parseText(r['text']) }
}

/** `nodes` + `screens` + `text` — what rides `play-state`. */
export function layoutNodes(layout: StageLayout): StageLayoutNodes {
  return { nodes: layout.nodes, screens: layout.screens, text: layout.text }
}

/**
 * "Apply to all screens": the same style under the same slot (and key) on
 * every screen that has that slot. Returns the node ids written.
 */
export function applyToAllScreens(layout: StageLayout, nodeId: NodeId, style: NodeStyle | null): { layout: StageLayout; written: NodeId[] } {
  const parsed = parseNodeId(nodeId)
  if (!parsed) return { layout, written: [] }
  const nodes: Record<NodeId, NodeStyle> = { ...layout.nodes }
  const written: NodeId[] = []
  for (const screen of STAGE_SCREENS) {
    const slots = SCREEN_SLOTS[screen] as Record<string, string>
    if (!(parsed.slot in slots)) continue
    const id = parsed.key === null ? `${screen}.${parsed.slot}` : `${screen}.${parsed.slot}.${parsed.key}`
    if (style === null) delete nodes[id]
    else nodes[id] = style
    written.push(id)
  }
  return { layout: { ...layout, nodes }, written }
}

export const NODE_STYLE_KEYS = NODE_KEYS
