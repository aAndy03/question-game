/**
 * The Studio implementation of `swap` / `count` (spec §2.29): Calligraph,
 * which is Motion underneath. This is the one file in the repo allowed to
 * import `calligraph` (eslint.config.js); the Studio `Text` atom imports
 * this, never the library.
 */

import { Calligraph } from 'calligraph'
import type { TextTransition } from './index'

export interface StudioTransitionProps {
  transition: Exclude<TextTransition, 'none'>
  children: string
}

export function StudioTransition({ transition, children }: StudioTransitionProps) {
  return (
    <Calligraph variant={transition === 'count' ? 'number' : 'text'} animation="smooth">
      {children}
    </Calligraph>
  )
}
