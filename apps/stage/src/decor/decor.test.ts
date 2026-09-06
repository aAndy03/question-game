import { describe, expect, it } from 'vitest'
import { DEFAULT_DECOR_SETTINGS, FIXTURES } from '@questiongame/contract'
import { idleDecor } from './manifests/idle'

const IDLE_DECOR = idleDecor(FIXTURES.idle)
import { STEP_MS, DECOR_ASSET_IDS, SOLID_MARGIN, anchorPhase, colliderVertices, createDecorWorld, decorAsset, hashString, layoutDecor, rawAsset, resolveBoundary, seedFromPlay, settle } from './index'
import hulls from '@questiongame/design-stage/assets/hulls.json'
import { Vertices } from 'matter-js'

function corners(b: { x: number; y: number; width: number; height: number; angle: number }) {
  const a = (b.angle * Math.PI) / 180
  const c = Math.cos(a)
  const s = Math.sin(a)
  const hw = b.width / 2
  const hh = b.height / 2
  return [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ].map(([x, y]) => ({ x: b.x + x! * c - y! * s, y: b.y + x! * s + y! * c }))
}

describe('decor seeding', () => {
  it('derives the seed from what identifies the Play', () => {
    const a = seedFromPlay(FIXTURES.idle)
    const renamed = { ...FIXTURES.idle, teams: [{ ...FIXTURES.scoreboard.teams[0]!, name: 'OTHER' }] }
    expect(seedFromPlay(renamed)).not.toBe(a)
    expect(seedFromPlay(FIXTURES.idle)).toBe(a)
    expect(hashString('')).toBe(0x811c9dc5)
  })
})

describe('decor settle', () => {
  const seed = seedFromPlay(FIXTURES.idle)

  it('is deterministic for the same seed and different for another', () => {
    const a = settle(IDLE_DECOR, seed)
    const b = settle(IDLE_DECOR, seed)
    const c = settle(IDLE_DECOR, seed + 1)
    expect(a).toEqual(b)
    expect(a.map((p) => [p.x, p.y])).not.toEqual(c.map((p) => [p.x, p.y]))
  })

  it('renders every body in the manifest, in manifest order', () => {
    const placed = settle(IDLE_DECOR, seed)
    expect(placed.map((p) => p.spec)).toEqual([...IDLE_DECOR.bodies])
    expect(placed.map((p) => p.index)).toEqual(IDLE_DECOR.bodies.map((_, i) => i))
  })

  it('keeps every body centre inside the boundary box, for many seeds', () => {
    const boundary = resolveBoundary(IDLE_DECOR)
    for (let s = 0; s < 25; s++) {
      for (const p of settle(IDLE_DECOR, s * 7919)) {
        expect(p.x).toBeGreaterThanOrEqual(boundary.x)
        expect(p.x).toBeLessThanOrEqual(boundary.x + boundary.width)
        expect(p.y).toBeGreaterThanOrEqual(boundary.y)
        expect(p.y).toBeLessThanOrEqual(boundary.y + boundary.height)
      }
    }
  })

  it('sizes and rotations stay within the manifest ranges', () => {
    for (const p of settle(IDLE_DECOR, seed)) {
      const spec = p.spec
      expect(p.height).toBeGreaterThanOrEqual(spec.height.min)
      expect(p.height).toBeLessThanOrEqual(spec.height.max)
      // The settle may nudge rotation while resolving a collision; it must not spin.
      expect(Math.abs(p.angle - (spec.rotation.min + spec.rotation.max) / 2)).toBeLessThan(90)
    }
  })

  it('does not leave two bodies heavily overlapping', () => {
    const placed = settle(IDLE_DECOR, seed)
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) {
        const a = placed[i]!
        const b = placed[j]!
        // Compare inscribed circles: a conservative "not on top of each other".
        const ra = Math.min(a.width, a.height) / 2
        const rb = Math.min(b.width, b.height) / 2
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        expect(d, `bodies ${i} and ${j}`).toBeGreaterThan((ra + rb) * 0.6)
      }
    }
    // Sanity: the corner helper is consistent (used by the page tests).
    expect(corners(placed[0]!).length).toBe(4)
  })

  it('a screen without a manifest lays out nothing', () => {
    expect(layoutDecor('currentTeam', seed, FIXTURES.idle)).toEqual([])
  })
})

describe('idle manifest shapes itself from the Play', () => {
  const digits = (n: number) => idleDecor({ teams: FIXTURES['final-leaderboard-six'].teams.slice(0, n) }).bodies.filter((b) => b.kind === 'svg' && /^\d$/.test(b.asset))
  it('shows one digit per team, at most five, none with no team', () => {
    expect(digits(0).length).toBe(0)
    expect(digits(1).length).toBe(1)
    expect(digits(4).map((b) => (b.kind === 'svg' ? b.asset : ''))).toEqual(['1', '2', '3', '4'])
    expect(digits(6).length).toBe(5)
  })
  it('uses the exported ? path, not a glyph', () => {
    expect(IDLE_DECOR.bodies.some((b) => b.kind === 'svg' && b.asset === 'question')).toBe(true)
    expect(IDLE_DECOR.bodies.some((b) => b.kind === 'glyph')).toBe(false)
  })
})

