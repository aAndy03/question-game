import { Icon, Text, Tooltip, type IconName } from '@/atoms'

export interface SidebarItemProps {
  icon: IconName
  label: string
  hint?: string | undefined
  isActive: boolean
  /** Rail mode: icon only, label in a tooltip. */
  collapsed: boolean
  badge?: string | number | undefined
  /**
   * `sm`: the size of a status bar item (P20) — Settings, on the shell's
   * bottom row beside the status bar, where a full nav row read as a second,
   * louder status bar.
   */
  size?: 'md' | 'sm' | undefined
  onPress: () => void
}

/** One sidebar entry; active state is the accent (05_STUDIO_DESIGN.md §2.1). */
export function SidebarItem({ icon, label, hint, isActive, collapsed, badge, size = 'md', onPress }: SidebarItemProps) {
  const small = size === 'sm'
  const button = (
    <button
      type="button"
      onClick={onPress}
      aria-current={isActive ? 'page' : undefined}
      aria-label={collapsed ? label : undefined}
      title={collapsed ? undefined : hint}
      className={[
        'group flex items-center rounded-[calc(var(--radius)/1.5)] px-2.5 text-left outline-none transition-colors',
        small ? 'h-6 gap-1.5' : 'h-9 w-full gap-3',
        'focus-visible:ring-2 focus-visible:ring-[var(--focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]',
        isActive
          ? 'bg-[var(--accent)]/12 text-[var(--accent)]'
          : [small ? 'text-[var(--muted)]' : 'text-[var(--foreground)]', 'hover:bg-[var(--surface-secondary)]'].join(' '),
        collapsed ? 'w-full justify-center px-0' : '',
      ].join(' ')}
    >
      <Icon name={icon} size={small ? 'sm' : 'md'} className={isActive ? '' : 'opacity-75 group-hover:opacity-100'} />
      {collapsed ? null : (
        <Text variant={small ? 'studio-caption' : 'studio-label'} tone="inherit" truncate className={small ? undefined : 'flex-1'}>
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
