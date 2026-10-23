import { DisplayTile, type DisplayStageState } from './DisplayTile'

export interface DisplayMapItem {
  readonly key: string
  readonly name: string
  /** Logical pixels, as the OS arranges the desktop. */
  readonly position: readonly [number, number]
  readonly size: readonly [number, number]
  readonly primary: boolean
  readonly stage: DisplayStageState
  readonly stats: boolean
}

export interface DisplayMapProps {
  displays: readonly DisplayMapItem[]
  /** The tallest the map may draw, in px; it shrinks to fit the width. */
  maxHeight: number
  /** Show each display's name inside its tile. */
  labels?: boolean | undefined
  highlighted?: string | null | undefined
  onHighlight?: ((key: string | null) => void) | undefined
  /** The accessible description of the whole picture. */
  label: string
}

/**
 * The displays where the OS put them (P21.4 redesign): each a `DisplayTile`
 * at its desktop position and size, the lot scaled to fit, so "the TV on the
 * left" and "the projector under the laptop" read as they stand in the room —
 * the picture that tells seven displays apart. It is a picture: pointing at a
 * tile lights its row, pointing at a row lights its tile, and every action is
 * on the rows.
 */
export function DisplayMap({ displays, maxHeight, labels, highlighted, onHighlight, label }: DisplayMapProps) {
  if (displays.length === 0) return null
  const minX = Math.min(...displays.map((d) => d.position[0]))
  const minY = Math.min(...displays.map((d) => d.position[1]))
  const maxX = Math.max(...displays.map((d) => d.position[0] + Math.max(1, d.size[0])))
  const maxY = Math.max(...displays.map((d) => d.position[1] + Math.max(1, d.size[1])))
  const bw = Math.max(1, maxX - minX)
  const bh = Math.max(1, maxY - minY)
  const ratio = bw / bh
  const pct = (n: number, of: number) => `${(n / of) * 100}%`

  return (
    <div
      role="img"
      aria-label={label}
      className="relative"
      style={{ width: `min(100%, ${Math.round(maxHeight * ratio)}px)`, aspectRatio: `${bw} / ${bh}` }}
      data-display-map
    >
      {displays.map((d) => (
        <span
          key={d.key}
          className="absolute flex p-[2px]"
          style={{
            left: pct(d.position[0] - minX, bw),
            top: pct(d.position[1] - minY, bh),
            width: pct(Math.max(1, d.size[0]), bw),
            height: pct(Math.max(1, d.size[1]), bh),
          }}
          onPointerEnter={onHighlight ? () => onHighlight(d.key) : undefined}
          onPointerLeave={onHighlight ? () => onHighlight(null) : undefined}
          data-display-map-tile={d.key}
        >
          <DisplayTile
            stage={d.stage}
            stats={d.stats}
            primary={d.primary}
            label={labels ? d.name : undefined}
            highlighted={highlighted === d.key}
          />
        </span>
      ))}
    </div>
  )
}