describe('decor colliders and solids', () => {
  it('svg bodies collide with their convex hull, scaled to the rendered height', () => {
    const spec = IDLE_DECOR.bodies.find((b) => b.kind === 'svg' && b.asset === 'plus')!
    const verts = colliderVertices(spec, { width: 433, height: 364 })
    expect(verts.length).toBeGreaterThanOrEqual(3)
    // At natural size the hull spans the viewBox and is centred on the box.
    const xs = verts.map((v) => v.x)
    const ys = verts.map((v) => v.y)
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-433 / 2 - 1)
    expect(Math.max(...xs)).toBeLessThanOrEqual(433 / 2 + 1)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-364 / 2 - 1)
    expect(Math.max(...ys)).toBeLessThanOrEqual(364 / 2 + 1)
  })

  it('bodies stay off the functional elements for the life of the screen', () => {
    const solid = { x: 64, y: 64, width: 1228, height: 952 } // a content column
    const spec = { ...IDLE_DECOR, solids: [solid] }
    const world = createDecorWorld(spec, 11, DEFAULT_DECOR_SETTINGS)
    const inner = {
      x: solid.x + SOLID_MARGIN,
      y: solid.y + SOLID_MARGIN,
      right: solid.x + solid.width - SOLID_MARGIN,
      bottom: solid.y + solid.height - SOLID_MARGIN,
    }
    for (let t = 0; t < 10 * 60; t++) {
      world.step(STEP_MS)
      if (t % 30 !== 0) continue
      for (const p of world.read()) {
        // The body centre never sits inside the solid (its hull would be overlapping deeply).
        const inside = p.x > inner.x && p.x < inner.right && p.y > inner.y && p.y < inner.bottom
        expect(inside, `t=${t} body ${p.index}`).toBe(false)
      }
    }
    world.destroy()
  })
})

