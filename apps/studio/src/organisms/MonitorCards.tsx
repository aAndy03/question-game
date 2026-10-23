import { MonitorCard } from '@/molecules'
import { useDisplays } from './useDisplays'

export interface MonitorCardsProps {
  className?: string | undefined
}

/**
 * Every connected display as a `MonitorCard`: send Stage there or stop a
 * mirror, show Statistics there or close it — Settings ▸ Monitors' drawing and
 * the status bar's displays popover (P21.3, P21.4), one component so the two
 * never differ.
 */
export function MonitorCards({ className }: MonitorCardsProps) {
  const { displays, sendStage, removeStage, moveStage, showStats, setStatsOpen } = useDisplays()
  const single = displays.length === 1

  return (
    <div className={['flex flex-wrap gap-6', className ?? ''].join(' ')} data-monitor-cards>
      {displays.map(({ monitor, stage, stats }) => (
        <MonitorCard
          key={monitor.key}
          monitor={monitor}
          state={stage}
          onSendStage={() => sendStage(monitor.key)}
          onRemoveStage={() => removeStage(monitor.key)}
          onMoveStage={moveStage ? () => moveStage(monitor.key) : undefined}
          single={single}
          stats={stats}
          onShowStats={() => void showStats(monitor.key)}
          onCloseStats={() => setStatsOpen(false)}
        />
      ))}
    </div>
  )
}
