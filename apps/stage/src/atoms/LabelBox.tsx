import type { ReactNode } from 'react'
import { COLOR, RADIUS, SPACE } from '@questiongame/design-stage'
import { insetFrame } from './inset'
import { Text, type TextTone } from './Text'
import type { BorderWeight } from './inset'

/**
 * The letter / avatar box: the only surface with a 4px radius. Holds one
 * short mark — an answer letter, a team initial.
 */

export type LabelBoxSize = 'sm' | 'md' | 'lg'
export type LabelBoxFill = 'paper' | 'ink' | 'correct' | 'incorrect' | 'muted'

const SIZE: Record<LabelBoxSize, string> = {
  sm: SPACE[6],
  md: SPACE[7],
  lg: SPACE[8],
}

const FILL: Record<LabelBoxFill, { bg: string; fg: TextTone; border: string }> = {
  paper: { bg: COLOR.paper, fg: 'primary', border: COLOR.borderDefault },
  ink: { bg: COLOR.ink, fg: 'inverse', border: COLOR.ink },
  correct: { bg: COLOR.correct, fg: 'primary', border: COLOR.borderDefault },
  incorrect: { bg: COLOR.incorrect, fg: 'primary', border: COLOR.borderDefault },
  muted: { bg: COLOR.paper, fg: 'muted', border: COLOR.borderSubtle },
}

export interface LabelBoxProps {
  size?: LabelBoxSize
  fill?: LabelBoxFill
  border?: BorderWeight
  children: ReactNode
}

export function LabelBox({ size = 'md', fill = 'paper', border = 'thick', children }: LabelBoxProps) {
  const f = FILL[fill]
  return (
    <span
      data-label-box={fill}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: SIZE[size],
        height: SIZE[size],
        flex: '0 0 auto',
        background: f.bg,
        borderRadius: RADIUS.sm,
        boxShadow: insetFrame(border, f.border),
      }}
    >
      <Text variant="stage-letter" tone={f.fg}>
        {children}
      </Text>
    </span>
  )
}
