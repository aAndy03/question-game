import type { ReactNode } from 'react'
import { LAYOUT } from '@questiongame/design-stage'

/**
 * The Stage canvas: fixed 1920×1080, 64px padding, 40px header/body gap.
 * Three slots — header, body, decor — and no content of its own.
 *
 * The header and decor slots are persistent (contract §3): a page swaps the
 * body, the frame keeps the rest mounted. Decor sits in its own absolutely
 * positioned layer beneath the content so loose shapes never affect layout.
 */

export interface StageFrameProps {
  header?: ReactNode
  decor?: ReactNode
  /** The overlay layer: drawn above the content, never remounting it (spec §2.6). */
  overlay?: ReactNode
  children: ReactNode
  /** Data hook for the current screen, for tests and the Screens canvas. */
  screen?: string
}

export function StageFrame({ header, decor, overlay, children, screen }: StageFrameProps) {
  return (
    <div
      data-surface="stage"
      data-stage-frame
      {...(screen ? { 'data-screen': screen } : {})}
      style={{
        position: 'relative',
        boxSizing: 'border-box',
        width: LAYOUT.width,
        height: LAYOUT.height,
        overflow: 'hidden',
        background: 'var(--surface)',
        color: 'var(--text-primary)',
      }}
    >
      <div
        data-stage-decor
        aria-hidden
        style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}
      >
        {decor}
      </div>
      <div
        data-stage-content
        style={{
          position: 'relative',
          boxSizing: 'border-box',
          display: 'flex',
          flexDirection: 'column',
          gap: LAYOUT.zoneGap,
          width: '100%',
          height: '100%',
          padding: LAYOUT.padding,
        }}
      >
        <div data-stage-header-slot style={{ flex: '0 0 auto' }}>
          {header}
        </div>
        <div data-stage-body style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          {children}
        </div>
      </div>
      <div data-stage-overlay style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {overlay}
      </div>
    </div>
  )
}
