import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useScreenBox } from '@/layout'
import { isViewerMode } from '@/host/host'
import { nodeId, type ScreenBox, type PlayStateForStage, type StageDecorSettings, type StageScreen } from '@questiongame/contract'
import { DecorShape, type DecorShapeBody } from '@/atoms'
import {
  decorSpecFor,
  createDecorWorld,
  decorAsset,
  decorOpacity,
  decorTransform,
  seedFromPlay,
  type DecorBoundary,
  type DecorWorld,
  type PlacedBody,
} from '@/decor'

/**
 * The loose bodies for the current screen, alive for as long as the screen
 * shows. Mounted once in the Stage frame (a persistent slot, contract §3).
 *
 * The world is created from (screen, seed, settings) and stepped on
 * requestAnimationFrame; each frame writes `style.transform` on the shape
 * elements directly. React renders from the latest known placements, so a
 * re-render for any other reason (an outcome changing a body's opacity)
 * never snaps a body back to frame zero. A new Play (new seed), a screen
 * change, or a changed decor setting builds a new world; anything else
 * leaves it running.
 *
 * The functional elements are measured from the DOM: every element in the
 * frame marked `data-decor-solid` becomes a wall, so the free space hugs
 * the content like a U. They are measured after layout and re-measured
 * when the content resizes (more rows, longer names).
 *
 * Node ids are `<screen>.decor.<n>` in manifest order.
 */

const CANVAS_WIDTH = 1920

