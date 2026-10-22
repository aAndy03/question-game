export interface MeterBarProps {
  value: number
  max: number
  /** The accessible name — on a tile, the tile's own label. */
  label: string
  tone?: 'accent' | 'success' | 'warning' | 'danger' | undefined
  className?: string | undefined
}

const FILL = {
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

/**
 * A thin bar for "how much of": questions asked of the board, accuracy of
 * 100 (P20). HeroUI's `Meter` draws the same track, but it lays out a label
 * and an output beside it and divides by `max` itself — so a board of zero
 * questions would be `NaN`. A tile already says the number; this is only the
 * picture of it, with the ARIA a meter carries.
 *
 * Never overflows: the fill is clamped to the track, and `max <= 0` is empty.
 */
export function MeterBar({ value, max, label, tone = 'accent', className }: MeterBarProps) {
  const top = max > 0 ? max : 0
  const now = Math.min(Math.max(value, 0), top)
  const percent = top > 0 ? (now / top) * 100 : 0
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={top}
      aria-valuenow={now}
      className={['relative h-1.5 w-full overflow-hidden rounded-sm bg-[var(--default)]', className].filter(Boolean).join(' ')}
    >
      <div
        data-meter-fill
        className="absolute inset-y-0 start-0 rounded-sm transition-[width] duration-300 motion-reduce:transition-none"
        style={{ width: `${percent}%`, background: FILL[tone] }}
      />
    </div>
  )
}
