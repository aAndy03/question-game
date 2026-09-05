export interface SwatchProps {
  /** A CSS colour or a `var(--…)` token. */
  color: string
  size?: 'sm' | 'md' | 'lg'
  className?: string | undefined
}

const PX = { sm: 12, md: 16, lg: 24 }

/** A colour preview. Bordered so a white mark is still visible on white. */
export function Swatch({ color, size = 'md', className }: SwatchProps) {
  return (
    <span
      aria-hidden
      className={['inline-block shrink-0 rounded-[calc(var(--radius)/3)] border border-border', className]
        .filter(Boolean)
        .join(' ')}
      style={{ width: PX[size], height: PX[size], background: color }}
    />
  )
}
