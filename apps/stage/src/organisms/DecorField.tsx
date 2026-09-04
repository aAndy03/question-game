import { useEffect, useMemo, useRef } from 'react'
import { nodeId, type PlayStateForStage, type StageDecorSettings } from '@questiongame/contract'
import { DecorShape } from '@/atoms'
import { DECOR_BY_SCREEN, createDecorWorld, decorAsset, decorTransform, seedFromPlay, type DecorWorld } from '@/decor'

/**
 * The loose bodies for the current screen, alive for as long as the screen
 * shows. Mounted once in the Stage frame (a persistent slot, contract §3).
 *
 * The world is created from (screen, seed, settings) and stepped on
 * requestAnimationFrame; each frame writes `style.transform` on the shape
 * elements directly. React renders the first frame and never re-renders per
 * tick, so a play-state emission every 100ms costs nothing here and never
 * restarts the scatter. A new Play (new seed), a screen change, or a changed
 * decor setting builds a new world; anything else leaves it running.
 *
 * Node ids are `<screen>.decor.<n>` in manifest order.
 */

export interface DecorFieldProps {
  state: PlayStateForStage
}

/** A stable identity for the settings object, so equal values share a world. */
function settingsKey(s: StageDecorSettings): string {
  return `${s.mode}|${s.drift}|${s.attraction}|${s.bounce}|${s.spin}|${s.maxSpeed}`
}

export function DecorField({ state }: DecorFieldProps) {
  const screen = state.currentScreen
  const seed = seedFromPlay(state)
  const settings = state.decor
  const key = settingsKey(settings)

  // The world lives across renders; it is rebuilt only when its inputs change.
  const world = useMemo<DecorWorld | null>(() => {
    const spec = DECOR_BY_SCREEN[screen]
    return spec ? createDecorWorld(spec, seed, settings) : null
    // `key` stands in for `settings` so an equal-valued new object is a no-op.
  }, [screen, seed, key])

  const first = useMemo(() => world?.read() ?? [], [world])
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
      {first.map((p) => {
        const spec = p.spec
        const body =
          spec.kind === 'svg'
            ? { kind: 'svg' as const, markup: decorAsset(spec.asset).markup }
            : spec.kind === 'glyph'
              ? { kind: 'glyph' as const, glyph: spec.glyph }
              : { kind: 'outline' as const }
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
            opacity={spec.opacity}
            body={body}
          />
        )
      })}
    </div>
  )
}
