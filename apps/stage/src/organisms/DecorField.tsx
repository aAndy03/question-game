import { useEffect, useMemo, useRef } from 'react'
import { nodeId, type PlayStateForStage, type StageDecorSettings } from '@questiongame/contract'
import { DecorShape, type DecorShapeBody } from '@/atoms'
import {
  decorSpecFor,
  createDecorWorld,
  decorAsset,
  decorOpacity,
  decorTransform,
  seedFromPlay,
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
 * Node ids are `<screen>.decor.<n>` in manifest order.
 */

export interface DecorFieldProps {
  state: PlayStateForStage
}

/** A stable identity for the settings object, so equal values share a world. */
function settingsKey(s: StageDecorSettings): string {
  const a = s.anchor
  return [s.mode, s.drift, s.attraction, s.bounce, s.spin, s.maxSpeed, a.enabled, a.attractSeconds, a.repelSeconds, a.strength].join('|')
}

export function DecorField({ state }: DecorFieldProps) {
  const screen = state.currentScreen
  const seed = seedFromPlay(state)
  const settings = state.decor
  const key = settingsKey(settings)

  // A manifest may shape itself from the Play (idle: one digit per team); a
  // different body list is a different world, the same list is not.
  const spec = decorSpecFor(screen, state)
  const bodiesKey = spec ? spec.bodies.map((b) => (b.kind === 'svg' ? b.asset : b.kind)).join(',') : ''

  // The world lives across renders; it is rebuilt only when its inputs change.
  const world = useMemo<DecorWorld | null>(() => {
    const s = decorSpecFor(screen, state)
    return s ? createDecorWorld(s, seed, settings) : null
    // `key` and `bodiesKey` stand in for `settings` and `state`, so an
    // equal-valued new object is a no-op.
  }, [screen, seed, key, bodiesKey])

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
    let frame = 0
    let last = performance.now()
    const loop = (now: number) => {
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
    <div data-decor-field={screen} data-decor-seed={seed} data-decor-mode={settings.mode} style={{ position: 'absolute', inset: 0 }}>
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
