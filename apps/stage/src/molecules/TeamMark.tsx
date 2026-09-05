import { RADIUS, SPACE } from '@questiongame/design-stage'
import { Text, insetFrame } from '@/atoms'

/**
 * A team's mark: its initial in a box filled with the team colour (a token
 * name or a literal from play-state). Sized for the interstitials, where it
 * sits beside a hero-size name.
 */

export interface TeamMarkProps {
  nodeId?: string | undefined
  shortCode: string
  name: string
  /** The team colour as play-state carries it, e.g. `var(--state-accent)`. */
  color: string
  size?: 'md' | 'lg'
}

export function TeamMark({ nodeId, shortCode, name, color, size = 'lg' }: TeamMarkProps) {
  const initial = shortCode.trim().charAt(0) || name.trim().charAt(0)
  const side = size === 'lg' ? SPACE[7] : SPACE[6]
  return (
    <span
      {...(nodeId ? { 'data-node-id': nodeId } : {})}
      data-team-mark
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: side,
        height: side,
        flex: '0 0 auto',
        background: color,
        borderRadius: RADIUS.sm,
        boxShadow: insetFrame('thin'),
      }}
    >
      <Text variant="stage-letter" tone="heading">
        {initial}
      </Text>
    </span>
  )
}
