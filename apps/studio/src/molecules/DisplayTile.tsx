import { Icon, Text } from '@/atoms'

/**
 * Stage on a display (§9, P11.11): `stage` — the pacer stands here, the window
 * whose acks advance the overlay queue and the only one that makes a sound;
 * `mirror` — the same picture on another display; `free` — neither.
 */
export type DisplayStageState = 'stage' | 'mirror' | 'free'

/**
 * The Statistics window on a display (§13.3, P21.4): `here` — it is open on
 * it; `free` — it can be shown here; `blocked` — Stage stands here, and the two
 * never share a display.
 */
export type DisplayStatsState = 'here' | 'free' | 'blocked'

export interface DisplayTileProps {
  stage: DisplayStageState
  /** The Statistics window is open on this display. */
  stats: boolean
  /** Draws the taskbar line along the bottom edge. */
  primary?: boolean | undefined
  /** The display's name, written inside the tile (the arrangement map). */
  label?: string | undefined
  /** Linked to the row or tile the pointer is on. */
  highlighted?: boolean | undefined
  /** The status bar's size: no taskbar, smaller marks, a stronger frame. */
  tiny?: boolean | undefined
}

const MARK_TINY = { width: 9, height: 9 }
const MARK = { width: 12, height: 12 }

/**
 * One display drawn as a small screen that fills its box, marked with what
 * stands on it — Stage (accent; a lighter frame for a mirror) and the
 * Statistics window (green). The one drawing the status bar's glyphs, the
 * rows and the arrangement map all use, so a display looks the same wherever
 * it is (P21.4). The caller sizes and proportions the box.
 */
export function DisplayTile({ stage, stats, primary, label, highlighted, tiny }: DisplayTileProps) {
  const frame =
    stage === 'stage'
      ? 'border-[var(--accent)] bg-[color-mix(in_oklab,var(--accent)_20%,var(--surface))]'
      : stage === 'mirror'
        ? 'border-[color-mix(in_oklab,var(--accent)_60%,transparent)] bg-[color-mix(in_oklab,var(--accent)_8%,var(--surface))]'
        : stats
          ? 'border-[var(--success)] bg-[color-mix(in_oklab,var(--success)_10%,var(--surface))]'
          : tiny
            ? 'border-[var(--muted)] opacity-70'
            : 'border-[color-mix(in_oklab,var(--muted)_45%,transparent)] bg-[var(--surface-secondary)]'
  const mark = tiny ? MARK_TINY : MARK
  const onAir = stage !== 'free'
  return (
    <span
      className={[
        'relative flex size-full min-w-0 items-center justify-center gap-1 overflow-hidden',
        tiny ? 'rounded-[3px] border-[1.5px]' : 'rounded-[5px] border-[1.5px] px-1',
        frame,
        highlighted ? 'ring-2 ring-[var(--focus)] ring-offset-1 ring-offset-[var(--surface)]' : '',
        'transition-shadow',
      ].join(' ')}
      data-display-tile={stage}
      data-stats={stats || undefined}
    >
      {onAir || stats ? (
        <span className="flex shrink-0 items-center gap-px">
          {onAir ? <Icon name="displays" size="sm" style={mark} className="text-[var(--accent)]" /> : null}
          {stats ? <Icon name="statistics" size="sm" style={mark} className="text-[var(--success)]" /> : null}
        </span>
      ) : null}
      {label ? (
        <Text variant="studio-caption" truncate className="min-w-0">
          {label}
        </Text>
      ) : null}
      {primary && !tiny ? (
        <span aria-hidden className="absolute inset-x-0 bottom-0 h-[3px] bg-[color-mix(in_oklab,var(--muted)_55%,transparent)]" />
      ) : null}
    </span>
  )
}
