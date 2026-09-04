import type { ReactNode } from 'react'
import { LAYOUT } from '@questiongame/design-stage'

/**
 * The two-column body: a content column that grows and a fixed-width aside
 * (398–600px) for a graphic or a result. Slots only, no domain knowledge.
 */

export interface SplitFrameProps {
  children: ReactNode
  aside?: ReactNode
  asideWidth?: 'min' | 'max'
  gap?: 'tight' | 'loose'
}

export function SplitFrame({ children, aside, asideWidth = 'min', gap = 'loose' }: SplitFrameProps) {
  return (
    <div
      data-split-frame
      style={{
        display: 'flex',
        alignItems: 'stretch',
        gap: gap === 'loose' ? LAYOUT.gapLoose : LAYOUT.gapTight,
        flex: '1 1 auto',
        minHeight: 0,
      }}
    >
      <div data-split-content style={{ flex: '1 1 auto', minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
      <div
        data-split-aside
        style={{
          flex: '0 0 auto',
          width: asideWidth === 'max' ? LAYOUT.decorColumnMax : LAYOUT.decorColumnMin,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {aside}
      </div>
    </div>
  )
}
