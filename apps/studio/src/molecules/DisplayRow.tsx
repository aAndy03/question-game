import type { MonitorInfo } from '@questiongame/contract'
import { Button, MeaningChip, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'
import { STATS } from '@/copy/stats'
import { DisplayTile, type DisplayStageState, type DisplayStatsState } from './DisplayTile'

export interface DisplayRowProps {
  monitor: MonitorInfo
  stage: DisplayStageState
  stats: DisplayStatsState
  onSendStage: () => void
  /** Move the pacer here; given only while it stands on another display. */
  onMoveStage?: (() => void) | undefined
  /** Stop mirroring here. Never offered for the pacer — that one moves. */
  onRemoveStage: () => void
  onShowStats: () => void
  onCloseStats: () => void
  /** The status bar's popover: a smaller tile, the same row. */
  compact?: boolean | undefined
  highlighted?: boolean | undefined
  onHighlight?: ((on: boolean) => void) | undefined
}

/** The tile's box: every row's tile is centred in the same one, so names line up. */
const BOX = { regular: [56, 32], compact: [40, 22] } as const

/**
 * One display as one row (P21.4 redesign) — the tile, its name and mode, then
 * two columns the list lines up: **Stage** and **Statistics**. Each column
 * says what is on this display or offers to put it there, so the whole list
 * reads as "where each window goes". Drawn by Settings ▸ Monitors and the
 * status bar's popover alike (`DisplaysList`). Nothing here touches a Play
 * (§9), and the pacer's row offers no Remove: it is moved from another row, so
 * the operator cannot end up with no Stage at all (P11.11).
 *
 * A child of a `grid-cols-subgrid` list: it renders its four cells and the
 * list decides the columns.
 */
export function DisplayRow({ monitor, stage, stats, onSendStage, onMoveStage, onRemoveStage, onShowStats, onCloseStats, compact, highlighted, onHighlight }: DisplayRowProps) {
  // The *physical* mode, not the logical size: a 1080p TV at 150% is a 1080p
  // TV (§12.2.1, P11.6); the scaling is shown beside it, because that is where
  // the difference between the two numbers lives.
  const [w, h] = monitor.physicalSize
  const aspect = w > 0 && h > 0 ? w / h : 16 / 9
  const [boxW, boxH] = compact ? BOX.compact : BOX.regular
  const tileW = aspect > boxW / boxH ? boxW : Math.round(boxH * aspect)
  const tileH = aspect > boxW / boxH ? Math.round(boxW / aspect) : boxH
  const name = monitor.friendlyName ?? monitor.name ?? SETTINGS.monitors.unnamed
  const mode = [SETTINGS.monitors.resolution(w, h), monitor.scaleFactor !== 1 ? SETTINGS.monitors.scaling(monitor.scaleFactor) : null].filter(
    (part): part is string => part !== null,
  )

  return (
    <div
      role="listitem"
      aria-label={name}
      className={[
        'col-span-full grid grid-cols-subgrid items-center rounded-[calc(var(--radius)*0.75)] px-2',
        compact ? 'py-1' : 'py-1.5',
        highlighted ? 'bg-[color-mix(in_oklab,var(--foreground)_4%,transparent)]' : '',
      ].join(' ')}
      onPointerEnter={onHighlight ? () => onHighlight(true) : undefined}
      onPointerLeave={onHighlight ? () => onHighlight(false) : undefined}
      // Focus lights the row as the pointer does, so a keyboard walk through
      // the buttons shows which tile on the map it is acting on.
      onFocus={onHighlight ? () => onHighlight(true) : undefined}
      onBlur={onHighlight ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onHighlight(false) } : undefined}
      data-display-row={monitor.key}
      data-stage={stage}
      data-stats-state={stats}
    >
      <span className="flex items-center justify-center" style={{ width: boxW, height: boxH }}>
        <span className="flex" style={{ width: tileW, height: tileH }}>
          <DisplayTile stage={stage} stats={stats === 'here'} primary={monitor.primary} highlighted={highlighted} />
        </span>
      </span>

      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 items-center gap-1.5">
          <Text variant="studio-label" truncate className="min-w-0">
            {name}
          </Text>
          {monitor.primary ? <MeaningChip meaning="primary">{SETTINGS.monitors.primary}</MeaningChip> : null}
        </span>
        {/* Each part whole: a squeezed row breaks between them, never inside. */}
        <span className="flex flex-wrap gap-x-2">
          {mode.map((part) => (
            <Text key={part} variant="studio-mono" tone="muted" tabular className="whitespace-nowrap">
              {part}
            </Text>
          ))}
        </span>
        {monitor.alsoOn.length > 0 ? (
          <span className="max-w-[22rem]" data-monitor-also-on>
            <Text variant="studio-caption" tone="muted">
              {SETTINGS.monitors.alsoOn(monitor.alsoOn)}
            </Text>
          </span>
        ) : null}
      </div>

      {/* Stage. Send on a free display (the first is the pacer, the rest
        * mirror — the operator never needs the word); Move beside it while
        * the pacer stands elsewhere; Remove on a mirror; the pacer itself is
        * only marked. */}
      {/* Both cells hold the room their widest state needs (Send + Move;
        * the chip + Close), so a press never reflows the list or makes the
        * popover jump under the pointer. One pattern in both (P21.5): a chip
        * for what is there, short words under the column's heading for what
        * can be done — full names to a screen reader — no icons, quiet until
        * the row is lit (seven rows of filled buttons read as a wall). */}
      <div className="flex min-w-[7.5rem] items-center gap-1" data-display-stage-cell>
        {stage === 'stage' ? <MeaningChip meaning="stage">{SETTINGS.monitors.showing}</MeaningChip> : null}
        {stage === 'mirror' ? (
          <>
            <MeaningChip meaning="stage">{SETTINGS.monitors.mirror}</MeaningChip>
            <Button size="sm" variant="ghost" label={SETTINGS.monitors.removeStage} onPress={onRemoveStage}>
              {SETTINGS.monitors.remove}
            </Button>
          </>
        ) : null}
        {stage === 'free' ? (
          <>
            <Button size="sm" variant={highlighted ? 'secondary' : 'ghost'} label={SETTINGS.monitors.sendStage} onPress={onSendStage}>
              {SETTINGS.monitors.send}
            </Button>
            {onMoveStage ? (
              <Button size="sm" variant="ghost" label={SETTINGS.monitors.moveStage} onPress={onMoveStage}>
                {SETTINGS.monitors.move}
              </Button>
            ) : null}
          </>
        ) : null}
      </div>

      {/* Statistics: shown here, or offered — never on the display Stage
        * stands on (§13.3), where the cell stays empty. */}
      <div className="flex min-w-[7.5rem] items-center gap-1" data-display-stats-cell>
        {stats === 'here' ? (
          <>
            <MeaningChip meaning="statistics">{SETTINGS.monitors.showing}</MeaningChip>
            <Button size="sm" variant="ghost" label={STATS.window.close} onPress={onCloseStats}>
              {SETTINGS.monitors.close}
            </Button>
          </>
        ) : null}
        {stats === 'free' ? (
          <Button size="sm" variant={highlighted ? 'secondary' : 'ghost'} label={SETTINGS.monitors.showStatsHere} onPress={onShowStats}>
            {SETTINGS.monitors.show}
          </Button>
        ) : null}
      </div>
    </div>
  )
}