describe('decor assets', () => {
  it('every asset has a fresh convex hull (else run `npm run decor:hulls`)', () => {
    const entries = hulls as Record<string, { hash: string; hull: number[][] }>
    for (const id of DECOR_ASSET_IDS) {
      const entry = entries[id]
      expect(entry, `${id}: no hull — run npm run decor:hulls`).toBeTruthy()
      const live = hashString(rawAsset(id)).toString(16).padStart(8, '0')
      expect(live, `${id}: SVG changed since hulls.json — run npm run decor:hulls`).toBe(entry!.hash)
      expect(entry!.hull.length).toBeGreaterThanOrEqual(3)
      expect(entry!.hull.length).toBeLessThanOrEqual(20)
      // Convex *as matter-js reads it*, and still convex at the scale the
      // world builds it at. A hull that fails this is one `Bodies.fromVertices`
      // tries to decompose, which is the poly-decomp warning on every boot.
      for (const scale of [1, 0.137, 12.5]) {
        const points = entry!.hull.map(([x, y]) => ({ x: x! * scale - 7.3, y: y! * scale + 101.7 }))
        expect(Vertices.isConvex(points), `${id}: concave at scale ${scale} — run npm run decor:hulls`).toBe(true)
      }
    }
  })

  it('inline the copied SVGs with currentColor fills and their natural size', () => {
    const plus = decorAsset('plus')
    expect(plus.width).toBe(433)
    expect(plus.height).toBe(364)
    expect(plus.markup).toContain('fill="currentColor"')
    expect(plus.markup).not.toMatch(/fill="#/)
    expect(plus.markup).toContain('width="100%"')
    expect(plus.markup).toContain('viewBox=')
  })

  it('recolours fills named by keyword too (the digit export uses fill="black")', () => {
    const one = decorAsset('1')
    expect(one.markup).toContain('fill="currentColor"')
    expect(one.markup).not.toContain('fill="black"')
    expect(decorAsset('question').width).toBe(151)
  })

  it('rejects an unknown asset loudly', () => {
    expect(() => decorAsset('nope')).toThrow()
  })
})

describe('decor world (live)', () => {
  const seed = seedFromPlay(FIXTURES.idle)
  /** Mean speed per body over one second, px/s (a single collision push is not "speed"). */
  const speeds = (w: ReturnType<typeof createDecorWorld>) => {
    const total = w.read().map(() => 0)
    let prev = w.read()
    for (let t = 0; t < 60; t++) {
      w.step(STEP_MS)
      const next = w.read()
      next.forEach((p, i) => (total[i]! += Math.hypot(p.x - prev[i]!.x, p.y - prev[i]!.y)))
      prev = next
    }
    return total
  }

  for (const mode of ['collide', 'collide-attract'] as const) {
    it(`${mode}: bodies keep moving, stay inside the box and under maxSpeed over 20 seconds`, () => {
      const settings = { ...DEFAULT_DECOR_SETTINGS, mode }
      const world = createDecorWorld(IDLE_DECOR, seed, settings)
      const boundary = resolveBoundary(IDLE_DECOR)
      for (let t = 0; t < 20 * 60; t++) {
        world.step(STEP_MS)
        if (t % 60 !== 0) continue
        for (const p of world.read()) {
          expect(p.x - p.width / 2, `t=${t}`).toBeGreaterThanOrEqual(boundary.x - 1)
          expect(p.x + p.width / 2, `t=${t}`).toBeLessThanOrEqual(boundary.x + boundary.width + 1)
          expect(p.y - p.height / 2, `t=${t}`).toBeGreaterThanOrEqual(boundary.y - 1)
          expect(p.y + p.height / 2, `t=${t}`).toBeLessThanOrEqual(boundary.y + boundary.height + 1)
        }
      }
      for (const s of speeds(world)) {
        expect(s).toBeGreaterThan(0)
        // Collision pushes add displacement on top of the capped velocity.
        expect(s).toBeLessThanOrEqual(settings.maxSpeed * 1.3)
      }
      world.destroy()
    })
  }

  it('the pull only exists in collide-attract mode', () => {
    // Two bodies at rest: with attraction they close in, without it they stay put.
    const square = (x: number) => ({
      kind: 'outline' as const,
      shape: 'square' as const,
      height: { min: 100, max: 100 },
      color: 'ink' as const,
      opacity: 1,
      rotation: { min: 0, max: 0 },
      region: { x: { min: x, max: x }, y: { min: 0.5, max: 0.5 } },
    })
    const spec = { screen: 'idle' as const, boundary: { x: 0, y: 0, width: 2000, height: 1000 }, bodies: [square(0.1), square(0.9)] }
    const still = { ...DEFAULT_DECOR_SETTINGS, drift: 0, spin: 0, anchor: { ...DEFAULT_DECOR_SETTINGS.anchor, enabled: false } }
    const dist = (w: ReturnType<typeof createDecorWorld>) => {
      const [a, b] = w.read()
      return Math.hypot(a!.x - b!.x, a!.y - b!.y)
    }
    const off = createDecorWorld(spec, 1, { ...still, mode: 'collide' })
    const on = createDecorWorld(spec, 1, { ...still, mode: 'collide-attract', attraction: 1 })
    const d0 = dist(off)
    for (let t = 0; t < 10 * 60; t++) {
      off.step(STEP_MS)
      on.step(STEP_MS)
    }
    expect(Math.abs(dist(off) - d0)).toBeLessThan(1)
    expect(dist(on)).toBeLessThan(d0 - 20)
    off.destroy()
    on.destroy()
  })

  it('the anchor attracts for attractSeconds, then repels for repelSeconds, forever', () => {
    const settings = { ...DEFAULT_DECOR_SETTINGS, anchor: { enabled: true, attractSeconds: 2, repelSeconds: 1, strength: 1 } }
    expect(anchorPhase(settings, 0)).toBe('attract')
    expect(anchorPhase(settings, 60 * 1.9)).toBe('attract')
    expect(anchorPhase(settings, 60 * 2.1)).toBe('repel')
    expect(anchorPhase(settings, 60 * 3.1)).toBe('attract')
    expect(anchorPhase(settings, 60 * 302.5)).toBe('repel')
    expect(anchorPhase({ ...settings, anchor: { ...settings.anchor, enabled: false } }, 0)).toBe('off')
  })

  it('the anchor pulls a body toward the manifest point, then pushes it away', () => {
    const one = {
      screen: 'idle' as const,
      boundary: { x: 0, y: 0, width: 2000, height: 1000 },
      anchor: { x: 0.5, y: 0.5 },
      bodies: [{ kind: 'outline' as const, shape: 'square' as const, height: { min: 100, max: 100 }, color: 'ink' as const, opacity: 1, rotation: { min: 0, max: 0 }, region: { x: { min: 0.1, max: 0.1 }, y: { min: 0.5, max: 0.5 } } }],
    }
    const settings = { ...DEFAULT_DECOR_SETTINGS, drift: 0, spin: 0, anchor: { enabled: true, attractSeconds: 3, repelSeconds: 12, strength: 1 } }
    const world = createDecorWorld(one, 3, settings)
    const dist = () => Math.abs(world.read()[0]!.x - 1000)
    const d0 = dist()
    for (let t = 0; t < 3 * 60; t++) world.step(STEP_MS)
    const dAttract = dist()
    expect(dAttract).toBeLessThan(d0 - 10)
    for (let t = 0; t < 12 * 60; t++) world.step(STEP_MS)
    expect(dist()).toBeGreaterThan(dAttract)
    world.destroy()
  })

  it('a stalled frame catches up a bounded number of steps', () => {
    const world = createDecorWorld(IDLE_DECOR, seed, DEFAULT_DECOR_SETTINGS)
    const before = world.read()
    world.step(10_000)
    const after = world.read()
    // At most 5 steps: nobody teleports.
    after.forEach((p, i) => expect(Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y)).toBeLessThan(DEFAULT_DECOR_SETTINGS.maxSpeed + 2))
    world.destroy()
  })
})
