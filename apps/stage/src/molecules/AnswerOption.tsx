import { LAYOUT, RADIUS, SPACE } from '@questiongame/design-stage'
import { LabelBox, Text, insetFrame, type LabelBoxFill } from '@/atoms'

/**
 * One answer card, as the reference draws it: a framed card with a letter
 * box and the text. Five looks, derived by the organism from play-state:
 *
 *   neutral    1px ink frame, paper                     (revealed, no verdict)
 *   selected   2px ink frame, ink letter box            (working choice / locked)
 *   correct    mint fill, 3px frame, ink letter box     (outcome)
 *   incorrect  coral fill, 3px frame, ink letter box    (outcome)
 *   dim        hairline grey frame, 50% opacity         (the others at outcome)
 *
 * `revealed=false` keeps the card mounted but invisible (spec §2.6), so the
 * reveal animates the same node and an overlay cannot reset it.
 */

export type AnswerOptionState = 'neutral' | 'dim' | 'selected' | 'correct' | 'incorrect'

const LOOK: Record<
  AnswerOptionState,
  { bg: string; border: string; weight: 'thin' | 'thick' | 'heavy'; letter: LabelBoxFill; tone: 'heading' | 'muted' | 'inverse'; opacity: number }
> = {
  neutral: { bg: 'var(--paper)', border: 'var(--border-default)', weight: 'thin', letter: 'paper', tone: 'heading', opacity: 1 },
  selected: { bg: 'var(--paper)', border: 'var(--border-default)', weight: 'thick', letter: 'ink', tone: 'heading', opacity: 1 },
  correct: { bg: 'var(--state-correct)', border: 'var(--border-default)', weight: 'heavy', letter: 'ink', tone: 'heading', opacity: 1 },
  incorrect: { bg: 'var(--state-incorrect)', border: 'var(--border-default)', weight: 'heavy', letter: 'ink', tone: 'heading', opacity: 1 },
  dim: { bg: 'var(--paper)', border: 'var(--border-subtle)', weight: 'thin', letter: 'muted', tone: 'muted', opacity: 0.5 },
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
        padding: `0 ${SPACE[4]}`,
        minHeight: LAYOUT.answerCardHeight,
        boxSizing: 'border-box',
        background: look.bg,
        borderRadius: RADIUS.md,
        boxShadow: insetFrame(look.weight, look.border),
        opacity: look.opacity,
        visibility: revealed ? undefined : 'hidden',
      }}
    >
      <LabelBox size="md" fill={look.letter} border="thin">
        {letter}
      </LabelBox>
      <Text variant="stage-answer" transition="swap" tone={look.tone} style={{ overflowWrap: 'anywhere' }}>
        {text}
      </Text>
    </div>
  )
}
