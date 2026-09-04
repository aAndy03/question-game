import { createElement, type CSSProperties, type ReactNode } from 'react'
import { variantTokens, type TextTransition, type TextVariant } from '@questiongame/text'
import { COLOR } from '@questiongame/design-stage'

/**
 * The Stage `Text` atom — the React half of `@questiongame/text` (§2.29).
 *
 * `variant` resolves to design tokens; nothing here is a raw size. `transition`
 * says what happens when the content *changes*: `none` (this phase) renders a
 * plain node. `swap` and `count` arrive at P3 as GSAP tweens inside the screen
 * timeline; until then they render exactly like `none`, so callers can already
 * declare intent without a runtime.
 */

export type TextTone = 'primary' | 'heading' | 'muted' | 'inverse'

const TONE: Record<TextTone, string> = {
  primary: COLOR.textPrimary,
  heading: COLOR.textHeading,
  muted: COLOR.textMuted,
  inverse: 'var(--text-inverse)',
}

export interface StageTextProps {
  variant: TextVariant
  transition?: TextTransition
  as?: keyof HTMLElementTagNameMap
  tone?: TextTone
  /** Contract node id, when this text is itself an addressable node. */
  nodeId?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Text({
  variant,
  transition = 'none',
  as = 'span',
  tone = 'primary',
  nodeId,
  className,
  style,
  children,
}: StageTextProps) {
  const t = variantTokens(variant)
  const resolved: CSSProperties = {
    margin: 0,
    fontSize: t.size,
    fontFamily: t.family,
    fontWeight: t.weight,
    letterSpacing: t.tracking,
    lineHeight: t.leading,
    textTransform: t.casing as CSSProperties['textTransform'],
    color: TONE[tone],
    ...style,
  }
  return createElement(
    as,
    {
      className,
      style: resolved,
      'data-text-variant': variant,
      'data-text-transition': transition,
      ...(nodeId ? { 'data-node-id': nodeId } : {}),
    },
    children,
  )
}
