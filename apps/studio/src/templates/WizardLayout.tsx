import type { ReactNode } from 'react'
import { motion } from 'motion/react'
import { Text } from '@/atoms'

export interface WizardLayoutProps {
  /** The wordmark, top-left. */
  brand: string
  /** The `WizardSteps` rail. */
  steps: ReactNode
  /** The step body, one centred column ≤ 560px. */
  children: ReactNode
  /** Right-aligned actions: Skip · Next. */
  footer: ReactNode
}

/**
 * The first-run frame (05_STUDIO_DESIGN.md §12.1): brand · step rail · body ·
 * footer. No sidebar, no top bar, no status bar — the shell is not shown
 * until an operator exists.
 */
export function WizardLayout({ brand, steps, children, footer }: WizardLayoutProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.14, ease: [0.2, 0, 0, 1] }}
      className="flex h-full min-h-0 flex-col"
      style={{ background: 'var(--background)', color: 'var(--foreground)' }}
      data-layout="wizard"
    >
      <header className="flex shrink-0 flex-col gap-4 px-8 pt-6">
        <Text as="div" variant="studio-heading">
          {brand}
        </Text>
        <div className="border-b border-[var(--separator)] pb-4">{steps}</div>
      </header>
      <main className="flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-8 py-8">
        <div className="flex w-full max-w-[560px] flex-col gap-6">{children}</div>
      </main>
      <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--separator)] px-8 py-4">{footer}</footer>
    </motion.div>
  )
}
