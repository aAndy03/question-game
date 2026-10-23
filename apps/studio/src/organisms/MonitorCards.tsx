import { MonitorCard } from '@/molecules'
import { useHostCommand } from '@/host/commands'
import { useMonitors } from '@/host/queries'
import { useStagePlacement } from '@/chrome/windows'

export interface MonitorCardsProps {
  className?: string | undefined
}

/**
 * Every connected display as a `MonitorCard`, with *Send Stage here* and *Stop
 * Stage here* — Settings ▸ Monitors' drawing, and the status bar's displays
 * popover (P21.3), one component so the two never differ.
 */
export function MonitorCards({ className }: MonitorCardsProps) {
  const monitors = useMonitors()
  const run = useHostCommand()
  const list = monitors.data ?? []
  const single = list.length === 1
  const placement = useStagePlacement()
  const mirrors = placement.mirrors

  /**
   * Send Stage to a display.
   *
   * The **first** display is the pacer — the window whose acks advance the
   * overlay queue and the only one that makes a sound. Every one after it is a
   * mirror, so the operator never has to know the word: they send Stage
   * somewhere, and the app works out which kind it is.
   */
  const send = (key: string) => {
    void run('stage_open')
    // The first display Stage is sent to is the pacer; every one after it is a
    // mirror. "First" means *no Stage is standing anywhere yet* — the place,
    // not the pick, or a remembered display that is unplugged would make the
    // next Send a mirror with nothing to mirror.
    if (placement.on === null && mirrors.length === 0) {
      void run('stage_set_monitor', { monitorId: key })
      return
    }
    void run.ok('stage_add_mirror', { monitorId: key })
  }

  const removeStage = (key: string) => void run.ok('stage_remove_mirror', { monitorId: key })

  /**
   * The card's state for a display **in `list`**, which is to say a connected
   * one — `monitors_list` reports nothing else.
   *
   * There is deliberately no `remembered` branch here. That state means *the
   * pick, unplugged*, and `MonitorCard` draws it as a dashed warning border
   * reading "Not connected"; returning it for a display that is sitting right
   * there told the operator a connected display was missing. A remembered
   * display that Stage simply is not standing on is `free` — it offers *Send
   * Stage here*, which is exactly what the operator wants from it — and the
   * "Remembered:" line below the cards is where the pick is reported.
   */
  const stateOf = (key: string): 'stage' | 'mirror' | 'remembered' | 'free' => {
    if (placement.on === key) return 'stage'
    if (mirrors.includes(key)) return 'mirror'
    return 'free'
  }

  return (
    <div className={['flex flex-wrap gap-6', className ?? ''].join(' ')} data-monitor-cards>
      {list.map((m) => (
        <MonitorCard
          key={m.key}
          monitor={m}
          state={stateOf(m.key)}
          onSendStage={() => send(m.key)}
          onRemoveStage={() => removeStage(m.key)}
          single={single}
        />
      ))}
    </div>
  )
}
