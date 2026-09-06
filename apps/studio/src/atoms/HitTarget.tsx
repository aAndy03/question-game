import { Tooltip } from './Tooltip'

export interface HitTargetProps {
  /** Box in the Viewer's own pixels. */
  x: number
  y: number
  width: number
  height: number
  label: string
  /** `illegal` draws the refused style and does not fire. */
  legality: 'legal' | 'illegal'
  reason?: string | null | undefined
  /** Drawn as already chosen (a selected option, the current domain). */
  isSelected?: boolean | undefined
  onPress: () => void
}

/**
 * A transparent, positioned button over one Stage node in the Viewer
 * (spec §5.7). Lives in Studio's DOM; never in the Stage tree.
 */
export function HitTarget({ x, y, width, height, label, legality, reason, isSelected, onPress }: HitTargetProps) {
  const illegal = legality === 'illegal'
  const button = (
    <button
      type="button"
      aria-label={label}
      aria-disabled={illegal}
      data-hit-target={illegal ? 'illegal' : 'legal'}
      onClick={() => {
        if (!illegal) onPress()
      }}
      className={[
        'absolute rounded-[calc(var(--radius)/2)] border-2 outline-none transition-colors',
        'focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
        illegal
          ? 'cursor-not-allowed border-transparent hover:border-[var(--danger)]/70'
          : isSelected
            ? 'border-[var(--accent)] bg-[var(--accent)]/10'
            : 'border-transparent hover:border-[var(--accent)] hover:bg-[var(--accent)]/10',
      ].join(' ')}
      style={{ left: x, top: y, width, height }}
    />
  )
  return <Tooltip content={illegal && reason ? reason : label}>{button}</Tooltip>
}
