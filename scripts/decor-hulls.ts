/**
 * Decor asset registry + convex hulls.
 *
 *   npm run decor:hulls
 *
 * Scans packages/design-stage/assets/**\/*.svg and writes two generated files:
 *
 *   packages/design-stage/assets/hulls.json         per asset: viewBox size,
 *                                                    convex hull (viewBox
 *                                                    units), content hash
 *   apps/stage/src/decor/assets.generated.ts         one `?raw` import per
 *                                                    asset, keyed by id
 *
 * Replace an SVG, or drop a new one into a folder, and rerun. The id is the
 * folder's short key plus the file name, so `decorative_plus_minus/+.svg` is
 * `plus` and `deocrative_turn_order/A.svg` is `order-A`. A test compares the
 * stored hash with the live file and fails with this command's name when
 * they drift.
 *
 * Hulls are sampled from every <path d> and <rect> (with rotate transforms),
 * clamped to the viewBox (the renderer clips there), then reduced with a monotone chain and trimmed to at most MAX_VERTICES by
 * dropping the vertex that changes the area least. matter-js takes convex
 * vertex lists directly.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { svgPathProperties } from 'svg-path-properties'

const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')
const ASSETS = join(ROOT, 'packages/design-stage/assets')
const HULLS_OUT = join(ASSETS, 'hulls.json')
const REGISTRY_OUT = join(ROOT, 'apps/stage/src/decor/assets.generated.ts')

const MAX_VERTICES = 20
const SAMPLE_STEP = 6 // viewBox units between samples along a path

/** Folder → id prefix. Root files and the idle folder have none. */
const FOLDER_KEY: Record<string, string> = {
  '': '',
  decorative_idle_screen: '',
  decorative_plus_minus: '',
  decorative_domain_screen: 'domain',
  deocrative_turn_order: 'order',
  decorative_up_down_scoreboard: 'board',
  devorative_leaderboard_screen: 'leader',
}

/** File names that are not identifiers. */
const NAME_KEY: Record<string, string> = {
  '+': 'plus',
  '-': 'minus',
  '!': 'bang',
  '?': 'question',
  _: 'underscore',
  'Rectangle 1': 'rectangle-1',
  Union: 'union',
  'Union-1': 'union-1',
}

type Pt = readonly [number, number]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name)
    return statSync(p).isDirectory() ? walk(p) : p.endsWith('.svg') ? [p] : []
  })
}

function idFor(file: string): string {
  const rel = relative(ASSETS, file)
  const parts = rel.split(sep)
  const folder = parts.length > 1 ? parts[0]! : ''
  const name = parts[parts.length - 1]!.replace(/\.svg$/, '')
  const key = FOLDER_KEY[folder]
  if (key === undefined) throw new Error(`no id prefix for folder "${folder}" — add it to FOLDER_KEY in scripts/decor-hulls.ts`)
  const slug = NAME_KEY[name] ?? name
  return key ? `${key}-${slug}` : slug
}

function samplePath(d: string): Pt[] {
  const props = new svgPathProperties(d)
  const len = props.getTotalLength()
  const n = Math.max(24, Math.ceil(len / SAMPLE_STEP))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const p = props.getPointAtLength((len * i) / n)
    pts.push([p.x, p.y])
  }
  return pts
}

function rectCorners(attrs: string): Pt[] {
  const num = (k: string) => Number(new RegExp(`\\b${k}="([-\\d.e]+)"`).exec(attrs)?.[1] ?? 0)
  const x = num('x')
  const y = num('y')
  const w = num('width')
  const h = num('height')
  let corners: Pt[] = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ]
  const rot = /rotate\(([-\d.e]+)(?:[ ,]+([-\d.e]+)[ ,]+([-\d.e]+))?\)/.exec(attrs)
  if (rot) {
    const a = (Number(rot[1]) * Math.PI) / 180
    const cx = Number(rot[2] ?? 0)
    const cy = Number(rot[3] ?? 0)
    corners = corners.map(([px, py]) => {
      const dx = px - cx
      const dy = py - cy
      return [cx + dx * Math.cos(a) - dy * Math.sin(a), cy + dx * Math.sin(a) + dy * Math.cos(a)]
    })
  }
  return corners
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
}

