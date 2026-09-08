import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Text } from '@/atoms'

export type PanelDensity = 'comfortable' | 'compact' | 'dense'

/** The measured box, for a panel whose content also depends on its height. */
export interface PanelBox {
  readonly width: number
  readonly height: number
}

export interface MosaicPanelProps {
  /** The density floor from the host (`control.mosaic_density`). */
  floor: 'comfortable' | 'compact' | 'spacious'
  /** Render prop: the panel decides its own layout from the density it was given. */
  children: (density: PanelDensity, box: PanelBox) => ReactNode
  /** Something to pin top-right of the body (a count, a status). */
  corner?: ReactNode
  padded?: boolean | undefined
  /**
   * The panel manages its own scrolling (a sticky header, a scrolling list).
   * Its root then gets the full height instead of a scroll box.
   */
  fills?: boolean | undefined
}

/**
 * Widths at which a panel steps down. Each panel answers "how do I look when
 * space is limited" (spec §11.H) by branching on the density this gives it.
 *
 * The steps sit low on purpose: a step down *removes* information, so it is
 * the last resort, not the first. `compact` at 360px was taking the turn count
 * off a ring row that had 60px of slack, and `dense` at 220px was taking the
 * name and the score off rows that could still print both.
 */
const COMPACT_BELOW = 300
const DENSE_BELOW = 180

/**
 * The body of a mosaic tile: measures its own box with a `ResizeObserver`
 * and hands the panel a density. Never scrolls horizontally (spec §8).
 */
export function MosaicPanel({ floor, children, corner, padded = true, fills }: MosaicPanelProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const [size, setSize] = useState<PanelBox>({ width: Number.POSITIVE_INFINITY, height: Number.POSITIVE_INFINITY })

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setSize({ width: entry.contentRect.width, height: entry.contentRect.height })
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const measured: PanelDensity = size.width < DENSE_BELOW ? 'dense' : size.width < COMPACT_BELOW ? 'compact' : 'comfortable'
  const density: PanelDensity = floor === 'compact' && measured === 'comfortable' ? 'compact' : measured

  return (
    <div
      ref={box}
      data-panel-density={density}
      className={[
        'relative h-full min-h-0 overflow-x-hidden',
        fills ? 'overflow-y-hidden' : 'overflow-y-auto',
        padded ? (density === 'dense' ? 'p-2' : 'p-3') : '',
      ].join(' ')}
    >
      {corner ? (
        <div className="absolute right-2 top-2 z-10">
          <Text variant="studio-caption" tone="muted">
            {corner}
          </Text>
        </div>
      ) : null}
      {children(density, size)}
    </div>
  )
}
