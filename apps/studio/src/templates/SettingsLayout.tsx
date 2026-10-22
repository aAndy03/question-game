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
   * room: Statistics' tables and charts (§13.2). `full`: the Statistics
   * window on its own display (P20), every pixel for the charts.
   */
  width?: 'form' | 'wide' | 'full'
  /** Beside a form column on a wide page (P20): *On this page*. Hidden where it would squeeze the form. */
  aside?: ReactNode
}

/** header · inner tabs · scrolling column (05_STUDIO_DESIGN.md §12.2). */
export function SettingsLayout({ header, tabs, children, width = 'form', aside }: SettingsLayoutProps) {
  const cap = width === 'full' ? '' : width === 'wide' ? 'max-w-6xl' : aside ? 'max-w-[64rem]' : 'max-w-3xl'
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
        <div className={['@container/settings w-full p-6', cap].join(' ')}>
          {aside ? (
            <div className="grid grid-cols-1 gap-8 @[60rem]/settings:grid-cols-[minmax(0,48rem)_minmax(0,12rem)]">
              <div className="flex min-w-0 flex-col gap-6">{children}</div>
              <div className="hidden @[60rem]/settings:block">{aside}</div>
            </div>
          ) : (
            <div className="flex flex-col gap-6">{children}</div>
          )}
        </div>
      </div>
    </motion.div>
  )
}
