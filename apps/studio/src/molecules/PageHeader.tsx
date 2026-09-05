import type { ReactNode } from 'react'
import { Text } from '@/atoms'

export interface PageHeaderProps {
  title: string
  description?: string | undefined
  /** `NavCrumbs`, when the page is below a tab root. */
  crumbs?: ReactNode
  /** A chip or a status pill beside the title. */
  status?: ReactNode
  /** The one `primary` button on the page. */
  primaryAction?: ReactNode
  /** Secondary and ghost buttons, left of the primary. */
  secondaryActions?: ReactNode
  /** Toolbar slot below the title row (`ListToolbar`, a section rail). */
  toolbar?: ReactNode
  /** The dirty dot, for editors. */
  isDirty?: boolean | undefined
}

/** The top of every page (05_STUDIO_DESIGN.md §4.2). */
export function PageHeader({
  title,
  description,
  crumbs,
  status,
  primaryAction,
  secondaryActions,
  toolbar,
  isDirty,
}: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      {crumbs ? <div>{crumbs}</div> : null}
      <div className="flex min-h-10 items-start justify-between gap-6">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-3">
            <Text as="h1" variant="studio-title" tone="default" truncate>
              {title}
            </Text>
            {isDirty ? (
              <span
                aria-label="Unsaved changes"
                role="img"
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: 'var(--warning)' }}
              />
            ) : null}
            {status}
          </div>
          {description ? (
            <Text as="p" variant="studio-body" tone="muted">
              {description}
            </Text>
          ) : null}
        </div>
        {primaryAction || secondaryActions ? (
          <div className="flex shrink-0 items-center gap-2">
            {secondaryActions}
            {primaryAction}
          </div>
        ) : null}
      </div>
      {toolbar ? <div>{toolbar}</div> : null}
    </header>
  )
}