/** Andrew's monotone chain; counter-clockwise, no duplicate endpoint. */
function convexHull(points: Pt[]): Pt[] {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  if (pts.length < 3) return pts
  const lower: Pt[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Pt[] = []
  for (const p of [...pts].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop()
    upper.push(p)
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}

/** Drop the vertex whose removal changes the area least, until at most n remain. */
function trim(hull: Pt[], n: number): Pt[] {
  const h = [...hull]
  while (h.length > n) {
    let best = 0
    let bestArea = Infinity
    for (let i = 0; i < h.length; i++) {
      const a = h[(i + h.length - 1) % h.length]!
      const b = h[i]!
      const c = h[(i + 1) % h.length]!
      const area = Math.abs(cross(a, b, c)) / 2
      if (area < bestArea) {
        bestArea = area
        best = i
      }
    }
    h.splice(best, 1)
  }
  return h
}

/** FNV-1a 32-bit, the same function as apps/stage/src/decor/seed.ts hashString. */
function fnv1a(input: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

function round(v: number): number {
  return Math.round(v * 10) / 10
}

interface HullEntry {
  readonly file: string
  readonly width: number
  readonly height: number
  readonly hull: readonly Pt[]
  /** FNV-1a of the SVG text; compared against the live file by the tests. */
  readonly hash: string
}

const files = walk(ASSETS).sort()
const hulls: Record<string, HullEntry> = {}
const imports: string[] = []
const entries: string[] = []

for (const file of files) {
  const raw = readFileSync(file, 'utf-8')
  const id = idFor(file)
  const vb = /viewBox="([-\d.]+) ([-\d.]+) ([-\d.]+) ([-\d.]+)"/.exec(raw)
  if (!vb) throw new Error(`${file}: no viewBox`)
  const width = Number(vb[3])
  const height = Number(vb[4])

  const points: Pt[] = []
  for (const m of raw.matchAll(/<path\b[^>]*\bd="([^"]+)"/g)) points.push(...samplePath(m[1]!))
  for (const m of raw.matchAll(/<rect\b([^>]*)\/?>/g)) points.push(...rectCorners(m[1]!))
  if (points.length < 3) throw new Error(`${file}: no <path> or <rect> to sample`)

  const clamped = points.map(([x, y]): Pt => [Math.min(width, Math.max(0, x)), Math.min(height, Math.max(0, y))])
  const hull = trim(convexHull(clamped), MAX_VERTICES).map(([x, y]) => [round(x), round(y)] as const)
  const rel = relative(ASSETS, file).split(sep).join('/')
  hulls[id] = { file: rel, width, height, hull, hash: fnv1a(raw) }

  const varName = `a${imports.length}`
  imports.push(`import ${varName} from '@questiongame/design-stage/assets/${rel}?raw'`)
  entries.push(`  '${id}': ${varName},`)
}

writeFileSync(HULLS_OUT, JSON.stringify(hulls, null, 2) + '\n')
writeFileSync(
  REGISTRY_OUT,
  `// GENERATED by scripts/decor-hulls.ts — do not edit. Rerun \`npm run decor:hulls\` after changing an SVG.
${imports.join('\n')}

export const RAW_ASSETS = {
${entries.join('\n')}
} as const

export type DecorAssetId = keyof typeof RAW_ASSETS
`,
)
console.log(`wrote ${files.length} assets → hulls.json, assets.generated.ts`)
for (const [id, e] of Object.entries(hulls)) console.log(`  ${id.padEnd(18)} ${e.file.padEnd(52)} ${e.hull.length} vertices`)
