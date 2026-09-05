import type { ReactNode } from 'react'
import { Surface } from '@heroui/react'

export type PanelVariant = 'default' | 'secondary' | 'tertiary' | 'transparent'
export type PanelDensity = 'comfortable' | 'compact'

export interface PanelProps {
  variant?: PanelVariant
  /** `compact` exists for P8's mosaic; P7 pages are `comfortable`. */
  density?: PanelDensity
  /** Removes the padding so a list or table can run edge to edge. */
  flush?: boolean | undefined
  className?: string | undefined
  children: ReactNode
}

/** The only card-like box in Studio: HeroUI `Surface` with the named rhythm. */
export function Panel({ variant = 'default', density = 'comfortable', flush, className, children }: PanelProps) {
  const padding = flush
    ? 'p-0'
    : density === 'compact'
      ? 'p-[var(--panel-padding-compact)]'
      : 'p-[var(--panel-padding-comfortable)]'
  return (
    <Surface variant={variant} className={['rounded-[var(--radius)]', padding, className].filter(Boolean).join(' ')}>
      {children}
    </Surface>
  )
}
