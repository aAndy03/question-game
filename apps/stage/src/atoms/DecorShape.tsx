import type { CSSProperties, Ref } from 'react'
import { COLOR } from '@questiongame/design-stage'

/**
 * One decorative body, absolutely positioned inside the decor layer by a
 * single `transform` (translate to its centre-box, then rotate). Three kinds:
 *
 *   svg      inline markup from the copied assets, coloured via currentColor
 *   glyph    a character in the display face (stand-in for missing paths),
 *            filled or, with `stroke`, as a hairline outline
 *   outline  a hairline square, circle or rectangle
 *
 * The atom takes numbers and markup; it never chooses a shape, a colour, or a
 * position. The body keeps moving for the life of the screen, so the owner
 * holds a `ref` and rewrites `style.transform` each frame — the atom renders
 * the first frame and the static look, nothing more.
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

export type DecorShapeBody =
  | { kind: 'svg'; markup: string }
  | { kind: 'glyph'; glyph: string; stroke?: boolean }
  | { kind: 'outline'; shape: 'square' | 'circle' | 'rect' }

export interface DecorShapeProps {
  nodeId: string
  width: number
  height: number
  /** The full transform for this frame; see `decorTransform` in `@/decor`. */
  transform: string
  color: DecorShapeColor
  /** A number, or a CSS value such as `var(--decor-opacity-texture-min)`. */
  opacity: number | string
  body: DecorShapeBody
  ref?: Ref<HTMLDivElement>
}

export function DecorShape({ nodeId, width, height, transform, color, opacity, body, ref }: DecorShapeProps) {
  const base: CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    width,
    height,
    transform,
    transformOrigin: '50% 50%',
    willChange: 'transform',
    color: FILL[color],
    opacity,
    pointerEvents: 'none',
  }

  if (body.kind === 'svg') {
    return (
      <div
        ref={ref}
        data-node-id={nodeId}
        data-decor="svg"
        style={{ ...base, display: 'block', lineHeight: 0 }}
        dangerouslySetInnerHTML={{ __html: body.markup }}
      />
    )
  }

  if (body.kind === 'glyph') {
    const stroke: CSSProperties = body.stroke
      ? { WebkitTextStroke: 'var(--border-thin) currentColor', WebkitTextFillColor: 'transparent' }
      : {}
    return (
      <div
        ref={ref}
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
          ...stroke,
        }}
      >
        {body.glyph}
      </div>
    )
  }

  return (
    <div
      ref={ref}
      data-node-id={nodeId}
      data-decor="outline"
      data-shape={body.shape}
      style={{
        ...base,
        boxSizing: 'border-box',
        borderRadius: body.shape === 'circle' ? '50%' : 'var(--radius-none)',
        boxShadow: `inset 0 0 0 var(--border-thin) currentColor`,
      }}
    />
  )
}
