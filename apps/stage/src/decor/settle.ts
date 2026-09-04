/**
 * Settle: turn a manifest plus a seed into the static positions the page
 * renders.
 *
 * matter-js runs headless here (no renderer, no ticker). Bodies are dropped
 * at seeded positions inside the boundary, then the engine steps a fixed
 * number of times with heavy air friction and (by default) no gravity, so
 * overlapping bodies push apart and everything comes to rest inside the
 * walls. The same engine will drive the P3 entry animation; this is its final
 * frame computed up front.
 *
 * Determinism: fixed timestep, seeded starting state, matter's own RNG seeded.
 * Same manifest + same seed → same layout, on Stage and in the Viewer.
 */

import Matter from 'matter-js'
import { decorAsset } from './assets'
import { rng } from './seed'
import type { DecorBodySpec, PlacedBody, Range, ScreenDecorSpec } from './types'

const { Bodies, Body, Composite, Engine, Common } = Matter

const STEP_MS = 1000 / 60
const STEPS = 300
const WALL = 400

interface Sized {
  readonly width: number
  readonly height: number
}

/** Rendered box of a body at a sampled size. */
export function bodySize(spec: DecorBodySpec, pick: (r: Range) => number): Sized {
  switch (spec.kind) {
    case 'svg': {
      const a = decorAsset(spec.asset)
      const height = pick(spec.height)
      return { width: (height * a.width) / a.height, height }
    }
    case 'glyph': {
      const height = pick(spec.height)
      return { width: height * spec.aspect, height }
    }
    case 'outline': {
      const side = pick(spec.side)
      return { width: side, height: side }
    }
  }
}

export function settle(spec: ScreenDecorSpec, seed: number): readonly PlacedBody[] {
  const r = rng(seed)
  const pick = (range: Range) => r.between(range.min, range.max)
  const { boundary } = spec

  // matter's own RNG (used by a few internals) is seeded too; `_seed` is real but untyped.
  ;(Common as unknown as { _seed: number })._seed = seed
  const engine = Engine.create({ gravity: { x: 0, y: spec.gravity ?? 0, scale: 0.001 } })

  const walls = [
    Bodies.rectangle(boundary.x + boundary.width / 2, boundary.y - WALL / 2, boundary.width + 2 * WALL, WALL, { isStatic: true }),
    Bodies.rectangle(boundary.x + boundary.width / 2, boundary.y + boundary.height + WALL / 2, boundary.width + 2 * WALL, WALL, { isStatic: true }),
    Bodies.rectangle(boundary.x - WALL / 2, boundary.y + boundary.height / 2, WALL, boundary.height + 2 * WALL, { isStatic: true }),
    Bodies.rectangle(boundary.x + boundary.width + WALL / 2, boundary.y + boundary.height / 2, WALL, boundary.height + 2 * WALL, { isStatic: true }),
  ]
  Composite.add(engine.world, walls)

  const sized = spec.bodies.map((b) => bodySize(b, pick))
  const bodies = spec.bodies.map((b, i) => {
    const { width, height } = sized[i]!
    const ax = b.anchor?.x ?? { min: 0, max: 1 }
    const ay = b.anchor?.y ?? { min: 0, max: 1 }
    // Keep the centre far enough in that the body starts inside the walls.
    const cx = boundary.x + width / 2 + pick(ax) * Math.max(0, boundary.width - width)
    const cy = boundary.y + height / 2 + pick(ay) * Math.max(0, boundary.height - height)
    const body = Bodies.rectangle(cx, cy, width, height, {
      angle: (pick(b.rotation) * Math.PI) / 180,
      frictionAir: 0.08,
      friction: 0.2,
      restitution: 0,
      // Heavier bodies move less when pushed, so the biggest shape anchors the scene.
      density: 0.001 * Math.max(1, (width * height) / 10_000),
    })
    return body
  })
  Composite.add(engine.world, bodies)

  for (let i = 0; i < STEPS; i++) Engine.update(engine, STEP_MS)

  return bodies.map((body, index): PlacedBody => {
    const { width, height } = sized[index]!
    // Belt and braces: a body can never be reported outside the box.
    const x = clamp(body.position.x, boundary.x + width / 2, boundary.x + boundary.width - width / 2)
    const y = clamp(body.position.y, boundary.y + height / 2, boundary.y + boundary.height - height / 2)
    Body.setPosition(body, { x, y })
    return {
      index,
      spec: spec.bodies[index]!,
      x,
      y,
      width,
      height,
      angle: (body.angle * 180) / Math.PI,
    }
  })
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v))
}