/** Bounding boxes of the marked functional elements, in canvas px. */
function measureSolids(field: HTMLElement | null): DecorBoundary[] {
  const frame = field?.closest('[data-stage-frame]') as HTMLElement | null
  if (!frame) return []
  const origin = frame.getBoundingClientRect()
  if (origin.width === 0) return []
  // The frame may be scaled by the host (Viewer preview); measure in canvas units.
  const k = CANVAS_WIDTH / origin.width
  const rects: DecorBoundary[] = []
  for (const el of frame.querySelectorAll<HTMLElement>('[data-decor-solid]')) {
    if (getComputedStyle(el).visibility === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    rects.push({
      x: Math.round((r.left - origin.left) * k),
      y: Math.round((r.top - origin.top) * k),
      width: Math.round(r.width * k),
      height: Math.round(r.height * k),
    })
  }
  return rects
}

const solidsKey = (s: readonly DecorBoundary[]) => s.map((r) => `${r.x},${r.y},${r.width},${r.height}`).join(';')

export interface DecorFieldProps {
  state: PlayStateForStage
  /** The screen whose decor to show. During a transition the timeline flips
   * it mid-way; otherwise it is `state.currentScreen`. */
  screen?: StageScreen | undefined
}

/** A stable identity for the settings object, so equal values share a world. */
function settingsKey(s: StageDecorSettings): string {
  const a = s.anchor
  return [s.mode, s.drift, s.attraction, s.bounce, s.spin, s.maxSpeed, a.enabled, a.attractSeconds, a.repelSeconds, a.strength].join('|')
}

export function DecorField({ state, screen: presented }: DecorFieldProps) {
  const screen = presented ?? state.currentScreen
  const box = useScreenBox(screen)
  const boxKey = box ? JSON.stringify(box) : ''
  const seed = seedFromPlay(state)
  const settings = state.decor
  const key = settingsKey(settings)

  const field = useRef<HTMLDivElement | null>(null)
  const [solids, setSolids] = useState<readonly DecorBoundary[]>([])
  const sKey = solidsKey(solids)

  // Measure the functional elements after layout, and again whenever the
  // content resizes. jsdom measures nothing, so tests run with no solids.
  useLayoutEffect(() => {
    const apply = () => {
      const next = measureSolids(field.current)
      setSolids((prev) => (solidsKey(prev) === solidsKey(next) ? prev : next))
    }
    apply()
    const frame = field.current?.closest('[data-stage-frame]')
    if (!frame || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(apply)
    for (const el of frame.querySelectorAll('[data-decor-solid]')) ro.observe(el)
    return () => ro.disconnect()
  }, [screen, state.teams.length, state.session?.questionId])

  // A manifest may shape itself from the Play (idle: one digit per team); a
  // different body list is a different world, the same list is not.
  const spec = withScreenBox(decorSpecFor(screen, state, solids), box)
  const bodiesKey = spec ? spec.bodies.map((b) => (b.kind === 'svg' ? b.asset : b.kind)).join(',') : ''

  // The world lives across renders; it is rebuilt only when its inputs change.
  const world = useMemo<DecorWorld | null>(() => {
    const s = withScreenBox(decorSpecFor(screen, state, solids), box)
    return s ? createDecorWorld(s, seed, settings) : null
    // `key`, `bodiesKey` and `sKey` stand in for `settings`, `state` and
    // `solids`, so an equal-valued new object is a no-op.
  }, [screen, seed, key, bodiesKey, sKey, boxKey])

  const latest = useRef<readonly PlacedBody[]>([])
  const worldOfLatest = useRef<DecorWorld | null>(null)
  if (worldOfLatest.current !== world) {
    worldOfLatest.current = world
    latest.current = world?.read() ?? []
  }
  const elements = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    if (!world) return
    if (typeof requestAnimationFrame !== 'function') return
    // **The Viewer does not simulate** (P11.10). It is a preview of what is on
    // screen, and it was running a *second* full world at 60 Hz for as long as
    // Control was open — the same bodies, the same collisions, in an iframe
    // nobody is filming. The shapes are drawn where the settle put them, which
    // is what the operator is actually checking. Motion is the Stage window's.
    if (isViewerMode()) return
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
      // A hidden window still gets frames in some compositors, and an occluded
      // Stage is a world stepping for nobody. Resetting `last` on the way back
      // means it resumes rather than catching up on a burst.
      if (typeof document !== 'undefined' && document.hidden) {
        last = now
        frame = requestAnimationFrame(loop)
        return
      }
      world.step(now - last)
      last = now
      const placed = world.read()
      latest.current = placed
      for (const p of placed) {
        const el = elements.current[p.index]
        if (el) el.style.transform = decorTransform(p)
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    // Only the frame is owned here. The world belongs to the memo: React may
    // run this effect twice for one world (StrictMode), and a destroyed world
    // would stand still for the rest of the screen.
    return () => cancelAnimationFrame(frame)
  }, [world])

  return (
    <div
      ref={field}
      data-decor-field={screen}
      data-decor-seed={seed}
      data-decor-mode={settings.mode}
      data-decor-solids={solids.length}
      style={{ position: 'absolute', inset: 0 }}
    >
      {latest.current.map((p) => {
        const spec = p.spec
        const body: DecorShapeBody =
          spec.kind === 'svg'
            ? { kind: 'svg', markup: decorAsset(spec.asset).markup }
            : spec.kind === 'glyph'
              ? { kind: 'glyph', glyph: spec.glyph, ...(spec.stroke ? { stroke: true } : {}) }
              : { kind: 'outline', shape: spec.shape }
        return (
          <DecorShape
            key={p.index}
            ref={(el) => {
              elements.current[p.index] = el
            }}
            nodeId={nodeId(screen, 'decor', p.index)}
            width={p.width}
            height={p.height}
            transform={decorTransform(p)}
            color={spec.color}
            opacity={decorOpacity(spec, state)}
            body={body}
          />
        )
      })}
    </div>
  )
}

/** The recipe's per-screen decor box (Screens tab) wins over the manifest's. */
function withScreenBox<T extends { boundary?: DecorBoundary | undefined; anchor?: { x: number; y: number } | undefined } | null>(
  spec: T,
  box: ScreenBox | undefined,
): T {
  if (!spec || !box) return spec
  return {
    ...spec,
    ...(box.boundary ? { boundary: box.boundary } : {}),
    ...(box.anchor ? { anchor: box.anchor } : {}),
  }
}
