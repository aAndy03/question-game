import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Text } from '@/atoms'

export type PanelDensity = 'comfortable' | 'compact' | 'dense'

export interface MosaicPanelProps {
  /** The density floor from the host (`control.mosaic_density`). */
  floor: 'comfortable' | 'compact' | 'spacious'
  /** Render prop: the panel decides its own layout from the density it was given. */
  children: (density: PanelDensity) => ReactNode
  /** Something to pin top-right of the body (a count, a status). */
  corner?: ReactNode
  padded?: boolean | undefined
}

/**
 * Widths at which a panel steps down. Each panel answers "how do I look when
 * space is limited" (spec §11.H) by branching on the density this gives it.
 */
const COMPACT_BELOW = 360
const DENSE_BELOW = 220

/**
 * The body of a mosaic tile: measures its own box with a `ResizeObserver`
 * and hands the panel a density. Never scrolls horizontally (spec §8).
 */
export function MosaicPanel({ floor, children, corner, padded = true }: MosaicPanelProps) {
  const box = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState<number>(Number.POSITIVE_INFINITY)

  useEffect(() => {
    const el = box.current
    if (!el || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const measured: PanelDensity = width < DENSE_BELOW ? 'dense' : width < COMPACT_BELOW ? 'compact' : 'comfortable'
  const density: PanelDensity = floor === 'compact' && measured === 'comfortable' ? 'compact' : measured

  return (
    <div ref={box} data-panel-density={density} className={['relative h-full min-h-0 overflow-y-auto overflow-x-hidden', padded ? (density === 'dense' ? 'p-2' : 'p-3') : ''].join(' ')}>
      {corner ? (
        <div className="absolute right-2 top-2 z-10">
          <Text variant="studio-caption" tone="muted">
            {corner}
          </Text>
        </div>
      ) : null}
      {children(density)}
    </div>
  )
}
