/**
 * The decor world: a live matter-js simulation of one screen's bodies.
 *
 * Bodies are never static. They are placed from the seed, separated by a
 * short damped settle so nothing starts overlapping, then kept drifting for
 * the life of the screen:
 *
 *   collide          each body cruises near `drift` px/s, bounces off the
 *                    others, the functional elements and the box.
 *   collide-attract  the same, plus a mild constant pull between every pair
 *                    (`attraction`), so they keep meeting and parting.
 *
 * The space they live in is the canvas plus a bleed, minus the functional
 * elements: each measured content rectangle becomes a static wall, so the
 * free space hugs the content like a U and grows or shrinks with it. The
 * colliders are the assets' convex hulls, so letters touch where their ink
 * touches.
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
import type { DecorBodySpec, DecorBoundary, PlacedBody, Range, ScreenDecorSpec } from './types'

const { Bodies, Body, Composite, Engine, Common, Vector, Vertices } = Matter

export const STEP_MS = 1000 / 60
/** Frames a settle runs before the world goes live. */
const SETTLE_STEPS = 150
/** A stalled frame catches up at most this many steps. */
const MAX_CATCHUP = 5
const WALL = 400

/**
 * The default box: the 1920×1080 canvas plus a bleed on every side, so shapes
 * clip past the edge as they do in the reference. A manifest may override it.
 */
export const CANVAS_BLEED = 160
export const CANVAS_BOUNDARY: DecorBoundary = {
  x: -CANVAS_BLEED,
  y: -CANVAS_BLEED,
  width: 1920 + 2 * CANVAS_BLEED,
  height: 1080 + 2 * CANVAS_BLEED,
}

/** Breathing room kept between a body and a functional element, canvas px. */
export const SOLID_MARGIN = 24

export function resolveBoundary(spec: Pick<ScreenDecorSpec, 'boundary'>): DecorBoundary {
  return spec.boundary ?? CANVAS_BOUNDARY
}

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
      const height = pick(spec.height)
      return { width: height * (spec.shape === 'rect' ? (spec.aspect ?? 1) : 1), height }
    }
  }
}

/**
 * Collider vertices for a body, in body-local px with the rendered box's
 * centre at the origin. SVG bodies use their convex hull; everything else
 * its box.
 */
