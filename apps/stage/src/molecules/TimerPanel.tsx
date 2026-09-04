import { SPACE } from '@questiongame/design-stage'
import { ClockDigits, Text, insetFrame } from '@/atoms'
import { hud } from '@/copy/format'
import type { ClockHours } from '@/copy/format'

/**
 * A labelled clock: `TIMER // ELAPSED` over `[ 00:12:20 ]`.
 *
 * One molecule serves both clocks Stage can show — the Play clock (how long
 * the game has been running, persistent in the frame) and the question
 * countdown (`TIMER // REMAINING`). Which one, and the milliseconds, are props;
 * the panel never reads time itself.
 *
 * `visible=false` keeps the node mounted (the timer is a persistent slot) but
 * hidden — operator pace hides the countdown entirely (spec §2.4).
 */

export interface TimerPanelProps {
  nodeId?: string
  label: string
  value?: string
  ms: number
  hours?: ClockHours
  /** Draws the digits in the alert colour when the clock is nearly out. */
  urgent?: boolean
  visible?: boolean
  framed?: boolean
  /** `hero` for a panel on the body; `inline` for the header strip. */
  size?: 'hero' | 'inline'
}

export function TimerPanel({
  nodeId,
  label,
  value,
  ms,
  hours = 'auto',
  urgent = false,
  visible = true,
  framed = true,
  size = 'hero',
}: TimerPanelProps) {
  return (
    <div
      {...(nodeId ? { 'data-node-id': nodeId } : {})}
      data-timer-panel
      data-urgent={urgent}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        gap: SPACE[2],
        padding: framed ? SPACE[4] : 0,
        boxShadow: framed ? insetFrame('thin') : 'none',
        visibility: visible ? 'visible' : 'hidden',
      }}
    >
      <Text variant="stage-hud" tone="muted">
        {hud(label, value)}
      </Text>
      <ClockDigits
        ms={ms}
        hours={hours}
        variant={size === 'hero' ? 'stage-display' : 'stage-code'}
        tone="heading"
        style={urgent ? { color: 'var(--state-incorrect)' } : undefined}
      />
    </div>
  )
}
