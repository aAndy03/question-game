import type { MonitorInfo } from '@questiongame/contract'
import { Button, Icon, MeaningChip, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'
import { STATS } from '@/copy/stats'

/**
 * `stage`: the pacer stands here — the window whose acks advance the overlay
 * queue and the only one that makes a sound. `mirror`: the same picture, on
 * another display (§9, P11.11). `remembered`: the pick, unplugged. `free`:
 * offers the button.
 */
export type MonitorCardState = 'stage' | 'mirror' | 'remembered' | 'free'

/**
 * The Statistics window on this display (P21.4): `here` — it is open on it;
 * `free` — it can be shown here; `blocked` — Stage stands here, and the two
 * never share a display (§13.3).
 */
export type MonitorStatsState = 'here' | 'free' | 'blocked'

export interface MonitorCardProps {
  monitor: MonitorInfo
  state: MonitorCardState
  onSendStage: () => void
  /** Stop mirroring here. Not offered on the pacer's card — that one moves. */
  onRemoveStage?: (() => void) | undefined
  /** Move the pacer here; given only while it stands on another display. */
  onMoveStage?: (() => void) | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  /** The one-display setup: says so under the card (§2.28). */
  single?: boolean | undefined
  /** Left out, the card offers no Statistics controls. */
  stats?: MonitorStatsState | undefined
  onShowStats?: (() => void) | undefined
  onCloseStats?: (() => void) | undefined
}

const MAX_W = 200
const MAX_H = 120

/**
 * One display as a proportional rectangle with its name, resolution and
 * `primary` chip, in one of three states (05_STUDIO_DESIGN.md §12.2.1).
 * Nothing here touches a Play (§9).
 */
export function MonitorCard({ monitor, state, onSendStage, onRemoveStage, onMoveStage, isDisabled, disabledReason, single, stats, onShowStats, onCloseStats }: MonitorCardProps) {
  // The *physical* mode, not the logical size: a 1080p TV at 150% is a 1080p
  // TV, and a card that said 1280×720 was telling the operator otherwise.
  // `scaleFactor` is shown beside it, because that is where the difference
  // between the two numbers actually lives (§12.2.1).
  const [w, h] = monitor.physicalSize
  const aspect = w > 0 && h > 0 ? w / h : 16 / 9
  const width = Math.round(Math.min(MAX_W, MAX_H * aspect))
  const height = Math.round(width / aspect)
  const name = monitor.friendlyName ?? monitor.name ?? SETTINGS.monitors.unnamed
  const onAir = state === 'stage' || state === 'mirror'
  const border =
    onAir
      ? 'border-2 border-[var(--accent)]'
      : state === 'remembered'
        ? 'border-2 border-dashed border-[var(--warning)]'
        : 'border-2 border-[var(--border)]'

  return (
    <div className="flex flex-col items-start gap-2" data-monitor-card={state} data-monitor-key={monitor.key} data-monitor-stats={stats}>
      <div
        role="img"
        aria-label={[name, SETTINGS.monitors.resolution(w, h), onAir ? SETTINGS.monitors.stage : null, stats === 'here' ? SETTINGS.monitors.statistics : null].filter(Boolean).join(', ')}
        className={['flex flex-col items-center justify-center gap-1 rounded-[calc(var(--radius)/2)] p-2', border].join(' ')}
        style={{ width, height, background: 'var(--surface-secondary)' }}
      >
        {/* What is on this display, drawn as the status bar draws it (P21.4). */}
        {onAir || stats === 'here' ? (
          <span className="flex items-center gap-1.5">
            {onAir ? <Icon name="displays" size="sm" className="text-[var(--accent)]" /> : null}
            {stats === 'here' ? <Icon name="statistics" size="sm" className="text-[var(--success)]" /> : null}
          </span>
        ) : null}
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
        {stats === 'here' ? <MeaningChip meaning="statistics">{SETTINGS.monitors.statistics}</MeaningChip> : null}
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {state === 'free' ? (
          <Button size="sm" variant="secondary" onPress={onSendStage} isDisabled={isDisabled} disabledReason={disabledReason}>
            {SETTINGS.monitors.sendStage}
          </Button>
        ) : null}
        {/* The pacer's card offers neither: it is *moved* from another card,
          * never removed, so the operator cannot end up with no Stage at all
          * (§9, P11.11). Control's Stage display picker did this until P21.4. */}
        {state === 'free' && onMoveStage ? (
          <Button size="sm" variant="tertiary" onPress={onMoveStage} isDisabled={isDisabled} disabledReason={disabledReason}>
            {SETTINGS.monitors.moveStage}
          </Button>
        ) : null}
        {state === 'mirror' && onRemoveStage ? (
          <Button size="sm" variant="tertiary" onPress={onRemoveStage}>
            {SETTINGS.monitors.removeStage}
          </Button>
        ) : null}
        {/* Statistics beside Stage (P21.4): shown on a display, moved to
          * another, closed — never on the display Stage stands on. */}
        {stats === 'free' && onShowStats ? (
          <Button size="sm" variant="secondary" icon="statistics" onPress={onShowStats}>
            {SETTINGS.monitors.showStatsHere}
          </Button>
        ) : null}
        {stats === 'here' && onCloseStats ? (
          <Button size="sm" variant="tertiary" icon="statistics" onPress={onCloseStats}>
            {STATS.window.close}
          </Button>
        ) : null}
      </div>
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
