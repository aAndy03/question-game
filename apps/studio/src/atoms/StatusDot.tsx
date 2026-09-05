export type DotTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

const COLOR: Record<DotTone, string> = {
  neutral: 'var(--muted)',
  accent: 'var(--accent)',
  success: 'var(--success)',
  warning: 'var(--warning)',
  danger: 'var(--danger)',
}

export interface StatusDotProps {
  tone: DotTone
  /** Only for `playing`: a status that is moving. */
  pulse?: boolean | undefined
  size?: 'sm' | 'md'
  label?: string | undefined
  className?: string | undefined
}

/** The one place a status is a colour (05_STUDIO_DESIGN.md §2.1). */
export function StatusDot({ tone, pulse, size = 'sm', label, className }: StatusDotProps) {
  const px = size === 'sm' ? 8 : 10
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={['relative inline-flex shrink-0', className].filter(Boolean).join(' ')}
      style={{ width: px, height: px }}
    >
      {pulse ? (
        <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: COLOR[tone] }} />
      ) : null}
      <span className="relative inline-block h-full w-full rounded-full" style={{ background: COLOR[tone] }} />
    </span>
  )
}
