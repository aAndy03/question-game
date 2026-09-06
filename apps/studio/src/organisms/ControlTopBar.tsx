import { Button, IconButton, Text } from '@/atoms'
import { DisplayPicker } from '@/molecules'
import { useControlLayoutStore } from '@/chrome/control'
import { useStatsWindowOpen } from '@/chrome/windows'
import { CHROME, CONTROL } from '@/copy'
import { STATS } from '@/copy/stats'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { useMonitors, useSettings } from '@/host/queries'
import { SettingsFloat } from './SettingsFloat'

/** Stage / Statistics display pickers, the settings float, Reset layout (spec §11.H). */
export function ControlTopBar() {
  const monitors = useMonitors()
  const settings = useSettings()
  const run = useHostCommand()
  const resetLayout = useControlLayoutStore((s) => s.resetLayout)
  const list = monitors.data ?? []
  const statsOpen = useStatsWindowOpen()

  return (
    <div className="flex flex-wrap items-center gap-3" data-control-top>
      <div className="flex items-center gap-2">
        <Text variant="studio-caption" tone="muted">
          {CONTROL.stageDisplay}
        </Text>
        <DisplayPicker label={CONTROL.stageDisplay} monitors={list} value={settings.data?.control.stage_monitor_id ?? null} onChange={(monitorId) => void run('stage_set_monitor', { monitorId })} />
        <Button size="sm" variant="ghost" icon="displays" onPress={() => void run('stage_open')}>
          {CONTROL.openStage}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Text variant="studio-caption" tone="muted">
          {CONTROL.statsDisplay}
        </Text>
        <DisplayPicker label={CONTROL.statsDisplay} monitors={list} value={settings.data?.control.stats_monitor_id ?? null} onChange={(value) => void run('settings_set_global', { setting: { key: 'stats_monitor_id', value } })} />
        {/* The picker remembers where; this shows it. Mid-show the operator
          * should be able to put the numbers up and take them down without
          * leaving Control (§13.3). */}
        <Button
          size="sm"
          variant={statsOpen ? 'ghost' : 'secondary'}
          icon="statistics"
          onPress={() => void run('stats_window', { open: !statsOpen })}
        >
          {statsOpen ? STATS.window.close : STATS.window.show}
        </Button>
      </div>
      <div className="flex-1" />
      <IconButton
        icon={settings.data?.control.audio.muted ? 'volumeMuted' : 'volume'}
        label={settings.data?.control.audio.muted ? CHROME.unmute : CHROME.mute}
        size="sm"
        onPress={() => void run('settings_set_global', { setting: { key: 'audio_muted', value: !(settings.data?.control.audio.muted ?? false) } })}
      />
      <IconButton
        icon="layout"
        label={CONTROL.resetLayout}
        size="sm"
        onPress={() => {
          resetLayout()
          toast.info(CONTROL.resetLayout)
        }}
      />
      <SettingsFloat />
    </div>
  )
}
