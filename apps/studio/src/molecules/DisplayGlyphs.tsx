import { DisplayTile } from './DisplayTile'

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

/**
 * The connected displays as small screens, left to right as they stand,
 * each marked with what stands on it — the status bar's displays button
 * (P21.4). The same `DisplayTile` the rows and the map draw, at a glance's
 * size; from five displays on they get a little smaller so seven still fit.
 */
export function DisplayGlyphs({ displays }: DisplayGlyphsProps) {
  const h = displays.length > 4 ? 12 : 14
  return (
    <span className="inline-flex items-center gap-1" data-display-glyphs>
      {displays.map((d) => {
        // Proportional, within reason: a portrait panel is narrow, an
        // ultrawide wide, and neither so extreme its mark does not fit.
        const width = Math.round(Math.min(h * 2, Math.max(h * 0.75, h * d.aspect)))
        return (
          <span
            key={d.key}
            className="inline-flex shrink-0"
            style={{ width, height: h }}
            data-display-glyph={d.key}
            data-stage={d.stage ?? undefined}
            data-stats={d.stats || undefined}
          >
            <DisplayTile stage={d.stage ?? 'free'} stats={d.stats} tiny />
          </span>
        )
      })}
    </span>
  )
}
