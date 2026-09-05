import { createElement, type CSSProperties, type ReactNode } from 'react'
import { StudioTransition } from '@questiongame/text/studio'
import { variantTokens, type TextTransition, type TextVariant } from '@questiongame/text'

/**
 * The Studio `Text` atom — the React half of `@questiongame/text` (§2.29).
 *
 * `variant` resolves to the Studio type roles in `design-studio/tokens`;
 * nothing here is a raw size. `transition` says what happens when the content
 * *changes*: `none` is a plain node; `swap` and `count` hand the string to
 * Calligraph (Motion), which slides shared characters and fades the rest.
 * Studio has no `anim-complete` contract, so a text tween here is harmless;
 * on Stage the same prop is GSAP inside the screen timeline.
 */

export type StudioTextVariant = Extract<TextVariant, `studio-${string}`>
export type TextTone = 'default' | 'muted' | 'accent' | 'success' | 'warning' | 'danger' | 'inherit'

const TONE: Record<TextTone, string | undefined> = {
  default: 'var(--foreground)',
  muted: 'var(--muted)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
  inherit: undefined,
}

export interface TextProps {
  variant?: StudioTextVariant
  transition?: TextTransition
  as?: keyof HTMLElementTagNameMap
  tone?: TextTone
  /** Single-line ellipsis. */
  truncate?: boolean | undefined
  /** `tabular-nums`, for columns of figures. */
  tabular?: boolean | undefined
  id?: string | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
  title?: string | undefined
  children?: ReactNode
}

export function Text({
  variant = 'studio-body',
  transition = 'none',
  as = 'span',
  tone = 'inherit',
  truncate,
  tabular,
  id,
  className,
  style,
  title,
  children,
}: TextProps) {
  const t = variantTokens(variant)
  const resolved: CSSProperties = {
    fontSize: t.size,
    fontFamily: t.family,
    fontWeight: t.weight,
    letterSpacing: t.tracking,
    lineHeight: t.leading,
    color: TONE[tone],
    ...(truncate ? { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' } : {}),
    ...(tabular ? { fontVariantNumeric: 'tabular-nums' } : {}),
    ...style,
  }
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null
  const body =
    transition !== 'none' && text !== null ? (
      <StudioTransition transition={transition}>{text}</StudioTransition>
    ) : (
      children
    )
  return createElement(as, { id, className, style: resolved, title }, body)
}
