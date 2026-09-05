import { Separator as HeroSeparator } from '@heroui/react'
import { defined } from './props'

export interface SeparatorProps {
  orientation?: 'horizontal' | 'vertical'
  variant?: 'default' | 'secondary' | 'tertiary'
  className?: string | undefined
}

export function Separator({ orientation = 'horizontal', variant = 'default', className }: SeparatorProps) {
  return <HeroSeparator orientation={orientation} variant={variant} {...defined({ className })} />
}
