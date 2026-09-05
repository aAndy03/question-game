import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface LibraryTabLayoutProps {
  header: ReactNode
  /** The list, filling the remaining height. */
  children: ReactNode
  /** The detail aside, shown beside the list at wide widths. */
  aside?: ReactNode
}

/** Header · list · optional aside. Page padding is 24px (05_STUDIO_DESIGN.md §2.4). */
export function LibraryTabLayout({ header, children, aside }: LibraryTabLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col gap-6 p-6"
    >
      {header}
      <div className="flex min-h-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {aside ? <aside className="hidden w-[22rem] shrink-0 overflow-y-auto xl:block">{aside}</aside> : null}
      </div>
    </motion.div>
  )
}
