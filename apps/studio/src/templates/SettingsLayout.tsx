import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface SettingsLayoutProps {
  /** A `PageHeader`. */
  header: ReactNode
  /** The HeroUI `Tabs` list: Monitors · Settings · Keyboard shortcuts. */
  tabs: ReactNode
  /** The selected inner tab's panel, in one scrolling column with page padding. */
  children: ReactNode
  /**
   * How wide the column is. `form` (default) is a settings column — a form is
   * unreadable at full window width. `wide` is for content that earns the
   * room: Statistics' tables and charts (§13.2).
   */
  width?: 'form' | 'wide'
}

/** header · inner tabs · scrolling column (05_STUDIO_DESIGN.md §12.2). */
export function SettingsLayout({ header, tabs, children, width = 'form' }: SettingsLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col"
      data-layout="settings"
    >
      <div className="flex shrink-0 flex-col gap-4 px-6 pt-6">
        {header}
        <div className="border-b border-[var(--separator)]">{tabs}</div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className={['flex w-full flex-col gap-6 p-6', width === 'wide' ? 'max-w-6xl' : 'max-w-3xl'].join(' ')}>{children}</div>
      </div>
    </motion.div>
  )
}
