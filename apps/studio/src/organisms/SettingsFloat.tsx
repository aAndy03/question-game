import { Popover, Tabs } from '@heroui/react'
import type { RevealChannel } from '@questiongame/contract'
import { IconButton, NumberField, SelectField, SwitchField, Text } from '@/atoms'
import { SettingRow } from '@/molecules'
import { SettingsForm } from './SettingsForm'
import { CONTROL, RULES } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'
import { useSettings } from '@/host/queries'
import type { Disabled, GameSetting, RevealMode } from '@/host/types'

const CHANNELS: readonly RevealChannel[] = ['question', 'answers', 'outcome', 'leaderboard']

/**
 * Global | Current game (spec §2.5, §11.H). Writes go to `settings_set_global`
 * and `settings_set_current_game`; every row shows the host's own disabled
 * reason, so a frozen game-affecting key is visible but inert, and the host
 * still refuses if a row is ever wrong.
 */
export function SettingsFloat() {
  const settings = useSettings()
  const play = usePlayState()
  const run = useHostCommand()
  const view = settings.data
  const disabledFor = (key: string): Disabled | undefined => view?.disabled.find((d) => d.key === key)
  const setGame = (setting: GameSetting) => void run('settings_set_current_game', { setting })
  const game = view?.currentGame ?? null
  const frozen = view?.gameAffectingFrozen ?? false
  const frozenReason = frozen ? 'Frozen while a Play is open' : null

  return (
    <Popover>
      {/* The button is the trigger. A `Popover.Trigger` wrapper renders its own
        * pressable around the child, which is a second button and a React Aria
        * warning; HeroUI v3 puts the Button directly under `Popover`. */}
      <IconButton icon="settings" label={CONTROL.settings} size="sm" hideTooltip />
      <Popover.Content placement="bottom end" className="w-[30rem] max-w-[90vw]">
        <Popover.Dialog aria-label={CONTROL.settings}>
          <Tabs variant="secondary" defaultSelectedKey={play ? 'game' : 'global'}>
            <Tabs.ListContainer>
              <Tabs.List aria-label={CONTROL.settings}>
                <Tabs.Tab id="global">
                  {CONTROL.settingsGlobal}
                  <Tabs.Indicator />
                </Tabs.Tab>
                <Tabs.Tab id="game">
                  {CONTROL.settingsCurrentGame}
                  <Tabs.Indicator />
                </Tabs.Tab>
              </Tabs.List>
            </Tabs.ListContainer>
            <Tabs.Panel id="global">
              <div className="flex max-h-[60vh] flex-col overflow-y-auto pr-1">
                <SettingsForm groups={['control', 'audio', 'reveal', 'timer']} compact />
              </div>
            </Tabs.Panel>
            <Tabs.Panel id="game">
              {!game ? (
                <Text variant="studio-body" tone="muted">
                  {CONTROL.settingsNoGame}
                </Text>
              ) : (
                <div className="flex max-h-[60vh] flex-col overflow-y-auto">
                  <SettingRow label={RULES.scoringMode} disabled={disabledFor('scoring.mode')}>
                    <SelectField
                      label={RULES.scoringMode}
                      hideLabel
                      value={game.scoring.mode}
                      onChange={(value) => setGame({ key: 'scoring_mode', value })}
                      options={[
                        { value: 'flat', label: RULES.flat },
                        { value: 'difficulty', label: RULES.difficulty },
                        { value: 'lock_speed', label: RULES.lockSpeed },
                      ]}
                      disabledReason={frozenReason}
                    />
                  </SettingRow>
                  <SettingRow label={RULES.partialCredit} disabled={disabledFor('judging.partial_credit')}>
                    <SwitchField label={RULES.partialCredit} hideLabel isSelected={game.judging.partial_credit} onChange={(value) => setGame({ key: 'partial_credit', value })} disabledReason={frozenReason} />
                  </SettingRow>
                  <SettingRow label={RULES.orderMatters} disabled={disabledFor('judging.order_matters')}>
                    <SwitchField label={RULES.orderMatters} hideLabel isSelected={game.judging.order_matters} onChange={(value) => setGame({ key: 'order_matters', value })} disabledReason={frozenReason} />
                  </SettingRow>
                  <SettingRow label={RULES.timerEnabled} disabled={disabledFor('timer.enabled')}>
                    <SelectField
                      label={RULES.timerEnabled}
                      hideLabel
                      value={game.timer.enabled === null ? 'inherit' : game.timer.enabled ? 'on' : 'off'}
                      onChange={(v) => setGame({ key: 'timer_enabled', value: v === 'inherit' ? null : v === 'on' })}
                      options={[
                        { value: 'inherit', label: RULES.inherit },
                        { value: 'on', label: RULES.on },
                        { value: 'off', label: RULES.off },
                      ]}
                      disabledReason={frozenReason}
                    />
                  </SettingRow>
                  <SettingRow label={RULES.timerDuration} disabled={disabledFor('timer.duration_ms')}>
                    <NumberField label={RULES.timerDuration} hideLabel value={game.timer.duration_ms} onChange={(value) => setGame({ key: 'timer_duration_ms', value })} minValue={1000} step={1000} disabledReason={frozenReason} />
                  </SettingRow>
                  <SettingRow label={RULES.reveal} description={RULES.revealHint}>
                    <div className="grid grid-cols-2 gap-2">
                      {CHANNELS.map((channel) => (
                        <SelectField<RevealMode>
                          key={channel}
                          label={RULES.revealChannel[channel]}
                          value={game.reveal[channel]}
                          onChange={(mode) => setGame({ key: 'reveal', value: [channel, mode] })}
                          options={[
                            { value: 'operator', label: RULES.operator },
                            { value: 'auto', label: RULES.auto },
                          ]}
                        />
                      ))}
                    </div>
                  </SettingRow>
                </div>
              )}
            </Tabs.Panel>
          </Tabs>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
