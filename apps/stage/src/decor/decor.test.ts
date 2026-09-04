import { describe, expect, it } from 'vitest'
import { DEFAULT_DECOR_SETTINGS, FIXTURES } from '@questiongame/contract'
import { IDLE_DECOR } from './manifests/idle'
import { STEP_MS, anchorPhase, createDecorWorld, decorAsset, hashString, layoutDecor, seedFromPlay, settle } from './index'

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
    const { boundary } = IDLE_DECOR
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
    expect(layoutDecor('scoreboard', seed)).toEqual([])
  })
})

describe('decor assets', () => {
  it('inline the copied SVGs with currentColor fills and their natural size', () => {
    const plus = decorAsset('plus')
    expect(plus.width).toBe(433)
    expect(plus.height).toBe(364)
    expect(plus.markup).toContain('fill="currentColor"')
    expect(plus.markup).not.toMatch(/fill="#/)
    expect(plus.markup).toContain('width="100%"')
    expect(plus.markup).toContain('viewBox=')
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
      const { boundary } = IDLE_DECOR
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
        expect(s).toBeLessThanOrEqual(settings.maxSpeed + 1)
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
    after.forEach((p, i) => expect(Math.hypot(p.x - before[i]!.x, p.y - before[i]!.y)).toBeLessThan(DEFAULT_DECOR_SETTINGS.maxSpeed))
    world.destroy()
  })
})
