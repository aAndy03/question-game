/**
 * The decor world: a live matter-js simulation of one screen's bodies.
 *
 * Bodies are never static. They are placed from the seed, separated by a
 * short damped settle so nothing starts overlapping, then kept drifting for
 * the life of the screen:
 *
 *   collide          each body cruises near `drift` px/s, bounces off the
 *                    others and off the invisible box (restitution `bounce`).
 *   collide-attract  the same, plus a mild constant pull between every pair
 *                    (`attraction`), so they keep meeting and parting.
 *
 * Everything an operator can tune arrives as `StageDecorSettings` from
 * play-state; nothing here is a magic number that belongs to a recipe.
 *
 * The simulation steps at a fixed 60 Hz with an accumulator, so a slow frame
 * never changes the physics, only how many steps it catches up on.
 */

import Matter from 'matter-js'
import type { StageDecorSettings } from '@questiongame/contract'
import { decorAsset } from './assets'
import { rng, type Rng } from './seed'
import type { DecorBodySpec, PlacedBody, Range, ScreenDecorSpec } from './types'

const { Bodies, Body, Composite, Engine, Common, Vector } = Matter

export const STEP_MS = 1000 / 60
/** Frames a settle runs before the world goes live. */
const SETTLE_STEPS = 120
/** A stalled frame catches up at most this many steps. */
const MAX_CATCHUP = 5
const WALL = 400

/** px/s → px/step. */
const perStep = (pxPerSecond: number) => pxPerSecond / 60
/** deg/s → rad/step. */
const radPerStep = (degPerSecond: number) => (degPerSecond * Math.PI) / 180 / 60

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

export interface DecorWorld {
  readonly spec: ScreenDecorSpec
  readonly settings: StageDecorSettings
  /** Advance by wall-clock milliseconds. */
  step(dtMs: number): void
  /** Current placements, always inside the boundary. */
  read(): readonly PlacedBody[]
  /** Release the engine. */
  destroy(): void
}

export function createDecorWorld(spec: ScreenDecorSpec, seed: number, settings: StageDecorSettings): DecorWorld {
  const r = rng(seed)
  const pick = (range: Range) => r.between(range.min, range.max)
  const { boundary } = spec

  // matter's own RNG (used by a few internals) is seeded too; `_seed` is real but untyped.
  ;(Common as unknown as { _seed: number })._seed = seed
  const engine = Engine.create({ gravity: { x: 0, y: 0, scale: 0 } })
  engine.positionIterations = 8
  engine.velocityIterations = 6

  const wallOpts = { isStatic: true, restitution: settings.bounce, friction: 0, frictionStatic: 0 }
  Composite.add(engine.world, [
    Bodies.rectangle(boundary.x + boundary.width / 2, boundary.y - WALL / 2, boundary.width + 2 * WALL, WALL, wallOpts),
    Bodies.rectangle(boundary.x + boundary.width / 2, boundary.y + boundary.height + WALL / 2, boundary.width + 2 * WALL, WALL, wallOpts),
    Bodies.rectangle(boundary.x - WALL / 2, boundary.y + boundary.height / 2, WALL, boundary.height + 2 * WALL, wallOpts),
    Bodies.rectangle(boundary.x + boundary.width + WALL / 2, boundary.y + boundary.height / 2, WALL, boundary.height + 2 * WALL, wallOpts),
  ])

  const sized = spec.bodies.map((b) => bodySize(b, pick))
  const bodies = spec.bodies.map((b, i) => {
    const { width, height } = sized[i]!
    const ax = b.anchor?.x ?? { min: 0, max: 1 }
    const ay = b.anchor?.y ?? { min: 0, max: 1 }
    const cx = boundary.x + width / 2 + pick(ax) * Math.max(0, boundary.width - width)
    const cy = boundary.y + height / 2 + pick(ay) * Math.max(0, boundary.height - height)
    return Bodies.rectangle(cx, cy, width, height, {
      angle: (pick(b.rotation) * Math.PI) / 180,
      restitution: settings.bounce,
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.1, // settle damping; cleared once live
      // Heavier bodies move less when pushed, so the biggest shape anchors the scene.
      density: 0.001 * Math.max(1, (width * height) / 10_000),
    })
  })
  Composite.add(engine.world, bodies)

  // 1. Settle: damped, so overlapping starts push apart and come to rest.
  for (let i = 0; i < SETTLE_STEPS; i++) Engine.update(engine, STEP_MS)

  // 2. Go live: no air friction, a seeded heading and spin per body.
  for (const body of bodies) {
    body.frictionAir = 0
    const heading = r.between(0, Math.PI * 2)
    const speed = perStep(settings.drift) * r.between(0.6, 1)
    Body.setVelocity(body, { x: Math.cos(heading) * speed, y: Math.sin(heading) * speed })
    Body.setAngularVelocity(body, radPerStep(settings.spin) * r.between(-0.5, 0.5))
  }

  const contain = () => {
    bodies.forEach((body, i) => {
      const { width, height } = sized[i]!
      const x = clamp(body.position.x, boundary.x + width / 2, boundary.x + boundary.width - width / 2)
      const y = clamp(body.position.y, boundary.y + height / 2, boundary.y + boundary.height - height / 2)
      if (x !== body.position.x || y !== body.position.y) Body.setPosition(body, { x, y })
    })
  }

  let accumulator = 0

  const tick = () => {
    if (settings.mode === 'collide-attract') attract(bodies, settings)
    Engine.update(engine, STEP_MS)
    regulate(bodies, settings, r)
    contain()
  }

  return {
    spec,
    settings,
    step(dtMs) {
      accumulator += Math.max(0, dtMs)
      let steps = 0
      while (accumulator >= STEP_MS && steps < MAX_CATCHUP) {
        tick()
        accumulator -= STEP_MS
        steps++
      }
      if (steps === MAX_CATCHUP) accumulator = 0
    },
    read: () =>
      bodies.map(
        (body, index): PlacedBody => ({
          index,
          spec: spec.bodies[index]!,
          x: body.position.x,
          y: body.position.y,
          width: sized[index]!.width,
          height: sized[index]!.height,
          angle: (body.angle * 180) / Math.PI,
        }),
      ),
    destroy: () => {
      Composite.clear(engine.world, false)
      Engine.clear(engine)
    },
  }
}

