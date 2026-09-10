import { Button, SwitchField, Text } from '@/atoms'
import { DisplayPicker, MonitorCard, SettingRow, SettingsGroup } from '@/molecules'
import { CONTROL } from '@/copy'
import { SETTINGS } from '@/copy/settings'
import { STATS } from '@/copy/stats'
import { useHostCommand } from '@/host/commands'
import { useMonitors, useSettings } from '@/host/queries'
import { useStatsWindowOpen } from '@/chrome/windows'
import { SettingsForm } from './SettingsForm'

/**
 * Settings ▸ Monitors (05_STUDIO_DESIGN.md §12.2.1): every connected display
 * as a `MonitorCard`, where Stage stands and what is remembered, the reattach
 * rule, and the Statistics window's own group (§13.3).
 *
 * Nothing here touches a Play (§9), and nothing here opens a window by itself:
 * Stage is sent, Statistics is shown, both because the operator said so. The
 * display pickers only remember *where*.
 */
export function MonitorsSettings() {
  const monitors = useMonitors()
  const settings = useSettings()
  const run = useHostCommand()
  const list = monitors.data ?? []
  const remembered = settings.data?.control.stage_monitor_id ?? null
  const rememberedConnected = remembered !== null && list.some((m) => m.key === remembered)
  const single = list.length === 1
  // §13.3: the pick is where Statistics *would* go. Showing it is the button
  // below, and closing it means closed — a display coming back never re-opens
  // it. Stage's display is refused here.
  const stats = settings.data?.control.stats_monitor_id ?? null
  const statsFullscreen = settings.data?.control.stats_fullscreen ?? true
  const statsOpen = useStatsWindowOpen()
  const statsOnStage = stats !== null && stats === remembered

  // The displays mirroring the pacer (§9, P11.11). Two audience screens and no
  // HDMI splitter, so the app is one.
  const mirrors = settings.data?.control.stage_mirror_ids ?? []

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
    if (remembered === null) {
      void run('stage_set_monitor', { monitorId: key })
      return
    }
    void run.ok('stage_add_mirror', { monitorId: key })
  }

  const removeStage = (key: string) => void run.ok('stage_remove_mirror', { monitorId: key })

  const stateOf = (key: string): 'stage' | 'mirror' | 'remembered' | 'free' => {
    if (remembered === key) return 'stage'
    if (mirrors.includes(key)) return 'mirror'
    return 'free'
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
              state={stateOf(m.key)}
              onSendStage={() => send(m.key)}
              onRemoveStage={() => removeStage(m.key)}
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
            // Parks the **pacer** on primary. Always `stage_set_monitor`, never
            // the mirror path: this button moves the one window that must
            // always exist (§9, P11.11).
            <Button size="sm" variant="tertiary" onPress={() => void run('stage_set_monitor', { monitorId: null })}>
              {SETTINGS.monitors.primary}
            </Button>
          ) : null}
        </div>
      </SettingsGroup>

      <SettingsGroup
        title={STATS.window.title}
        description={STATS.window.groupHint}
        action={
          <Button
            size="sm"
            variant={statsOpen ? 'ghost' : 'secondary'}
            icon="statistics"
            onPress={() => void run('stats_window', { open: !statsOpen })}
          >
            {statsOpen ? STATS.window.close : STATS.window.show}
          </Button>
        }
      >
        <SettingRow label={SETTINGS.monitors.statsDisplay} description={STATS.window.displayHint}>
          <DisplayPicker
            label={SETTINGS.monitors.statsDisplay}
            monitors={list}
            value={stats}
            onChange={(value) => void run('settings_set_global', { setting: { key: 'stats_monitor_id', value } }, { targetPath: 'stats.monitor_id' })}
            {...(statsOnStage ? { disabledReason: STATS.window.sameAsStage } : {})}
          />
        </SettingRow>
        <SettingRow label={STATS.window.fullscreen} description={STATS.window.fullscreenHint}>
          <SwitchField
            label={STATS.window.fullscreen}
            hideLabel
            isSelected={statsFullscreen}
            onChange={(value) => void run('settings_set_global', { setting: { key: 'stats_fullscreen', value } })}
          />
        </SettingRow>
        <SettingRow label={STATS.window.state} description={STATS.window.stateHint}>
          <Text variant="studio-body" tone={statsOpen ? 'default' : 'muted'}>
            {statsOpen ? STATS.window.openNow : STATS.window.closedNow}
          </Text>
        </SettingRow>
      </SettingsGroup>
      <SettingsForm groups={['control']} compact />
    </div>
  )
}
