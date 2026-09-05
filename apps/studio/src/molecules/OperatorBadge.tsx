import { InitialsAvatar, Text } from '@/atoms'
import { CHROME } from '@/copy'

export interface OperatorBadgeProps {
  name: string | null
  size?: 'sm' | 'md'
  /** Chip-like when true. */
  isActive?: boolean | undefined
}

/** Initials + name, for the top bar and the Operators tab. */
export function OperatorBadge({ name, size = 'sm', isActive }: OperatorBadgeProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <InitialsAvatar name={name ?? '?'} size={size} tone={isActive ? 'accent' : 'default'} />
      <Text variant="studio-label" tone={name ? 'default' : 'muted'} truncate>
        {name ?? CHROME.noOperator}
      </Text>
    </span>
  )
}
