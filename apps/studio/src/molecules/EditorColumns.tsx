import type { ReactNode } from 'react'

export interface EditorColumnsProps {
  /** The form: what the record is. Capped at 48rem, the width fields read at. */
  children: ReactNode
  /** Related, secondary content — a preview, where it is filed, a panel that saves on its own. */
  side?: ReactNode
  /** The side column's accessible name. */
  sideLabel?: string | undefined
}

/**
 * An editor's body (P20, 05_STUDIO_DESIGN.md §2.4): one 48rem column, or —
 * from a 60rem container, and only when there is a side — that column and a
 * 22rem one beside it, the width of the detail aside. A wider window never
 * stretches a row: the extra room becomes the second column, and below the
 * threshold the side follows the form in reading order. A container query,
 * not a breakpoint: the sidebar is 240, 56 or 0px.
 */
export function EditorColumns({ children, side, sideLabel }: EditorColumnsProps) {
  return (
    <div className="@container/editor w-full">
      <div
        className={[
          'grid w-full max-w-3xl grid-cols-1 gap-6',
          side ? '@[60rem]/editor:max-w-[71.5rem] @[60rem]/editor:grid-cols-[minmax(0,48rem)_22rem] @[60rem]/editor:items-start' : '',
        ].join(' ')}
      >
        <div className="flex min-w-0 flex-col gap-6">{children}</div>
        {side ? (
          <aside aria-label={sideLabel} className="flex min-w-0 flex-col gap-6">
            {side}
          </aside>
        ) : null}
      </div>
    </div>
  )
}
