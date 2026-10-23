import type { ReactNode } from 'react'
import { motion } from 'motion/react'

export interface SplitLayoutProps {
  header: ReactNode
  /** The narrow pane (Domains), 224px (280 until P21.2: a name and its count did not need the room). */
  primary: ReactNode
  /** The wide pane (Questions). */
  secondary: ReactNode
}

/** Domains + Questions: two panes under one header (spec §12). */
export function SplitLayout({ header, primary, secondary }: SplitLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col gap-6 p-6"
    >
      {header}
      <div className="grid min-h-0 flex-1 grid-cols-[14rem_minmax(0,1fr)] gap-6">
        <div className="flex min-h-0 flex-col overflow-y-auto">{primary}</div>
        <div className="flex min-h-0 min-w-0 flex-col">{secondary}</div>
      </div>
    </motion.div>
  )
}
