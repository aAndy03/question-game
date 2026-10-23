import type { MonitorInfo } from '@questiongame/contract'
import type { DisplayStageState, DisplayStatsState } from '@/molecules'
import { useHostCommand } from '@/host/commands'
import { useMonitors, useSettings } from '@/host/queries'
import { useStagePlacement, useStatsWindowOpen } from '@/chrome/windows'

export interface DisplayState {
  readonly monitor: MonitorInfo
  readonly stage: DisplayStageState
  readonly stats: DisplayStatsState
}

/**
 * Every connected display with what stands on it — Stage, a mirror of it, the
 * Statistics window — and the commands that change that (P21.4). Settings ▸
 * Monitors, the status bar's displays strip and its popover all read this, so
 * the three never disagree about where a window is.
 *
 * Nothing here opens a window by itself: Stage is sent and Statistics shown
 * because the operator pressed something (§9, §13.3).
 */
export function useDisplays() {
  const monitors = useMonitors()
  const settings = useSettings()
  const run = useHostCommand()
  const list = monitors.data ?? []
  const placement = useStagePlacement()
  const mirrors = placement.mirrors
  const statsOpen = useStatsWindowOpen()
  const primaryKey = list.find((m) => m.primary)?.key ?? null
  // Where Statistics would open: the pick, or primary without one.
  const statsTarget = settings.data?.control.stats_monitor_id ?? primaryKey
  const statsOn = statsOpen ? statsTarget : null

  /**
   * The Stage state for a display **in `list`**, which is to say a connected
   * one — `monitors_list` reports nothing else.
   *
   * There is deliberately no `remembered` branch here. That state means *the
   * pick, unplugged*, which the Monitors line under the rows reports ("Not
   * connected"); the card that drew it for a display sitting right there
   * told the operator a connected display was missing. A remembered
   * display that Stage simply is not standing on is `free` — it offers *Send
   * Stage here*, which is exactly what the operator wants from it.
   */
  const stageOf = (key: string): DisplayStageState => {
    if (placement.on === key) return 'stage'
    if (mirrors.includes(key)) return 'mirror'
    return 'free'
  }

  // Open here wins over Stage being here, so a window Stage was sent onto can
  // still be closed from its row.
  const statsOf = (key: string, stage: DisplayStageState): DisplayStatsState => {
    if (statsOn === key) return 'here'
    if (stage === 'stage' || stage === 'mirror') return 'blocked'
    return 'free'
  }

  // Left to right, then top to bottom, as they stand (the redesign): the
  // status bar's glyphs, the rows and the map then agree on the order, and the
  // host's own order — enumeration — means nothing to the operator.
  const ordered = [...list].sort((a, b) => a.position[0] - b.position[0] || a.position[1] - b.position[1])
  const displays: DisplayState[] = ordered.map((monitor) => {
    const stage = stageOf(monitor.key)
    return { monitor, stage, stats: statsOf(monitor.key, stage) }
  })

  /**
   * Send Stage to a display.
   *
   * The **first** display is the pacer — the window whose acks advance the
   * overlay queue and the only one that makes a sound. Every one after it is a
   * mirror, so the operator never has to know the word: they send Stage
   * somewhere, and the app works out which kind it is. "First" means *no Stage
   * is standing anywhere yet* — the place, not the pick, or a remembered
   * display that is unplugged would make the next Send a mirror with nothing
   * to mirror.
   */
  const sendStage = (key: string) => {
    void run('stage_open')
    if (placement.on === null && mirrors.length === 0) {
      void run('stage_set_monitor', { monitorId: key })
      return
    }
    void run.ok('stage_add_mirror', { monitorId: key })
  }

  const removeStage = (key: string) => void run.ok('stage_remove_mirror', { monitorId: key })

  /**
   * Move the pacer — always `stage_set_monitor`, never the mirror path: this
   * is the one window that must always exist (§9, P11.11). Offered only while
   * Stage stands on another display.
   */
  const moveStage = placement.on === null ? null : (key: string) => void run('stage_set_monitor', { monitorId: key })

  /**
   * Statistics on this display: remember it there (an open window follows the
   * pick), then show it if it is not up. The host refuses Stage's display.
   */
  const showStats = async (key: string) => {
    if (statsTarget !== key) {
      const ok = await run.ok('settings_set_global', { setting: { key: 'stats_monitor_id', value: key } }, { targetPath: 'stats.monitor_id' })
      if (!ok) return
    }
    if (!statsOpen) void run('stats_window', { open: true })
  }

  const setStatsOpen = (open: boolean) => void run('stats_window', { open })

  return {
    displays,
    loading: monitors.isPending,
    stageOpen: placement.on !== null,
    statsOpen,
    /** The display the pacer stands on, or null with no Stage window. */
    stageOn: placement.on,
    statsOn,
    statsFullscreen: settings.data?.control.stats_fullscreen ?? true,
    sendStage,
    removeStage,
    moveStage,
    showStats,
    setStatsOpen,
    openStage: () => void run('stage_open'),
    setStatsFullscreen: (value: boolean) => void run('settings_set_global', { setting: { key: 'stats_fullscreen', value } }),
  }
}
