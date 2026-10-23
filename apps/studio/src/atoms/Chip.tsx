import type { ReactNode } from 'react'
import { Chip as HeroChip } from '@heroui/react'
import { defined } from './props'

export type ChipTone = 'default' | 'accent' | 'success' | 'warning' | 'danger'
export type ChipVariant = 'primary' | 'secondary' | 'tertiary' | 'soft'
export type ChipSize = 'sm' | 'md' | 'lg'

export interface ChipProps {
  tone?: ChipTone
  variant?: ChipVariant
  size?: ChipSize
  className?: string | undefined
  children: ReactNode
}

/**
 * HeroUI `Chip`, `soft` and `sm` by default — a label, never a button. It
 * never wraps or shrinks (P20): a squeezed row clips its chips, it does not
 * fold *Multiple answers* onto two lines.
 */
export function Chip({ tone = 'default', variant = 'soft', size = 'sm', className, children }: ChipProps) {
  return (
    <HeroChip color={tone} variant={variant} size={size} className={["shrink-0 whitespace-nowrap", className ?? ""].join(" ").trim()}>
      {children}
    </HeroChip>
  )
}

/**
 * The fixed chip vocabulary (05_STUDIO_DESIGN.md §4.6). Add a meaning here,
 * not at a call site.
 */
export const CHIP_TONES = {
  archived: 'warning',
  overridden: 'accent',
  seed: 'default',
  single: 'default',
  multiple: 'default',
  easy: 'success',
  medium: 'warning',
  hard: 'danger',
  playing: 'success',
  frozen: 'warning',
  active: 'accent',
  pinned: 'default',
  // monitors (P10, §12.2.1)
  primary: 'default',
  stage: 'accent',
  disconnected: 'warning',
  // P21.4: the Statistics window stands on this display
  statistics: 'success',
  // questions (P11.17): a difficulty not set yet
  unset: 'default',
  // P15: an operator's tag on a question
  tag: 'default',
  // P20: an import row changed in the dialog, or left out of the import
  edited: 'accent',
  leftOut: 'default',
} as const satisfies Record<string, ChipTone>

export type ChipMeaning = keyof typeof CHIP_TONES

export function MeaningChip({ meaning, children, size }: { meaning: ChipMeaning; children: ReactNode; size?: ChipSize }) {
  return (
    <Chip tone={CHIP_TONES[meaning]} {...defined({ size })}>
      {children}
    </Chip>
  )
}
