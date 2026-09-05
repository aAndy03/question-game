import { Dropdown, Label } from '@heroui/react'
import { IconButton, type IconName } from '@/atoms'
import { LIST } from '@/copy'

export interface ActionItem {
  readonly id: string
  readonly label: string
  readonly icon?: IconName | undefined
  readonly isDanger?: boolean | undefined
  readonly isDisabled?: boolean | undefined
}

export interface ActionMenuProps {
  items: readonly ActionItem[]
  onAction: (id: string) => void
  label?: string
  size?: 'sm' | 'md'
}

/**
 * Row actions behind one `…` button, in the fixed order Open · Edit ·
 * Duplicate · Archive/Restore (05_STUDIO_DESIGN.md §4.6). Destructive last.
 */
export function ActionMenu({ items, onAction, label = LIST.open, size = 'sm' }: ActionMenuProps) {
  return (
    <Dropdown>
      <Dropdown.Trigger>
        <IconButton icon="moreVertical" label={label} size={size} hideTooltip />
      </Dropdown.Trigger>
      <Dropdown.Popover placement="bottom end">
        <Dropdown.Menu
          onAction={(key) => onAction(String(key))}
          disabledKeys={items.filter((i) => i.isDisabled).map((i) => i.id)}
        >
          {items.map((item) => (
            <Dropdown.Item key={item.id} id={item.id} textValue={item.label} variant={item.isDanger ? 'danger' : 'default'}>
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
