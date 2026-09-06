import { Button, Text } from '@/atoms'
import { DisplayPicker, MonitorCard, SettingRow, SettingsGroup } from '@/molecules'
import { CONTROL } from '@/copy'
import { SETTINGS } from '@/copy/settings'
import { STATS } from '@/copy/stats'
import { useHostCommand } from '@/host/commands'
import { useMonitors, useSettings } from '@/host/queries'
import { SettingsForm } from './SettingsForm'

/**
 * Settings ▸ Monitors (05_STUDIO_DESIGN.md §12.2.1): every connected display
 * as a `MonitorCard`, where Stage stands and what is remembered, the reattach
 * rule, and the Statistics display row (visible, `feature_off` until P11).
 * Nothing here touches a Play (§9); the host never picks a display.
 */
export function MonitorsSettings() {
  const monitors = useMonitors()
  const settings = useSettings()
  const run = useHostCommand()
  const list = monitors.data ?? []
  const remembered = settings.data?.control.stage_monitor_id ?? null
  const rememberedConnected = remembered !== null && list.some((m) => m.key === remembered)
  const single = list.length === 1
  // §13.3: the Statistics window is a consequence of this pick — the host
  // opens it, moves it and closes it. Stage's display is refused there.
  const stats = settings.data?.control.stats_monitor_id ?? null

  const send = (key: string | null) => {
    void run('stage_open')
    void run('stage_set_monitor', { monitorId: key })
  }

  return (
    <div className="flex flex-col gap-6" data-monitors-settings>
      <SettingsGroup
        title={SETTINGS.monitors.title(list.length)}
        action={
          <Button size="sm" variant="ghost" icon="displays" onPress={() => void run('stage_open')}>
            {CONTROL.openStage}
          </Button>
        }
      >
        <div className="flex flex-wrap gap-6 py-3">
          {list.map((m) => (
            <MonitorCard
              key={m.key}
              monitor={m}
              state={remembered === m.key ? 'stage' : 'free'}
              onSendStage={() => send(m.key)}
              single={single}
            />
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 py-3">
          <Text variant="studio-caption" tone="muted">
            {`${SETTINGS.monitors.standsOn}: ${rememberedConnected ? (list.find((m) => m.key === remembered)?.name ?? remembered) : (list.find((m) => m.primary)?.name ?? SETTINGS.monitors.primary)}`}
          </Text>
          <Text variant="studio-caption" tone={remembered && !rememberedConnected ? 'warning' : 'muted'}>
            {`${SETTINGS.monitors.remembered}: ${remembered ?? SETTINGS.monitors.none}${remembered && !rememberedConnected ? ` (${SETTINGS.monitors.notConnected})` : ''}`}
          </Text>
          {remembered ? (
            <Button size="sm" variant="tertiary" onPress={() => send(null)}>
              {SETTINGS.monitors.primary}
            </Button>
          ) : null}
        </div>
        <SettingRow label={SETTINGS.monitors.statsDisplay} description={STATS.window.displayHint}>
          <DisplayPicker
            label={SETTINGS.monitors.statsDisplay}
            monitors={list}
            value={stats}
            onChange={(value) => void run('settings_set_global', { setting: { key: 'stats_monitor_id', value } }, { targetPath: 'stats.monitor_id' })}
            {...(single ? { isDisabled: true, disabledReason: SETTINGS.monitors.single } : {})}
          />
        </SettingRow>
      </SettingsGroup>
      <SettingsForm groups={['control']} compact />
    </div>
  )
}
