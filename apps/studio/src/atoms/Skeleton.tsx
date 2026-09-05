import { Skeleton as HeroSkeleton } from '@heroui/react'

export type SkeletonShape = 'row' | 'card' | 'text' | 'circle'

const SHAPE: Record<SkeletonShape, string> = {
  row: 'h-10 w-full rounded-[calc(var(--radius)/2)]',
  card: 'h-28 w-full rounded-[var(--radius)]',
  text: 'h-4 w-2/3 rounded',
  circle: 'h-8 w-8 rounded-full',
}

export interface SkeletonProps {
  shape?: SkeletonShape
  /** How many to draw. */
  count?: number
  className?: string | undefined
}

/** Every loading state, one look. */
export function Skeleton({ shape = 'row', count = 1, className }: SkeletonProps) {
  return (
    <div className={['flex flex-col gap-2', className].filter(Boolean).join(' ')} aria-busy="true" aria-live="polite">
      {Array.from({ length: count }, (_, i) => (
        <HeroSkeleton key={i} className={SHAPE[shape]} />
      ))}
    </div>
  )
}
