import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface RecordPageLayoutProps {
  /** Sections, stacked. Editors render their own `PageHeader` and `EditorFooter`. */
  children: ReactNode
  /** A section rail on the left (the Game page). */
  rail?: ReactNode
  /**
   * `fluid` (editors): the column fills the page and the editor caps its own
   * content (`EditorColumns`), so the footer and the page background run edge
   * to edge (P20). `wide` (the Game page): up to 96rem.
   */
  width?: 'fluid' | 'wide'
}

/** A padded, scrolling column (05_STUDIO_DESIGN.md §4.4). */
export function RecordPageLayout({ children, rail, width = 'fluid' }: RecordPageLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col overflow-y-auto"
    >
      <div className={['flex w-full flex-1 flex-col gap-6 p-6', width === 'wide' ? 'max-w-[96rem]' : ''].join(' ')}>
        {rail ? (
          <div className="grid grid-cols-[11rem_minmax(0,1fr)] gap-8">
            <div className="sticky top-0 self-start">{rail}</div>
            <div className="flex min-w-0 flex-col gap-6">{children}</div>
          </div>
        ) : (
          children
        )}
      </div>
    </motion.div>
  )
}
