import type { CSSProperties } from 'react'
import { COLOR } from '@questiongame/design-stage'

/**
 * One decorative body, absolutely positioned inside the decor layer at its
 * settled centre, size and angle. Three kinds:
 *
 *   svg      inline markup from the copied assets, coloured via currentColor
 *   glyph    a character in the display face (stand-in for missing paths)
 *   outline  a hairline square — the diamond outlines
 *
 * The atom takes numbers and markup; it never chooses a shape, a colour, or a
 * position. Those are the manifest's and the solver's.
 */

export type DecorShapeColor = 'ink' | 'correct' | 'incorrect' | 'info' | 'leader' | 'accent'

const FILL: Record<DecorShapeColor, string> = {
  ink: COLOR.ink,
  correct: COLOR.correct,
  incorrect: COLOR.incorrect,
  info: COLOR.info,
  leader: COLOR.leader,
  accent: COLOR.accent,
}

export interface DecorShapeProps {
  nodeId: string
  /** Centre, canvas px. */
  x: number
  y: number
  width: number
  height: number
  /** Degrees. */
  angle: number
  color: DecorShapeColor
  opacity: number
  body: { kind: 'svg'; markup: string } | { kind: 'glyph'; glyph: string } | { kind: 'outline' }
}

export function DecorShape({ nodeId, x, y, width, height, angle, color, opacity, body }: DecorShapeProps) {
  const base: CSSProperties = {
    position: 'absolute',
    left: x - width / 2,
    top: y - height / 2,
    width,
    height,
    transform: `rotate(${angle}deg)`,
    transformOrigin: '50% 50%',
    color: FILL[color],
    opacity,
    pointerEvents: 'none',
  }

  if (body.kind === 'svg') {
    return (
      <div
        data-node-id={nodeId}
        data-decor="svg"
        style={{ ...base, display: 'block', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: body.markup }}
      />
    )
  }

  if (body.kind === 'glyph') {
    return (
      <div
        data-node-id={nodeId}
        data-decor="glyph"
        aria-hidden
        style={{
          ...base,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'visible',
          fontFamily: 'var(--font-display)',
          fontWeight: 'var(--weight-bold)',
          // Cap height of the display face is ~0.7em; size the em so the
          // ink fills the body box.
          fontSize: height / 0.7,
          lineHeight: 1,
          userSelect: 'none',
        }}
      >
        {body.glyph}
      </div>
    )
  }

  return (
    <div
      data-node-id={nodeId}
      data-decor="outline"
      style={{ ...base, boxSizing: 'border-box', boxShadow: `inset 0 0 0 var(--border-thin) currentColor` }}
    />
  )
}
