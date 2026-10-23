import { Icon } from '@/atoms'

export interface DisplayGlyph {
  readonly key: string
  /** Width over height of the panel's physical mode. */
  readonly aspect: number
  readonly stage: 'stage' | 'mirror' | null
  readonly stats: boolean
}

export interface DisplayGlyphsProps {
  displays: readonly DisplayGlyph[]
}

const H = 14
const ICON = { width: 9, height: 9 }

/**
 * The connected displays as small screens, in the order the host lists them,
 * each marked with what stands on it — Stage (accent; a lighter frame for a
 * mirror) and the Statistics window (green) — the status bar's displays
 * button (P21.4). The same marks `MonitorCard` draws, at a glance's size.
 */
export function DisplayGlyphs({ displays }: DisplayGlyphsProps) {
  return (
    <span className="inline-flex items-center gap-1" data-display-glyphs>
      {displays.map((d) => {
        const width = Math.round(Math.min(26, Math.max(16, H * d.aspect)))
        const frame =
          d.stage === 'stage'
            ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_22%,transparent)]'
            : d.stage === 'mirror'
              ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)]'
              : d.stats
                ? 'border-[var(--success)]'
                : 'border-[var(--muted)] opacity-70'
        return (
          <span
            key={d.key}
            className={['inline-flex items-center justify-center gap-px rounded-[3px] border-[1.5px]', frame].join(' ')}
            style={{ width, height: H }}
            data-display-glyph={d.key}
            data-stage={d.stage ?? undefined}
            data-stats={d.stats || undefined}
          >
            {d.stage ? <Icon name="displays" size="sm" style={ICON} className="text-[var(--accent)]" /> : null}
            {d.stats ? <Icon name="statistics" size="sm" style={ICON} className="text-[var(--success)]" /> : null}
          </span>
        )
      })}
    </span>
  )
}
