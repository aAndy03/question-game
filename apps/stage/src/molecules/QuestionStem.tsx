import { Text } from '@/atoms'

/**
 * The question text. Sentence case, human voice. Hidden-but-mounted until the
 * operator reveals it (spec §2.6).
 */

export interface QuestionStemProps {
  nodeId: string
  stem: string
  revealed?: boolean
}

export function QuestionStem({ nodeId, stem, revealed = true }: QuestionStemProps) {
  return (
    <Text
      as="p"
      variant="stage-question"
      transition="swap"
      tone="heading"
      nodeId={nodeId}
      style={{ visibility: revealed ? undefined : 'hidden', overflowWrap: 'anywhere' }}
    >
      {stem}
    </Text>
  )
}
