import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface WorkshopLayoutProps {
  /** Game picker, screen tabs, save state. */
  toolbar: ReactNode
  /** The canvas, filling the remaining space. */
  children: ReactNode
  /** The inspector column, 22rem. */
  inspector: ReactNode
}

/** Toolbar · canvas · inspector (05_STUDIO_DESIGN.md §11.3). */
export function WorkshopLayout({ toolbar, children, inspector }: WorkshopLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center gap-3 border-b border-[var(--chrome-line)] px-4 py-2">{toolbar}</div>
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-h-0 min-w-0 p-4">{children}</div>
        <aside className="min-h-0 overflow-y-auto border-l border-[var(--chrome-line)] p-4" style={{ background: 'var(--surface)' }}>
          {inspector}
        </aside>
      </div>
    </motion.div>
  )
}
