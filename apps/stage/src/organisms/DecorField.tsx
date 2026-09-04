import { useMemo } from 'react'
import { nodeId, type PlayStateForStage } from '@questiongame/contract'
import { DecorShape } from '@/atoms'
import { decorAsset, layoutDecor, seedFromPlay } from '@/decor'

/**
 * The loose bodies for the current screen. Mounted once in the Stage frame
 * (a persistent slot, contract §3); the screen and the seed come from
 * play-state, the layout from the settle solver, memoised so a re-render
 * with the same Play never reshuffles the scatter.
 *
 * Node ids are `<screen>.decor.<n>` in manifest order.
 */

export interface DecorFieldProps {
  state: PlayStateForStage
}

export function DecorField({ state }: DecorFieldProps) {
  const screen = state.currentScreen
  const seed = seedFromPlay(state)
  const placed = useMemo(() => layoutDecor(screen, seed), [screen, seed])

  return (
    <div data-decor-field={screen} data-decor-seed={seed} style={{ position: 'absolute', inset: 0 }}>
      {placed.map((p) => {
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
            nodeId={nodeId(screen, 'decor', p.index)}
            x={p.x}
            y={p.y}
            width={p.width}
            height={p.height}
            angle={p.angle}
            color={spec.color}
            opacity={spec.opacity}
            body={body}
          />
        )
      })}
    </div>
  )
}
