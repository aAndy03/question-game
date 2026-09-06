import type { ReactNode } from 'react'
import { Panel, Text } from '@/atoms'

export interface SettingsGroupProps {
  title: string
  description?: string | undefined
  /** `SettingRow`s, or anything row-shaped. Separated by hairlines. */
  children: ReactNode
  /** A small action beside the title (Reset all, Restore Demo). */
  action?: ReactNode
  id?: string | undefined
  className?: string | undefined
}

/**
 * The grouping frame of the Settings tab, the Control float and the
 * first-run Defaults step (05_STUDIO_DESIGN.md §12.2.2): a `Panel` with a
 * heading and its rows. Nothing clever — one table, three surfaces.
 */
export function SettingsGroup({ title, description, children, action, id, className }: SettingsGroupProps) {
  return (
    <Panel className={className}>
      <section id={id} aria-label={title} className="flex flex-col">
        <header className="flex items-start justify-between gap-4 pb-2">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text as="h2" variant="studio-heading">
              {title}
            </Text>
            {description ? (
              <Text as="p" variant="studio-caption" tone="muted">
                {description}
              </Text>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </header>
        <div className="flex flex-col divide-y divide-[var(--separator)]">{children}</div>
      </section>
    </Panel>
  )
}