/**
 * A mild constant pull between every pair. Constant rather than 1/d²: the
 * point is that shapes keep wandering into each other, not orbital mechanics,
 * and a constant is what stays "very mild" at every distance.
 */
const ATTRACT_ACCEL = 0.0004 // px/step² at attraction = 1

function attract(bodies: Matter.Body[], settings: StageDecorSettings) {
  const a = ATTRACT_ACCEL * settings.attraction
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const bi = bodies[i]!
      const bj = bodies[j]!
      const d = Vector.sub(bj.position, bi.position)
      const len = Vector.magnitude(d)
      if (len < 1) continue
      const dir = Vector.div(d, len)
      // applyForce takes a force; force = mass × acceleration.
      Body.applyForce(bi, bi.position, Vector.mult(dir, a * bi.mass))
      Body.applyForce(bj, bj.position, Vector.mult(dir, -a * bj.mass))
    }
  }
}

/**
 * Keep every body cruising: never stalled below half the drift speed, never
 * above `maxSpeed`, and always turning a little. Collisions redistribute
 * energy; this keeps the total where the operator set it.
 */
function regulate(bodies: Matter.Body[], settings: StageDecorSettings, r: Rng) {
  const target = perStep(settings.drift)
  const floor = target * 0.5
  const ceiling = perStep(settings.maxSpeed)
  const spinCap = radPerStep(settings.spin)
  for (const body of bodies) {
    const v = body.velocity
    const speed = Math.hypot(v.x, v.y)
    if (speed < floor) {
      const heading = speed < 1e-6 ? r.between(0, Math.PI * 2) : Math.atan2(v.y, v.x)
      Body.setVelocity(body, { x: Math.cos(heading) * target, y: Math.sin(heading) * target })
    } else if (speed > ceiling) {
      Body.setVelocity(body, { x: (v.x / speed) * ceiling, y: (v.y / speed) * ceiling })
    }
    const w = body.angularVelocity
    if (Math.abs(w) > spinCap) Body.setAngularVelocity(body, Math.sign(w) * spinCap)
    else if (Math.abs(w) < spinCap * 0.1) Body.setAngularVelocity(body, spinCap * r.between(-0.5, 0.5))
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : Math.min(hi, Math.max(lo, v))
}
