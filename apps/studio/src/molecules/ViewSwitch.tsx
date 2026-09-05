import { ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { Icon, Tooltip } from '@/atoms'
import { LIST } from '@/copy'

export type ViewMode = 'grid' | 'table'

export interface ViewSwitchProps {
  value: ViewMode
  onChange: (view: ViewMode) => void
}

/** grid | table, the same control on every record list (spec §12). */
export function ViewSwitch({ value, onChange }: ViewSwitchProps) {
  return (
    <ToggleButtonGroup
      selectionMode="single"
      selectedKeys={[value]}
      disallowEmptySelection
      size="sm"
      aria-label={LIST.view}
      onSelectionChange={(keys) => {
        const next = [...keys][0]
        if (next === 'grid' || next === 'table') onChange(next)
      }}
    >
      <Tooltip content={LIST.grid}>
        <ToggleButton id="grid" aria-label={LIST.grid}>
          <Icon name="grid" size="sm" />
        </ToggleButton>
      </Tooltip>
      <Tooltip content={LIST.table}>
        <ToggleButton id="table" aria-label={LIST.table}>
          <Icon name="table" size="sm" />
        </ToggleButton>
      </Tooltip>
    </ToggleButtonGroup>
  )
}
