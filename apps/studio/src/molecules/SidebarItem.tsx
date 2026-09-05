import { Icon, Text, Tooltip, type IconName } from '@/atoms'

export interface SidebarItemProps {
  icon: IconName
  label: string
  hint?: string | undefined
  isActive: boolean
  /** Rail mode: icon only, label in a tooltip. */
  collapsed: boolean
  badge?: string | number | undefined
  onPress: () => void
}

/** One sidebar entry; active state is the accent (05_STUDIO_DESIGN.md §2.1). */
export function SidebarItem({ icon, label, hint, isActive, collapsed, badge, onPress }: SidebarItemProps) {
  const button = (
    <button
      type="button"
      onClick={onPress}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? undefined : hint}
      className={[
        'group flex h-9 w-full items-center gap-3 rounded-[calc(var(--radius)/1.5)] px-2.5 text-left outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
        isActive
          ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
          : 'text-[var(--foreground)] hover:bg-[var(--surface-secondary)]',
        collapsed ? 'justify-center px-0' : '',
      ].join(' ')}
    >
      <Icon name={icon} size="md" className={isActive ? '' : 'opacity-75 group-hover:opacity-100'} />
      {collapsed ? null : (
        <Text variant="studio-label" tone="inherit" truncate className="flex-1">
          {label}
        </Text>
      )}
      {badge !== undefined && !collapsed ? (
        <span
          className="rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none"
          style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
  return collapsed ? (
    <Tooltip content={label} placement="right" delay={200}>
      {button}
    </Tooltip>
  ) : (
    button
  )
}
