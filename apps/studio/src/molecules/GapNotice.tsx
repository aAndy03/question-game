import { Alert } from '@heroui/react'
import { QUESTION } from '@/copy'
import type { QuestionGap } from '@/host/types'

export interface GapNoticeProps {
  gaps: readonly QuestionGap[]
}

/**
 * The line at the top of the question editor and the question detail while a
 * question is incomplete (§2.32, §17.4). It follows the draft as the operator
 * types and is gone when the last gap closes — a statement of fact, not a
 * refusal: a gap never blocks Save.
 */
export function GapNotice({ gaps }: GapNoticeProps) {
  if (gaps.length === 0) return null
  return (
    <Alert status="warning">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{QUESTION.incompleteTitle}</Alert.Title>
        <Alert.Description>{gaps.map((g) => QUESTION.gap[g]).join(' · ')}</Alert.Description>
      </Alert.Content>
    </Alert>
  )
}
