/**
 * Decorative bodies — the loose 2D shapes that scatter around a screen.
 *
 * A screen declares a manifest (`ScreenDecorSpec`): a boundary box the bodies
 * cannot escape, and a list of bodies with *ranges* rather than positions.
 * The concrete layout is derived from a seed taken from the Play (team names,
 * domain names, play id), so every Play gets its own scatter while the visual
 * style — which shapes, which colours, which weights — stays exactly what the
 * design system fixes.
 *
 * Positions and rotations in a manifest are hints only. The settle step
 * (`settle.ts`) resolves collisions and containment, and what it returns is
 * the static state the page renders.
 */

import type { StageScreen } from '@questiongame/contract'

/** Design-system colour tokens a body may take. */
export type DecorColor = 'ink' | 'correct' | 'incorrect' | 'info' | 'leader' | 'accent'

export interface Range {
  readonly min: number
  readonly max: number
}

/** A copied SVG from packages/design-stage/assets, rendered at `height`. */
export interface SvgBody {
  readonly kind: 'svg'
  readonly asset: string
  /** Rendered height in canvas px. Width follows the asset's aspect. */
  readonly height: Range
}

/**
 * A glyph set in the display face. Stand-in for shapes the Figma export did
 * not include as paths (the giant `?`, digits); swapping to an `svg` body is
 * a manifest edit once the asset exists.
 */
export interface GlyphBody {
  readonly kind: 'glyph'
  readonly glyph: string
  /** Rendered glyph height in canvas px. */
  readonly height: Range
  /** Width / height of the glyph's ink, for the collider. */
  readonly aspect: number
}

/** A stroked outline square — the diamond outlines in the reference. */
export interface OutlineBody {
  readonly kind: 'outline'
  readonly side: Range
}

export type DecorBodySpec = (SvgBody | GlyphBody | OutlineBody) & {
  readonly color: DecorColor
  /** 0.12–0.35 as texture, 1 as commentary. */
  readonly opacity: number
  /** Extra rotation on top of whatever the asset already bakes in, degrees. */
  readonly rotation: Range
  /**
   * Where the body prefers to start, as fractions of the boundary (0–1).
   * Absent means anywhere. The solver may move it to resolve collisions.
   */
  readonly anchor?: { readonly x: Range; readonly y: Range }
}

/** The invisible box, in canvas px. May extend past the 1920×1080 canvas so
 * shapes can bleed off the edge as they do in the reference. */
export interface DecorBoundary {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export interface ScreenDecorSpec {
  readonly screen: StageScreen
  readonly boundary: DecorBoundary
  readonly bodies: readonly DecorBodySpec[]
  /** Downward pull during settle. 0 keeps the scatter; small values let
   * bodies drift down a little. */
  readonly gravity?: number
}

/** One body after settle — what the page renders. */
export interface PlacedBody {
  readonly index: number
  readonly spec: DecorBodySpec
  /** Centre, canvas px. */
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
  /** Degrees. */
  readonly angle: number
}
