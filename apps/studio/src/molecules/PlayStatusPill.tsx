import type { PlayStatus } from '@questiongame/contract'
import { StatusDot, Text, type DotTone } from '@/atoms'
import { PLAY_STATUS } from '@/copy'

export interface PlayStatusPillProps {
  status: PlayStatus | null
  /** The recipe in Control, when one is loaded. */
  recipeName?: string | null | undefined
}

const TONE: Record<PlayStatus, DotTone> = {
  loaded: 'accent',
  playing: 'success',
  paused: 'warning',
  completed: 'neutral',
  abandoned: 'danger',
  restarted: 'accent',
}

/** Status dot + label; the label swaps visibly when the status changes. */
export function PlayStatusPill({ status, recipeName }: PlayStatusPillProps) {
  const label = status ? PLAY_STATUS[status] : PLAY_STATUS.none
  return (
    <span
      className="inline-flex h-7 max-w-xs items-center gap-2 rounded-full border border-[var(--border)] px-2.5"
      style={{ background: 'var(--surface)' }}
    >
      <StatusDot tone={status ? TONE[status] : 'neutral'} pulse={status === 'playing'} />
      {recipeName ? (
        <Text variant="studio-label" tone="default" truncate>
          {recipeName}
        </Text>
      ) : null}
      {recipeName ? <span aria-hidden className="text-[var(--muted)]">·</span> : null}
      <Text variant="studio-label" tone={status ? 'default' : 'muted'} transition="swap">
        {label}
      </Text>
    </span>
  )
}
