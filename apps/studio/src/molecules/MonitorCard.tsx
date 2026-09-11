import type { MonitorInfo } from '@questiongame/contract'
import { Button, MeaningChip, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'

/**
 * `stage`: the pacer stands here — the window whose acks advance the overlay
 * queue and the only one that makes a sound. `mirror`: the same picture, on
 * another display (§9, P11.11). `remembered`: the pick, unplugged. `free`:
 * offers the button.
 */
export type MonitorCardState = 'stage' | 'mirror' | 'remembered' | 'free'

export interface MonitorCardProps {
  monitor: MonitorInfo
  state: MonitorCardState
  onSendStage: () => void
  /** Stop mirroring here. Not offered on the pacer's card — that one moves. */
  onRemoveStage?: (() => void) | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  /** The one-display setup: says so under the card (§2.28). */
  single?: boolean | undefined
}

const MAX_W = 200
const MAX_H = 120

/**
 * One display as a proportional rectangle with its name, resolution and
 * `primary` chip, in one of three states (05_STUDIO_DESIGN.md §12.2.1).
 * Nothing here touches a Play (§9).
 */
export function MonitorCard({ monitor, state, onSendStage, onRemoveStage, isDisabled, disabledReason, single }: MonitorCardProps) {
  // The *physical* mode, not the logical size: a 1080p TV at 150% is a 1080p
  // TV, and a card that said 1280×720 was telling the operator otherwise.
  // `scaleFactor` is shown beside it, because that is where the difference
  // between the two numbers actually lives (§12.2.1).
  const [w, h] = monitor.physicalSize
  const aspect = w > 0 && h > 0 ? w / h : 16 / 9
  const width = Math.round(Math.min(MAX_W, MAX_H * aspect))
  const height = Math.round(width / aspect)
  const name = monitor.friendlyName ?? monitor.name ?? SETTINGS.monitors.unnamed
  const border =
    state === 'stage' || state === 'mirror'
      ? 'border-2 border-[var(--accent)]'
      : state === 'remembered'
        ? 'border-2 border-dashed border-[var(--warning)]'
        : 'border-2 border-[var(--border)]'

  return (
    <div className="flex flex-col items-start gap-2" data-monitor-card={state} data-monitor-key={monitor.key}>
      <div
        role="img"
        aria-label={`${name}, ${SETTINGS.monitors.resolution(w, h)}`}
        className={['flex items-center justify-center rounded-[calc(var(--radius)/2)] p-2', border].join(' ')}
        style={{ width, height, background: 'var(--surface-secondary)' }}
      >
        <Text variant="studio-label" truncate className="max-w-full text-center">
          {name}
        </Text>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Text variant="studio-mono" tone="muted" tabular>
          {SETTINGS.monitors.resolution(w, h)}
        </Text>
        {monitor.scaleFactor !== 1 ? (
          <Text variant="studio-mono" tone="muted" tabular>
            {SETTINGS.monitors.scaling(monitor.scaleFactor)}
          </Text>
        ) : null}
        {monitor.primary ? <MeaningChip meaning="primary">{SETTINGS.monitors.primary}</MeaningChip> : null}
        {state === 'stage' ? <MeaningChip meaning="stage">{SETTINGS.monitors.stage}</MeaningChip> : null}
        {state === 'mirror' ? <MeaningChip meaning="stage">{SETTINGS.monitors.mirror}</MeaningChip> : null}
        {state === 'remembered' ? <MeaningChip meaning="disconnected">{SETTINGS.monitors.notConnected}</MeaningChip> : null}
      </div>
      {state === 'free' ? (
        <Button size="sm" variant="secondary" onPress={onSendStage} isDisabled={isDisabled} disabledReason={disabledReason}>
          {SETTINGS.monitors.sendStage}
        </Button>
      ) : null}
      {/* The pacer's card offers neither: it is *moved* with the display
        * picker, never removed, so the operator cannot end up with no Stage
        * at all (§9, P11.11). */}
      {state === 'mirror' && onRemoveStage ? (
        <Button size="sm" variant="tertiary" onPress={onRemoveStage}>
          {SETTINGS.monitors.removeStage}
        </Button>
      ) : null}
      {monitor.alsoOn.length > 0 ? (
        <Text variant="studio-caption" tone="muted" className="max-w-[16rem]" data-monitor-also-on>
          {SETTINGS.monitors.alsoOn(monitor.alsoOn)}
        </Text>
      ) : null}
      {single ? (
        <Text variant="studio-caption" tone="muted" className="max-w-[16rem]">
          {SETTINGS.monitors.single}
        </Text>
      ) : null}
    </div>
  )
}
