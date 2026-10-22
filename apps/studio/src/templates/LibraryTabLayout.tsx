import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { ListArea } from './ListArea'

export interface LibraryTabLayoutProps {
  header: ReactNode
  /** `ListToolbar`, on its own row above the list and the aside (P20). */
  toolbar?: ReactNode
  /** The list, filling the remaining height. */
  children: ReactNode
  /** The detail aside: beside the list at wide widths, over it below 1280 px (1.1.1). */
  aside?: ReactNode
  /** Back to the list, from the narrow window's Close. */
  onCloseAside?: () => void
}

/** Header · toolbar · list · optional aside. Page padding is 24px (05_STUDIO_DESIGN.md §2.4). */
export function LibraryTabLayout({ header, toolbar, children, aside, onCloseAside }: LibraryTabLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col gap-6 p-6"
    >
      {header}
      <ListArea toolbar={toolbar} aside={aside} onCloseAside={onCloseAside}>
        {children}
      </ListArea>
    </motion.div>
  )
}
