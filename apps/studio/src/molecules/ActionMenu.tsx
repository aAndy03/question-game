import type { ReactNode } from 'react'
import { Description, Dropdown, Header, Label, Separator as MenuSeparator } from '@heroui/react'
import { Icon, IconButton, type IconName } from '@/atoms'
import { LIST } from '@/copy'

export interface ActionItem {
  readonly id: string
  readonly label: string
  readonly icon?: IconName | undefined
  readonly isDanger?: boolean | undefined
  readonly isDisabled?: boolean | undefined
  /** Why it is disabled, said under its name (§4.2: visible, disabled, with the reason). */
  readonly disabledReason?: string | null | undefined
  /** A line under the name that is not a reason (e.g. what *Move* leaves out). */
  readonly description?: string | null | undefined
}

/** A titled group of a menu's items (P20). Titles come from `MENU` (05_STUDIO_DESIGN.md §4.6). */
export interface ActionSection {
  readonly id: string
  readonly title: string
  readonly items: readonly ActionItem[]
}

export interface ActionMenuProps {
  sections: readonly ActionSection[]
  onAction: (id: string) => void
  label?: string
  size?: 'sm' | 'md'
}

/** The ids a set of sections disables — for `Dropdown.Menu`'s `disabledKeys`. */
export const disabledIds = (sections: readonly ActionSection[]): string[] =>
  sections.flatMap((s) => s.items.filter((i) => i.isDisabled || i.disabledReason).map((i) => i.id))

/**
 * A menu's sections as `Dropdown.Menu` children (P20): a header per section,
 * a separator between them, an empty section left out — so a conditional
 * item needs no special case. A plain function, not a component: React Aria's
 * collection must see `Dropdown.Section` directly. Shared by `ActionMenu` and
 * the hand-built menus (bulk *Edit…*, *Copy or move…*), so every menu draws
 * its sections the same way.
 */
export function renderMenuSections(sections: readonly ActionSection[]): ReactNode[] {
  return sections
    .filter((s) => s.items.length > 0)
    .flatMap((s, i) => [
      i > 0 ? <MenuSeparator key={`sep:${s.id}`} /> : null,
      // Sections and items share one collection: a section id must never equal an item id.
      <Dropdown.Section key={`section:${s.id}`} id={`section:${s.id}`}>
        <Header>{s.title}</Header>
        {s.items.map((item) => {
          const note = item.disabledReason ?? item.description ?? null
          return (
            // Named by its label alone: a reason under it is a description, not part of its name.
            <Dropdown.Item key={item.id} id={item.id} textValue={item.label} aria-label={item.label} variant={item.isDanger ? 'danger' : 'default'}>
              {item.icon ? <Icon name={item.icon} size="sm" className={item.isDanger ? 'text-danger' : 'text-muted'} /> : null}
              <Label>{item.label}</Label>
              {note ? <Description>{note}</Description> : null}
            </Dropdown.Item>
          )
        })}
      </Dropdown.Section>,
    ])
    .filter(Boolean)
}

/**
 * Row actions behind one `…` button, in titled sections (P20): the row's own
 * kind (Open, Edit…) · *Copy and move* · *Status* (Archive / Restore) ·
 * *Danger zone* (only what cannot be undone). The order inside follows
 * 05_STUDIO_DESIGN.md §4.6 — destructive last.
 */
export function ActionMenu({ sections, onAction, label = LIST.open, size = 'sm' }: ActionMenuProps) {
  return (
    <Dropdown>
      {/* The trigger is the button itself: `Dropdown.Trigger` renders a
        * `<button>` of its own around whatever it wraps, which nests two
        * buttons and is invalid HTML. HeroUI v3's own usage example puts the
        * Button directly under `Dropdown`. */}
      <IconButton icon="moreVertical" label={label} size={size} hideTooltip />
      <Dropdown.Popover placement="bottom end" className="min-w-[14rem]">
        <Dropdown.Menu onAction={(key) => onAction(String(key))} disabledKeys={disabledIds(sections)}>
          {renderMenuSections(sections)}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )
}
