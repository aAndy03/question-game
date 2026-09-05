import type { ReactNode } from 'react'
import { Text } from '@/atoms'

export interface MetaItem {
  readonly label: string
  readonly value: ReactNode
  /** Render the value in the mono role (ids, codes). */
  readonly mono?: boolean | undefined
}

export interface MetaListProps {
  items: readonly MetaItem[]
  columns?: 1 | 2 | 3
}

/** Label-over-value pairs, for detail views. */
export function MetaList({ items, columns = 2 }: MetaListProps) {
  const cols = columns === 1 ? 'grid-cols-1' : columns === 2 ? 'grid-cols-2' : 'grid-cols-3'
  return (
    <dl className={`grid ${cols} gap-x-6 gap-y-4`}>
      {items.map((item) => (
        <div key={item.label} className="flex min-w-0 flex-col gap-0.5">
          <Text as="dt" variant="studio-caption" tone="muted">
            {item.label}
          </Text>
          <Text as="dd" variant={item.mono ? 'studio-mono' : 'studio-body'} tone="default" truncate>
            {item.value}
          </Text>
        </div>
      ))}
    </dl>
  )
}
