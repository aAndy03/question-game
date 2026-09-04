import { describe, expect, it } from 'vitest'
import { FIXTURES } from '@questiongame/contract'
import { IDLE_DECOR } from './manifests/idle'
import { decorAsset, hashString, layoutDecor, seedFromPlay, settle } from './index'

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
      if (spec.kind === 'outline') {
        expect(p.width).toBeGreaterThanOrEqual(spec.side.min)
        expect(p.width).toBeLessThanOrEqual(spec.side.max)
      } else {
        expect(p.height).toBeGreaterThanOrEqual(spec.height.min)
        expect(p.height).toBeLessThanOrEqual(spec.height.max)
      }
      // The solver may nudge rotation while resolving a collision; it must not spin.
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
