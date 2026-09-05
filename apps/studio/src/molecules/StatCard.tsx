import { Panel, Text, type TextTone } from '@/atoms'

export interface StatCardProps {
  value: string | number
  label: string
  tone?: TextTone
  /** `count` rolls the number when it changes. */
  animate?: boolean | undefined
}

/** One large figure on a card. */
export function StatCard({ value, label, tone = 'default', animate }: StatCardProps) {
  return (
    <Panel variant="secondary" className="flex min-w-28 flex-col gap-1">
      <Text as="div" variant="studio-display" tone={tone} tabular transition={animate ? 'count' : 'none'}>
        {value}
      </Text>
      <Text as="div" variant="studio-caption" tone="muted">
        {label}
      </Text>
    </Panel>
  )
}
