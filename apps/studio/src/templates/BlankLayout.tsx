import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface BlankLayoutProps {
  header?: ReactNode
  children: ReactNode
}

/** Content only, for the P8–P11 stubs and the dev harness. */
export function BlankLayout({ header, children }: BlankLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6"
    >
      {header}
      {children}
    </motion.div>
  )
}
