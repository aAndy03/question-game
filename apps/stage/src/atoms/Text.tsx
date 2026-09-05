import { createElement, useEffect, useRef, type CSSProperties, type ReactNode } from 'react'
import { variantTokens, type TextTransition, type TextVariant } from '@questiongame/text'
import { COLOR } from '@questiongame/design-stage'
import { countText, swapText } from '@/presentation'

/**
 * The Stage `Text` atom — the React half of `@questiongame/text` (§2.29).
 *
 * `variant` resolves to design tokens; nothing here is a raw size. `transition`
 * says what happens when the content *changes*: `none` renders a plain node;
 * `swap` lets the change be seen (the new value rises in); `count` rolls the
 * number in the string from the old value to the new one. Both are GSAP
 * tweens from `@/presentation` on the node React already updated, so the DOM
 * always ends at the rendered truth. The first render never animates.
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
  nodeId?: string | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
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
  const node = useRef<HTMLElement | null>(null)
  const previous = useRef<string | null>(null)
  const text = typeof children === 'string' || typeof children === 'number' ? String(children) : null

  useEffect(() => {
    const el = node.current
    if (transition === 'none' || !el || text === null) return
    const before = previous.current
    previous.current = text
    if (before === null || before === text) return
    if (transition === 'swap') swapText(el)
    else countText(el, before)
  }, [text, transition])

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
      ref: node,
      className,
      style: resolved,
      'data-text-variant': variant,
      'data-text-transition': transition,
      ...(nodeId ? { 'data-node-id': nodeId } : {}),
    },
    children,
  )
}
