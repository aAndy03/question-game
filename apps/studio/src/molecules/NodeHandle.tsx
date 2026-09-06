import { useRef } from 'react'
import { Text } from '@/atoms'

export interface NodeHandleProps {
  id: string
  /** Box in canvas pixels. */
  x: number
  y: number
  width: number
  height: number
  isSelected: boolean
  isOverridden: boolean
  /** Canvas px per frame px, to turn a drag into a frame offset. */
  scale: number
  onSelect: () => void
  /** Called on release with the drag in frame px. */
  onNudge: (dx: number, dy: number) => void
}

/**
 * A node on the Screens canvas: a faint outline on hover, the selected box
 * with its id, drag to nudge. Lives in Studio's DOM over the iframe and is
 * never part of the saved layout (spec §17).
 */
export function NodeHandle({ id, x, y, width, height, isSelected, isOverridden, scale, onSelect, onNudge }: NodeHandleProps) {
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={id}
      aria-pressed={isSelected}
      data-node-handle={isSelected ? 'selected' : isOverridden ? 'overridden' : 'rest'}
      onPointerDown={(e) => {
        e.preventDefault()
        ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
        drag.current = { x: e.clientX, y: e.clientY, moved: false }
        onSelect()
      }}
      onPointerMove={(e) => {
        if (drag.current && (Math.abs(e.clientX - drag.current.x) > 2 || Math.abs(e.clientY - drag.current.y) > 2)) drag.current.moved = true
      }}
      onPointerUp={(e) => {
        const d = drag.current
        drag.current = null
        if (!d || !d.moved || scale <= 0) return
        onNudge(Math.round((e.clientX - d.x) / scale), Math.round((e.clientY - d.y) / scale))
      }}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 10 : 1
        if (e.key === 'ArrowLeft') onNudge(-step, 0)
        if (e.key === 'ArrowRight') onNudge(step, 0)
        if (e.key === 'ArrowUp') onNudge(0, -step)
        if (e.key === 'ArrowDown') onNudge(0, step)
        if (e.key === 'Enter' || e.key === ' ') onSelect()
        if (e.key.startsWith('Arrow') || e.key === ' ') e.preventDefault()
      }}
      className={[
        'absolute cursor-move rounded-[2px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
        isSelected
          ? 'border-2 border-[var(--accent)] bg-[var(--accent)]/10'
          : isOverridden
            ? 'border border-dashed border-[var(--accent)]/70 hover:bg-[var(--accent)]/10'
            : 'border border-transparent hover:border-[var(--accent)]/60 hover:bg-[var(--accent)]/5',
      ].join(' ')}
      style={{ left: x, top: y, width, height }}
    >
      {isSelected ? (
        <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1" style={{ background: 'var(--accent)', color: 'var(--accent-foreground)' }}>
          <Text variant="studio-mono" tone="inherit">
            {id}
          </Text>
        </span>
      ) : null}
    </div>
  )
}
