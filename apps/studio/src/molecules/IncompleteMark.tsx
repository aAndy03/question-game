import { Icon, Tooltip } from '@/atoms'
import { QUESTION } from '@/copy'
import type { QuestionGap } from '@/host/types'

export interface IncompleteMarkProps {
  /** Empty renders nothing: a complete question carries no mark (§17.4). */
  gaps: readonly QuestionGap[]
  size?: 'sm' | 'md' | undefined
}

/**
 * The warning an incomplete question carries wherever it is listed (§2.32),
 * its gaps in the tooltip and in the accessible name. It goes the moment the
 * last gap closes, because it is derived from the row and never stored.
 */
export function IncompleteMark({ gaps, size = 'sm' }: IncompleteMarkProps) {
  if (gaps.length === 0) return null
  const label = QUESTION.incompleteLabel(gaps)
  return (
    <Tooltip content={label}>
      <span className="inline-flex" style={{ color: 'var(--warning)' }}>
        <Icon name="warn" size={size} label={label} />
      </span>
    </Tooltip>
  )
}
