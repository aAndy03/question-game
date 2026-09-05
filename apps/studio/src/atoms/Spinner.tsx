import { Spinner as HeroSpinner } from '@heroui/react'

export interface SpinnerProps {
  size?: 'sm' | 'md'
  label?: string
}

/** Inside buttons and empty regions only; lists use `Skeleton`. */
export function Spinner({ size = 'sm', label = 'Loading' }: SpinnerProps) {
  return <HeroSpinner size={size} color="current" aria-label={label} />
}
