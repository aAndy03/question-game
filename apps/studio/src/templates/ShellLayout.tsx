import type { ReactNode } from 'react'

export interface ShellLayoutProps {
  sidebar: ReactNode
  top: ReactNode
  status: ReactNode
  /** Floating layers: the notice collector and dialogs. */
  overlays?: ReactNode
  children: ReactNode
}

/**
 * Sidebar · top bar · content · status bar. The sidebar column animates its
 * own width; the grid only has to let it.
 */
export function ShellLayout({ sidebar, top, status, overlays, children }: ShellLayoutProps) {
  return (
    <div className="relative flex h-full w-full overflow-hidden" style={{ background: 'var(--background)', color: 'var(--foreground)' }}>
      {sidebar}
      <div className="flex min-w-0 flex-1 flex-col">
        {top}
        <main className="min-h-0 flex-1 overflow-hidden">{children}</main>
        {status}
      </div>
      {overlays}
    </div>
  )
}
