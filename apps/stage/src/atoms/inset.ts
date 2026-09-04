/**
 * Borders are inset box-shadows, never `border` and never drop shadows
 * (design system: "Borders over shadows"). One helper so every component
 * builds the same string and asymmetric weights stay readable.
 */

import { BORDER } from '@questiongame/design-stage'

export type BorderWeight = keyof typeof BORDER

export interface InsetSides {
  readonly top?: BorderWeight | 'none'
  readonly right?: BorderWeight | 'none'
  readonly bottom?: BorderWeight | 'none'
  readonly left?: BorderWeight | 'none'
}

/** `box-shadow` value drawing an inset border on the given sides. */
export function insetBorder(sides: InsetSides, color = 'var(--border-default)'): string {
  const parts: string[] = []
  const w = (k: BorderWeight | 'none' | undefined) => (k && k !== 'none' ? BORDER[k] : null)
  const t = w(sides.top)
  const r = w(sides.right)
  const b = w(sides.bottom)
  const l = w(sides.left)
  if (t) parts.push(`inset 0 ${t} 0 0 ${color}`)
  if (b) parts.push(`inset 0 calc(-1 * ${b}) 0 0 ${color}`)
  if (l) parts.push(`inset ${l} 0 0 0 ${color}`)
  if (r) parts.push(`inset calc(-1 * ${r}) 0 0 0 ${color}`)
  return parts.length ? parts.join(', ') : 'none'
}

/** All four sides at one weight. */
export function insetFrame(weight: BorderWeight, color?: string): string {
  return insetBorder({ top: weight, right: weight, bottom: weight, left: weight }, color)
}

/** The header motif: 1px top and sides, 2px bottom. */
export function insetHeaderRule(color?: string): string {
  return insetBorder({ top: 'thin', right: 'thin', bottom: 'thick', left: 'thin' }, color)
}
