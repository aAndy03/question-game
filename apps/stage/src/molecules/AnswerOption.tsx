import { RADIUS, SPACE } from '@questiongame/design-stage'
import { LabelBox, Text, insetFrame, type LabelBoxFill } from '@/atoms'

/**
 * One answer card — an 8px-radius surface, one of the two rounded shapes in
 * the system. The visual state is derived by the organism from play-state;
 * the card only knows the five looks.
 *
 * `revealed=false` keeps the card mounted but invisible (spec §2.6), so the
 * reveal animates the same node and an overlay cannot reset it.
 */

export type AnswerOptionState = 'neutral' | 'dim' | 'selected' | 'correct' | 'incorrect'

const LOOK: Record<
  AnswerOptionState,
  { bg: string; border: string; weight: 'thin' | 'heavy'; letter: LabelBoxFill; tone: 'primary' | 'muted' | 'inverse' | 'heading'; opacity: number }
> = {
  neutral: { bg: 'var(--paper)', border: 'var(--border-default)', weight: 'thin', letter: 'paper', tone: 'heading', opacity: 1 },
  dim: { bg: 'var(--paper)', border: 'var(--border-subtle)', weight: 'thin', letter: 'muted', tone: 'muted', opacity: 0.5 },
  selected: { bg: 'var(--ink)', border: 'var(--ink)', weight: 'heavy', letter: 'ink', tone: 'inverse', opacity: 1 },
  correct: { bg: 'var(--state-correct)', border: 'var(--border-default)', weight: 'heavy', letter: 'correct', tone: 'heading', opacity: 1 },
  incorrect: { bg: 'var(--state-incorrect)', border: 'var(--border-default)', weight: 'heavy', letter: 'incorrect', tone: 'heading', opacity: 1 },
}

export interface AnswerOptionProps {
  nodeId: string
  letter: string
  text: string
  state?: AnswerOptionState
  revealed?: boolean
}

export function AnswerOption({ nodeId, letter, text, state = 'neutral', revealed = true }: AnswerOptionProps) {
  const look = LOOK[state]
  return (
    <div
      data-node-id={nodeId}
      data-state={state}
      data-revealed={revealed}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[4],
        padding: SPACE[5],
        background: look.bg,
        borderRadius: RADIUS.md,
        boxShadow: insetFrame(look.weight, look.border),
        opacity: look.opacity,
        visibility: revealed ? 'visible' : 'hidden',
      }}
    >
      <LabelBox size="lg" fill={look.letter}>
        {letter}
      </LabelBox>
      <Text variant="stage-heading" transition="swap" tone={look.tone} style={{ overflowWrap: 'anywhere' }}>
        {text}
      </Text>
    </div>
  )
}
