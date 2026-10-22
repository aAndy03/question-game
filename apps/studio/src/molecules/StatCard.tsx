import { useId, type ReactNode } from 'react'
import { MeterBar, Panel, Text, type TextTone } from '@/atoms'

export interface StatCardProps {
  value: string | number
  label: string
  tone?: TextTone
  /** `count` rolls the number when it changes. */
  animate?: boolean | undefined
  /** A line under the value that says whose or of what: the leader's name, "5 left" (P20). */
  detail?: ReactNode
  /** How much of a whole the value is, drawn under it and named by `label`. */
  meter?: { value: number; max: number } | null | undefined
}

/**
 * One large figure on a card. The card is a group named by its label, so the
 * number is read with what it means — "Accuracy, 57%", not a bare "57%".
 */
export function StatCard({ value, label, tone = 'default', animate, detail, meter }: StatCardProps) {
  const labelId = useId()
  return (
    <div role="group" aria-labelledby={labelId} className="flex min-w-28">
      <Panel variant="secondary" className="flex flex-1 flex-col gap-1">
        <Text as="div" id={labelId} variant="studio-caption" tone="muted">
          {label}
        </Text>
        <Text as="div" variant="studio-display" tone={tone} tabular transition={animate ? 'count' : 'none'}>
          {value}
        </Text>
        {detail !== undefined && detail !== null ? (
          <Text as="div" variant="studio-caption" tone="muted" truncate>
            {detail}
          </Text>
        ) : null}
        {meter ? <MeterBar value={meter.value} max={meter.max} label={label} className="mt-1" /> : null}
      </Panel>
    </div>
  )
}
