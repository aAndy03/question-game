import { useState } from 'react'
import { Text } from '@/atoms'
import { DisplayMap, DisplayRow } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useDisplays } from './useDisplays'

export interface DisplaysPanelProps {
  /** The status bar's popover: a shorter map, smaller tiles, no names in the map. */
  compact?: boolean | undefined
}

/**
 * Every connected display, twice over and linked (P21.4 redesign): the
 * **map** — where the OS put them, marked with Stage and Statistics — and the
 * **rows**, one per display in the same left-to-right order, each with a Stage
 * column and a Statistics column that say what is there or offer to put it
 * there. Pointing at either lights the other, which is how "which one is the
 * projector" is answered at seven displays.
 *
 * Settings ▸ Monitors and the status bar's popover both draw this one
 * component, the popover at `compact`, so the two never differ. Every read
 * and every command is `useDisplays`.
 */
export function DisplaysPanel({ compact }: DisplaysPanelProps) {
  const { displays, sendStage, removeStage, moveStage, showStats, setStatsOpen } = useDisplays()
  const [highlighted, setHighlighted] = useState<string | null>(null)
  const nameOf = (d: (typeof displays)[number]) => d.monitor.friendlyName ?? d.monitor.name ?? SETTINGS.monitors.unnamed

  return (
    <div className={['flex min-w-0 flex-col', compact ? 'gap-2' : 'gap-3'].join(' ')} data-displays-panel-body>
      {/* The map earns its room once there are displays to tell apart: in
        * Settings from two, in the popover from three (two rows say it all). */}
      {displays.length > (compact ? 2 : 1) ? (
        <div className={['flex justify-center rounded-[var(--radius)] bg-[var(--surface-secondary)]', compact ? 'p-2' : 'p-4'].join(' ')}>
          <DisplayMap
            displays={displays.map((d) => ({
              key: d.monitor.key,
              name: nameOf(d),
              position: d.monitor.position,
              size: d.monitor.size,
              primary: d.monitor.primary,
              stage: d.stage,
              stats: d.stats === 'here',
            }))}
            maxHeight={compact ? 64 : 136}
            labels={!compact}
            highlighted={highlighted}
            onHighlight={setHighlighted}
            label={SETTINGS.monitors.arrangement(displays.map(nameOf))}
          />
        </div>
      ) : null}
      {/* The headings are what make a row's short words read (P21.5). */}
      <div className="grid grid-cols-[auto_minmax(8rem,1fr)_auto_auto] gap-x-3" data-density="tight">
        <div className="col-span-full grid grid-cols-subgrid px-2" aria-hidden>
          <span />
          <span />
          <Text variant="studio-caption" tone="muted">
            {SETTINGS.monitors.stage}
          </Text>
          <Text variant="studio-caption" tone="muted">
            {SETTINGS.monitors.statistics}
          </Text>
        </div>
        <div role="list" className="col-span-full grid grid-cols-subgrid" data-display-list>
          {displays.map(({ monitor, stage, stats }) => (
            <DisplayRow
              key={monitor.key}
              monitor={monitor}
              stage={stage}
              stats={stats}
              onSendStage={() => sendStage(monitor.key)}
              onMoveStage={moveStage ? () => moveStage(monitor.key) : undefined}
              onRemoveStage={() => removeStage(monitor.key)}
              onShowStats={() => void showStats(monitor.key)}
              onCloseStats={() => setStatsOpen(false)}
              compact={compact}
              highlighted={highlighted === monitor.key}
              onHighlight={(on) => setHighlighted(on ? monitor.key : null)}
            />
          ))}
        </div>
      </div>
      {displays.length === 1 ? (
        <Text variant="studio-caption" tone="muted" className="px-2">
          {SETTINGS.monitors.single}
        </Text>
      ) : null}
    </div>
  )
}
