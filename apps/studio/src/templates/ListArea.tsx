import type { ReactNode } from 'react'
import { DetailAside } from './DetailAside'

export interface ListAreaProps {
  /** `ListToolbar`: on its own row, the full width of the area. */
  toolbar?: ReactNode | undefined
  /** The list, filling the remaining height. */
  children: ReactNode
  /** The opened row: beside the list at `xl`, over its right edge below (1.1.1). */
  aside?: ReactNode | undefined
  onCloseAside?: (() => void) | undefined
}

/**
 * Toolbar, then list and aside side by side (P20). The opened row's panel
 * starts **below** the toolbar: on Questions it used to start level with it
 * and take its width, so *Active · Archived · All* wrapped onto a second line
 * and the list jumped every time a row opened or closed — and below 1280px
 * the panel covered the toolbar. Every library tab draws its list here, so
 * the rule holds everywhere. The row is the aside's `relative` parent.
 */
export function ListArea({ toolbar, children, aside, onCloseAside }: ListAreaProps) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {toolbar}
      <div className="relative flex min-h-0 flex-1 gap-6">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
        {aside ? <DetailAside onClose={() => onCloseAside?.()}>{aside}</DetailAside> : null}
      </div>
    </div>
  )
}
