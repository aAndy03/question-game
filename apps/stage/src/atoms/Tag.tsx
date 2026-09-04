import type { ReactNode } from 'react'
import { COLOR, RADIUS, SPACE } from '@questiongame/design-stage'
import { Text } from './Text'

/**
 * A solid-fill pill with 0 radius and no border (design system: "Small tag
 * pills (SELECTED, LEADER) get 0 radius and solid fill"). The copy is a prop:
 * the atom knows tones, never words.
 */

export type TagTone = 'ink' | 'leader' | 'correct' | 'incorrect' | 'info' | 'accent'

const FILL: Record<TagTone, string> = {
  ink: COLOR.ink,
  leader: COLOR.leader,
  correct: COLOR.correct,
  incorrect: COLOR.incorrect,
  info: COLOR.info,
  accent: COLOR.accent,
}

export interface TagProps {
  tone?: TagTone
  children: ReactNode
}

export function Tag({ tone = 'ink', children }: TagProps) {
  return (
    <span data-tag-tone={tone} style={{ display: 'inline-block' }}>
      <Text
        as="span"
        variant="stage-code"
        tone={tone === 'ink' ? 'inverse' : 'primary'}
        style={{
          display: 'inline-block',
          background: FILL[tone],
          borderRadius: RADIUS.none,
          padding: `${SPACE[1]} ${SPACE[2]}`,
          whiteSpace: 'nowrap',
        }}
      >
        {children}
      </Text>
    </span>
  )
}
