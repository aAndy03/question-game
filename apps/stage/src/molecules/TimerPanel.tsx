import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { ClockDigits, Text, insetFrame } from '@/atoms'
import { useCopy } from '@/copy'
import { hud } from '@/copy/format'
import type { ClockHours } from '@/copy/format'

/**
 * The side panel with a labelled clock, as the reference draws it: a 2px
 * frame, the label centred over big digits (`timer // remaining` / `00:30`).
 *
 * The panel never reads time itself: the milliseconds are host truth from
 * play-state. `visible=false` keeps the node mounted (a persistent slot)
 * but hidden: operator pace hides the countdown entirely (spec §2.4), and
 * the result widget takes its place once the outcome shows.
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
}

export function TimerPanel({ nodeId, label, value, ms, hours = 'auto', urgent = false, visible = true }: TimerPanelProps) {
  const copy = useCopy()
  return (
    <div
      {...(nodeId ? { 'data-node-id': nodeId } : {})}
      data-timer-panel
      data-urgent={urgent}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE[2],
        width: LAYOUT.sidePanelWidth,
        minHeight: LAYOUT.sidePanelHeight,
        boxSizing: 'border-box',
        padding: SPACE[4],
        background: 'var(--paper)',
        boxShadow: insetFrame('thick'),
        visibility: visible ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-hud" tone="heading">
        {hud(copy, label, value)}
      </Text>
      <ClockDigits
        ms={ms}
        hours={hours}
        brackets={false}
        variant="stage-figure"
        tone="heading"
        style={urgent ? { color: 'var(--state-incorrect)' } : undefined}
      />
    </div>
  )
}
