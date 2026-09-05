import { Tabs } from '@heroui/react'
import { LIST } from '@/copy'

export type ArchiveView = 'active' | 'archived'

export interface ArchiveToggleProps {
  value: ArchiveView
  onChange: (scope: ArchiveView) => void
  /** Optional counts shown after the labels. */
  counts?: { active?: number | undefined; archived?: number | undefined } | undefined
}

/** Active | Archived, inside every library tab (spec §2.24). */
export function ArchiveToggle({ value, onChange, counts }: ArchiveToggleProps) {
  const label = (base: string, n: number | undefined) => (n === undefined ? base : `${base} · ${n}`)
  return (
    <Tabs
      variant="secondary"
      selectedKey={value}
      onSelectionChange={(key) => {
        if (key === 'active' || key === 'archived') onChange(key)
      }}
    >
      <Tabs.ListContainer>
        <Tabs.List aria-label="Archive scope">
          <Tabs.Tab id="active">
            {label(LIST.active, counts?.active)}
            <Tabs.Indicator />
          </Tabs.Tab>
          <Tabs.Tab id="archived">
            {label(LIST.archived, counts?.archived)}
            <Tabs.Indicator />
          </Tabs.Tab>
        </Tabs.List>
      </Tabs.ListContainer>
    </Tabs>
  )
}
