import { Avatar, Text, type TeamMarkData } from '@/atoms'

export interface TeamMarkProps {
  mark: TeamMarkData
  /** Show the name beside the mark. */
  withName?: boolean | undefined
  size?: 'sm' | 'md' | 'lg'
}

/** Swatch/logo + short code, optionally the name: the team as a row leader. */
export function TeamMark({ mark, withName, size = 'sm' }: TeamMarkProps) {
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar mark={mark} size={size} />
      {withName ? (
        <span className="flex min-w-0 flex-col">
          <Text variant="studio-label" tone="default" truncate>
            {mark.name ?? mark.shortCode}
          </Text>
          <Text variant="studio-mono" tone="muted">
            {mark.shortCode}
          </Text>
        </span>
      ) : null}
    </span>
  )
}
