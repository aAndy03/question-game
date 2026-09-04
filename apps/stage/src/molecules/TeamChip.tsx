import { SPACE } from '@questiongame/design-stage'
import { LabelBox, Text } from '@/atoms'

/**
 * A team as a mark plus its name. The mark is the first character of the
 * short code in a letter box; the name is set in true uppercase.
 * Everything is a prop — the chip never knows which team is current.
 */

export interface TeamChipProps {
  name: string
  shortCode: string
  /** Dims the chip (inactive team, or a row not yet revealed). */
  dimmed?: boolean
  /** Fills the mark with ink to point at this team. */
  emphasised?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function TeamChip({ name, shortCode, dimmed = false, emphasised = false, size = 'md' }: TeamChipProps) {
  const initial = shortCode.trim().charAt(0) || name.trim().charAt(0)
  return (
    <span
      data-team-chip
      style={{ display: 'inline-flex', alignItems: 'center', gap: SPACE[3], minWidth: 0 }}
    >
      <LabelBox size={size} fill={dimmed ? 'muted' : emphasised ? 'ink' : 'paper'}>
        {initial}
      </LabelBox>
      <Text
        variant="stage-name"
        transition="swap"
        tone={dimmed ? 'muted' : 'primary'}
        style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </Text>
    </span>
  )
}