export function colliderVertices(spec: DecorBodySpec, size: Sized): Matter.Vector[] {
  if (spec.kind === 'svg') {
    const a = decorAsset(spec.asset)
    const s = size.height / a.height
    return a.hull.map(([x, y]) => ({ x: x * s - size.width / 2, y: y * s - size.height / 2 }))
  }
  const hw = size.width / 2
  const hh = size.height / 2
  return [
    { x: -hw, y: -hh },
    { x: hw, y: -hh },
    { x: hw, y: hh },
    { x: -hw, y: hh },
  ]
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
  const boundary = resolveBoundary(spec)
  const solids = spec.solids ?? []

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
    // The functional elements, as walls: the U the bodies live around.
    ...solids.map((s) =>
      Bodies.rectangle(s.x + s.width / 2, s.y + s.height / 2, s.width + 2 * SOLID_MARGIN, s.height + 2 * SOLID_MARGIN, wallOpts),
    ),
  ])

  const sized = spec.bodies.map((b) => bodySize(b, pick))
  /** Body-local offset from the matter position (hull centroid) to the rendered box centre. */
  const centreOffset: Matter.Vector[] = []

  const bodies = spec.bodies.map((b, i) => {
    const { width, height } = sized[i]!
    const ax = b.region?.x ?? { min: 0, max: 1 }
    const ay = b.region?.y ?? { min: 0, max: 1 }
    const cx = boundary.x + width / 2 + pick(ax) * Math.max(0, boundary.width - width)
    const cy = boundary.y + height / 2 + pick(ay) * Math.max(0, boundary.height - height)
    const verts = colliderVertices(b, sized[i]!)
    const centroid = Vertices.centre(verts)
    const body = Bodies.fromVertices(cx + centroid.x, cy + centroid.y, [verts], {
      restitution: settings.bounce,
      friction: 0,
      frictionStatic: 0,
      frictionAir: 0.1, // settle damping; cleared once live
      // Heavier bodies move less when pushed, so the biggest shape anchors the scene.
      density: 0.001 * Math.max(1, (width * height) / 10_000),
    })
    centreOffset.push({ x: -centroid.x, y: -centroid.y })
    Body.setAngle(body, (pick(b.rotation) * Math.PI) / 180)
    return body
  })
  Composite.add(engine.world, bodies)

  /** Rendered box centre of a body, in canvas px. */
  const boxCentre = (body: Matter.Body, i: number) => {
    const o = Vector.rotate(centreOffset[i]!, body.angle)
    return { x: body.position.x + o.x, y: body.position.y + o.y }
  }

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
      const c = boxCentre(body, i)
      const x = clamp(c.x, boundary.x + width / 2, boundary.x + boundary.width - width / 2)
      const y = clamp(c.y, boundary.y + height / 2, boundary.y + boundary.height - height / 2)
      if (x !== c.x || y !== c.y) Body.setPosition(body, { x: body.position.x + (x - c.x), y: body.position.y + (y - c.y) })
    })
  }

  const anchorPoint = {
    x: boundary.x + (spec.anchor?.x ?? 0.5) * boundary.width,
    y: boundary.y + (spec.anchor?.y ?? 0.5) * boundary.height,
  }

  let accumulator = 0
  let elapsedSteps = 0

  const tick = () => {
    if (settings.mode === 'collide-attract') attract(bodies, settings)
    if (settings.anchor.enabled) anchorPull(bodies, anchorPoint, settings, elapsedSteps)
    elapsedSteps++
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
      bodies.map((body, index): PlacedBody => {
        const c = boxCentre(body, index)
        return {
          index,
          spec: spec.bodies[index]!,
          x: c.x,
          y: c.y,
          width: sized[index]!.width,
          height: sized[index]!.height,
          angle: (body.angle * 180) / Math.PI,
        }
      }),
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

/**
 * matter integrates `force / mass × dt²` per step, so a force meant as an
 * acceleration in px/step² must be divided by dt² first.
 */
const DT2 = STEP_MS * STEP_MS
const forceFor = (accelPerStep2: number, mass: number) => (accelPerStep2 * mass) / DT2

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
      Body.applyForce(bi, bi.position, Vector.mult(dir, forceFor(a, bi.mass)))
      Body.applyForce(bj, bj.position, Vector.mult(dir, -forceFor(a, bj.mass)))
    }
  }
}

/** Which half of the anchor cycle a step falls in. */
export function anchorPhase(settings: StageDecorSettings, elapsedSteps: number): 'attract' | 'repel' | 'off' {
  const { anchor } = settings
  if (!anchor.enabled) return 'off'
  const cycle = anchor.attractSeconds + anchor.repelSeconds
  if (cycle <= 0) return 'off'
  const t = (elapsedSteps / 60) % cycle
  return t < anchor.attractSeconds ? 'attract' : 'repel'
}

const ANCHOR_ACCEL = 0.001 // px/step² at strength = 1

/**
 * The invisible anchor: pulls every body toward one point for a while, then
 * pushes it away for a while. Constant magnitude, like the pairwise pull, so
 * it reads as a slow tide rather than a slingshot.
 */
function anchorPull(bodies: Matter.Body[], point: { x: number; y: number }, settings: StageDecorSettings, elapsedSteps: number) {
  const phase = anchorPhase(settings, elapsedSteps)
  if (phase === 'off') return
  const a = ANCHOR_ACCEL * settings.anchor.strength * (phase === 'attract' ? 1 : -1)
  for (const body of bodies) {
    const d = Vector.sub(point, body.position)
    const len = Vector.magnitude(d)
    if (len < 1) continue
    Body.applyForce(body, body.position, Vector.mult(Vector.div(d, len), forceFor(a, body.mass)))
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
