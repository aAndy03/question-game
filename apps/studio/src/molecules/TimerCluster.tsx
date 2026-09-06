import { Text, TransportButton } from '@/atoms'
import { fmt, TIMER } from '@/copy'

export interface TimerClusterProps {
  /** Null at operator pace: the cluster is hidden (spec §2.21). */
  durationMs: number | null
  remainingMs: number
  running: boolean
  /** Locked or expired: the clock is frozen, the buttons inert. */
  frozen: boolean
  expiredOpen: boolean
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  kbd?: string | undefined
  onStart: () => void
  onPause: () => void
}

/** Icon-only start / pause plus the clock (spec §2.21). Hidden at operator pace. */
export function TimerCluster({
  durationMs,
  remainingMs,
  running,
  frozen,
  expiredOpen,
  isDisabled,
  disabledReason,
  kbd,
  onStart,
  onPause,
}: TimerClusterProps) {
  if (durationMs === null) return null
  const fraction = durationMs > 0 ? Math.max(0, Math.min(1, remainingMs / durationMs)) : 0
  const tone = expiredOpen ? 'danger' : remainingMs <= 5000 && running ? 'warning' : frozen ? 'muted' : 'default'
  return (
    <div className="flex items-center gap-3" data-timer-cluster>
      {running ? (
        <TransportButton icon="pause" label={TIMER.pause} state="active" onPress={onPause} isDisabled={isDisabled} disabledReason={disabledReason} kbd={kbd} />
      ) : (
        <TransportButton
          icon="play"
          label={TIMER.start}
          onPress={onStart}
          isDisabled={isDisabled || frozen || remainingMs <= 0}
          disabledReason={disabledReason ?? (frozen ? TIMER.locked : remainingMs <= 0 ? TIMER.expired : null)}
          kbd={kbd}
        />
      )}
      <div className="flex min-w-0 flex-col gap-1">
        <Text variant="studio-display" tone={tone} tabular transition="count">
          {fmt.clock(remainingMs)}
        </Text>
        <div className="h-1 w-24 overflow-hidden rounded-full" style={{ background: 'var(--surface-tertiary)' }} aria-hidden>
          <div
            className="h-full rounded-full transition-[width] duration-100 ease-linear"
            style={{ width: `${fraction * 100}%`, background: tone === 'danger' ? 'var(--danger)' : tone === 'warning' ? 'var(--warning)' : 'var(--accent)' }}
          />
        </div>
      </div>
    </div>
  )
}
