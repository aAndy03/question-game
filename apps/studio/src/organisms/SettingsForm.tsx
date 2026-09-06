import { Fragment, useRef, useState } from 'react'
import { CUE_KEYS, DEFAULT_AUDIO, type CueKey } from '@questiongame/contract'
import { DurationField, NumberField, OptionalNumberField, SegmentedField, SelectField, SliderField, SwitchField, Text } from '@/atoms'
import { CueMapRow, DifficultyMapField, InlineNotice, SettingRow, SettingsGroup, disabledReasonText } from '@/molecules'
import { FIELD } from '@/copy'
import { SETTINGS, SETTINGS_GROUPS, type SettingsGroupId } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { useSettings } from '@/host/queries'
import type {
  Disabled,
  GameSetting,
  GlobalSetting,
  MosaicDensity,
  OverrideAfterLock,
  RevealChannel,
  RevealMode,
  StageReattach,
} from '@/host/types'
import { DataActions } from './DataActions'
import { LibraryActions } from './LibraryActions'

export interface SettingsFormProps {
  /** Which groups to render, in `SETTINGS_GROUPS` order. Default: all. */
  groups?: readonly SettingsGroupId[] | undefined
  /** The Control float: no banner, tighter rows. */
  compact?: boolean | undefined
}

const CHANNELS: readonly RevealChannel[] = ['question', 'answers', 'outcome', 'leaderboard']

/** The bundled pack's files, offered on every cue row (v1 has no other pack). */
const PACK_FILES: readonly string[] = [...new Set(Object.values(DEFAULT_AUDIO.cues).filter((f): f is string => f !== null))].sort()

/**
 * The global document as grouped `SettingRow`s (05_STUDIO_DESIGN.md §12.2.2).
 * One table (`SETTINGS_GROUPS`), three surfaces: this tab, the Control float's
 * Global tab and the first-run Defaults step. Every write is one
 * `settings_set_global`; every row shows the host's own disabled reason.
 */
export function SettingsForm({ groups, compact }: SettingsFormProps) {
  const settings = useSettings()
  const run = useHostCommand()
  const view = settings.data
  const wanted = new Set<SettingsGroupId>(groups ?? SETTINGS_GROUPS.map((g) => g.id))

  const disabledFor = (key: string): Disabled | undefined => view?.disabled.find((d) => d.key === key)
  const reason = (key: string) => disabledReasonText(disabledFor(key))
  const setGlobal = (setting: GlobalSetting) => void run('settings_set_global', { setting })
  const setGame = (setting: GameSetting) => setGlobal({ key: 'game', value: setting })

  if (!view) return null
  const g = view.globals
  const defaults = g.game_defaults
  const control = view.control
  const exclusive = defaults.scoring.mode === 'lock_speed'
  const flatBase = defaults.scoring.mode === 'flat' || (exclusive && defaults.scoring.lock_speed_base === 'flat')
  const difficultyBase = defaults.scoring.mode === 'difficulty' || (exclusive && defaults.scoring.lock_speed_base === 'difficulty')
  const weightInert = !exclusive && !defaults.scoring.lock_speed_enabled ? FIELD.inert(SETTINGS.rows['scoring.lock_speed.enabled'].label) : null
  const row = (key: keyof typeof SETTINGS.rows) => SETTINGS.rows[key]

  const render = (id: SettingsGroupId) => {
    const meta = SETTINGS_GROUPS.find((x) => x.id === id)
    if (!meta) return null
    // No `key` in here: React reads a spread key as a prop and warns. The key
    // belongs on the element the caller maps, which is where `render` is used.
    const props = { id: `settings-${id}`, title: meta.title, description: compact ? undefined : meta.description }
    switch (id) {
      case 'award':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('scoring.mode').label} description={row('scoring.mode').description} disabled={disabledFor('scoring.mode')}>
              <SegmentedField
                label={row('scoring.mode').label}
                hideLabel
                value={defaults.scoring.mode}
                onChange={(value) => setGame({ key: 'scoring_mode', value })}
                options={[
                  { value: 'flat', label: SETTINGS.scoringMode.flat },
                  { value: 'difficulty', label: SETTINGS.scoringMode.difficulty },
                  { value: 'lock_speed', label: SETTINGS.scoringMode.lock_speed },
                ]}
                disabledReason={reason('scoring.mode')}
              />
            </SettingRow>
            {flatBase ? (
              <SettingRow label={row('scoring.flat_points').label} description={row('scoring.flat_points').description} nested disabled={disabledFor('scoring.flat_points')}>
                <NumberField label={row('scoring.flat_points').label} hideLabel value={defaults.scoring.flat_points} onChange={(v) => setGame({ key: 'flat_points', value: v ?? 0 })} minValue={0} disabledReason={reason('scoring.flat_points')} />
              </SettingRow>
            ) : null}
            {difficultyBase ? (
              <SettingRow label={row('scoring.difficulty_map').label} description={row('scoring.difficulty_map').description} nested disabled={disabledFor('scoring.difficulty_map')}>
                <DifficultyMapField value={defaults.scoring.difficulty_map} onChange={(value) => setGame({ key: 'difficulty_map', value })} disabledReason={reason('scoring.difficulty_map')} />
              </SettingRow>
            ) : null}
            {exclusive ? (
              <SettingRow label={row('scoring.lock_speed_base').label} description={row('scoring.lock_speed_base').description} nested disabled={disabledFor('scoring.lock_speed_base')}>
                <SegmentedField
                  label={row('scoring.lock_speed_base').label}
                  hideLabel
                  value={defaults.scoring.lock_speed_base}
                  onChange={(value) => setGame({ key: 'lock_speed_base', value })}
                  options={[
                    { value: 'flat', label: SETTINGS.lockSpeedBase.flat },
                    { value: 'difficulty', label: SETTINGS.lockSpeedBase.difficulty },
                  ]}
                  disabledReason={reason('scoring.lock_speed_base')}
                />
              </SettingRow>
            ) : (
              <SettingRow label={row('scoring.lock_speed.enabled').label} description={row('scoring.lock_speed.enabled').description} nested disabled={disabledFor('scoring.lock_speed.enabled')}>
                <SwitchField label={row('scoring.lock_speed.enabled').label} hideLabel isSelected={defaults.scoring.lock_speed_enabled} onChange={(value) => setGame({ key: 'lock_speed_enabled', value })} disabledReason={reason('scoring.lock_speed.enabled')} />
              </SettingRow>
            )}
            <SettingRow label={row('scoring.speed_weight').label} description={row('scoring.speed_weight').description} nested disabled={disabledFor('scoring.speed_weight')}>
              <SliderField
                label={row('scoring.speed_weight').label}
                hideLabel
                value={defaults.scoring.speed_weight}
                onChange={() => {}}
                onChangeEnd={(value) => setGame({ key: 'speed_weight', value })}
                minValue={0}
                maxValue={2}
                step={0.05}
                disabledReason={reason('scoring.speed_weight') ?? weightInert}
              />
            </SettingRow>
          </SettingsGroup>
        )
      case 'turn':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('turn.max_consecutive_correct').label} description={row('turn.max_consecutive_correct').description} disabled={disabledFor('turn.max_consecutive_correct')}>
              <OptionalNumberField label={row('turn.max_consecutive_correct').label} hideLabel value={defaults.turn.max_consecutive_correct} onChange={(value) => setGame({ key: 'max_consecutive_correct', value })} min={1} disabledReason={reason('turn.max_consecutive_correct')} />
            </SettingRow>
            <SettingRow label={row('turn.bonus_after_consecutive').label} description={row('turn.bonus_after_consecutive').description} nested disabled={disabledFor('turn.bonus_after_consecutive')}>
              <div className="flex flex-wrap items-end gap-2">
                <OptionalNumberField
                  label={SETTINGS.bonus.count}
                  value={defaults.turn.bonus_after_consecutive?.count ?? null}
                  onChange={(count) => setGame({ key: 'bonus_after_consecutive', value: count === null ? null : { count, award: defaults.turn.bonus_after_consecutive?.award ?? 100 } })}
                  min={1}
                  disabledReason={reason('turn.bonus_after_consecutive')}
                />
                {defaults.turn.bonus_after_consecutive ? (
                  <NumberField
                    label={SETTINGS.bonus.award}
                    value={defaults.turn.bonus_after_consecutive.award}
                    onChange={(award) => setGame({ key: 'bonus_after_consecutive', value: { count: defaults.turn.bonus_after_consecutive?.count ?? 1, award: award ?? 0 } })}
                    minValue={0}
                    disabledReason={reason('turn.bonus_after_consecutive')}
                  />
                ) : null}
              </div>
            </SettingRow>
          </SettingsGroup>
        )
      case 'judging':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('judging.partial_credit').label} description={row('judging.partial_credit').description} disabled={disabledFor('judging.partial_credit')}>
              <SwitchField label={row('judging.partial_credit').label} hideLabel isSelected={defaults.judging.partial_credit} onChange={(value) => setGame({ key: 'partial_credit', value })} disabledReason={reason('judging.partial_credit')} />
            </SettingRow>
            <SettingRow label={row('judging.order_matters').label} description={row('judging.order_matters').description} disabled={disabledFor('judging.order_matters')}>
              <SwitchField label={row('judging.order_matters').label} hideLabel isSelected={defaults.judging.order_matters} onChange={(value) => setGame({ key: 'order_matters', value })} disabledReason={reason('judging.order_matters')} />
            </SettingRow>
          </SettingsGroup>
        )
      case 'timer':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('globals.timer.enabled').label} description={row('globals.timer.enabled').description} disabled={disabledFor('globals.timer.enabled')}>
              <SwitchField label={row('globals.timer.enabled').label} hideLabel isSelected={g.timer.enabled ?? true} onChange={(value) => setGlobal({ key: 'timer_enabled', value })} disabledReason={reason('globals.timer.enabled')} />
            </SettingRow>
            <SettingRow label={row('globals.timer.duration_ms').label} description={row('globals.timer.duration_ms').description} nested disabled={disabledFor('globals.timer.duration_ms')}>
              <DurationField label={row('globals.timer.duration_ms').label} hideLabel value={g.timer.duration_ms} onChange={(ms) => ms !== null && setGlobal({ key: 'timer_duration_ms', value: ms })} disabledReason={reason('globals.timer.duration_ms') ?? (g.timer.enabled === false ? FIELD.inert(row('globals.timer.enabled').label) : null)} />
            </SettingRow>
          </SettingsGroup>
        )
      case 'reveal':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('reveal').label} description={row('reveal').description}>
              <div className="grid grid-cols-2 gap-3">
                {CHANNELS.map((channel) => (
                  <SegmentedField<RevealMode>
                    key={channel}
                    label={SETTINGS.revealChannel[channel]}
                    value={control.reveal[channel]}
                    onChange={(mode) => setGlobal({ key: 'reveal', value: [channel, mode] })}
                    options={[
                      { value: 'operator', label: SETTINGS.revealMode.operator },
                      { value: 'auto', label: SETTINGS.revealMode.auto },
                    ]}
                    disabledReason={reason(`reveal.${channel}`)}
                  />
                ))}
              </div>
            </SettingRow>
          </SettingsGroup>
        )
      case 'control':
        return (
          <SettingsGroup {...props}>
            <SettingRow label={row('override.after_lock').label} description={row('override.after_lock').description} disabled={disabledFor('override.after_lock')}>
              <SelectField<OverrideAfterLock>
                label={row('override.after_lock').label}
                hideLabel
                value={control.override_after_lock}
                onChange={(value) => setGlobal({ key: 'override_after_lock', value })}
                options={[
                  { value: 'refuse_until_reveal', label: SETTINGS.overrideAfterLock.refuse_until_reveal },
                  { value: 'allow', label: SETTINGS.overrideAfterLock.allow },
                ]}
                disabledReason={reason('override.after_lock')}
              />
            </SettingRow>
            <SettingRow label={row('overlay_animations.enabled').label} description={row('overlay_animations.enabled').description} disabled={disabledFor('overlay_animations.enabled')}>
              <SwitchField label={row('overlay_animations.enabled').label} hideLabel isSelected={control.overlay_animations_enabled} onChange={(value) => setGlobal({ key: 'overlay_animations_enabled', value })} disabledReason={reason('overlay_animations.enabled')} />
            </SettingRow>
            <SettingRow label={row('viewer.hit_targets').label} description={row('viewer.hit_targets').description} disabled={disabledFor('viewer.hit_targets')}>
              <SwitchField label={row('viewer.hit_targets').label} hideLabel isSelected={control.viewer_hit_targets} onChange={(value) => setGlobal({ key: 'viewer_hit_targets', value })} disabledReason={reason('viewer.hit_targets')} />
            </SettingRow>
            <SettingRow label={row('control.mosaic_density').label} description={row('control.mosaic_density').description} disabled={disabledFor('control.mosaic_density')}>
              <SegmentedField<MosaicDensity>
                label={row('control.mosaic_density').label}
                hideLabel
                value={control.mosaic_density}
                onChange={(value) => setGlobal({ key: 'mosaic_density', value })}
                options={[
                  { value: 'compact', label: SETTINGS.mosaicDensity.compact },
                  { value: 'comfortable', label: SETTINGS.mosaicDensity.comfortable },
                  { value: 'spacious', label: SETTINGS.mosaicDensity.spacious },
                ]}
                disabledReason={reason('control.mosaic_density')}
              />
            </SettingRow>
            <SettingRow label={row('stage.reattach').label} description={row('stage.reattach').description} disabled={disabledFor('stage.reattach')}>
              <SegmentedField<StageReattach>
                label={row('stage.reattach').label}
                hideLabel
                value={control.stage_reattach}
                onChange={(value) => setGlobal({ key: 'stage_reattach', value })}
                options={[
                  { value: 'ask', label: SETTINGS.stageReattach.ask },
                  { value: 'auto', label: SETTINGS.stageReattach.auto },
                  { value: 'stay', label: SETTINGS.stageReattach.stay },
                ]}
                disabledReason={reason('stage.reattach')}
              />
            </SettingRow>
          </SettingsGroup>
        )
      case 'audio':
        return <AudioGroup key={id} title={meta.title} description={compact ? undefined : meta.description} />
      case 'library':
        return (
          <SettingsGroup {...props}>
            <LibraryActions />
          </SettingsGroup>
        )
      case 'data':
        return (
          <SettingsGroup {...props}>
            <DataActions />
          </SettingsGroup>
        )
    }
  }

  return (
    <div className={compact ? 'flex flex-col gap-3' : 'flex flex-col gap-6'} data-settings-form>
      {!compact && (wanted.has('award') || wanted.has('timer')) ? (
        <InlineNotice
          notice={{ code: 'settings.banner', severity: 'info', targetPath: null, actions: [], detail: { message: SETTINGS.banner.body } }}
          onAction={() => {}}
        />
      ) : null}
      {SETTINGS_GROUPS.filter((x) => wanted.has(x.id)).map((x) => (
        <Fragment key={x.id}>{render(x.id)}</Fragment>
      ))}
    </div>
  )
}

/**
 * Volume · mute · the cue map · the two feature roots (§12.5). Preview plays
 * the file in Studio through a plain `HTMLAudioElement` — the operator
 * auditioning a file, not a cue; Stage is the only place a cue is heard.
 */
function AudioGroup({ title, description }: { title: string; description?: string | undefined }) {
  const settings = useSettings()
  const run = useHostCommand()
  const view = settings.data
  const [previewing, setPreviewing] = useState<CueKey | null>(null)
  const player = useRef<HTMLAudioElement | null>(null)
  if (!view) return null
  const audio = view.control.audio
  const disabledFor = (key: string): Disabled | undefined => view.disabled.find((d) => d.key === key)
  const reason = (key: string) => disabledReasonText(disabledFor(key))
  const setGlobal = (setting: GlobalSetting) => void run('settings_set_global', { setting })
  const audioOff = !view.globals.features.audio ? FIELD.featureOff(SETTINGS.rows['feat.audio'].label) : null

  const preview = (cue: CueKey) => {
    player.current?.pause()
    if (previewing === cue) {
      setPreviewing(null)
      return
    }
    const file = audio.cues[cue]
    if (!file) return
    const el = new Audio(`/stage/audio/${file}`)
    el.volume = audio.volume / 100
    el.onended = () => setPreviewing(null)
    el.onerror = () => setPreviewing(null)
    player.current = el
    setPreviewing(cue)
    void el.play().catch(() => setPreviewing(null))
  }

  return (
    <SettingsGroup id="settings-audio" title={title} description={description}>
      <SettingRow label={SETTINGS.rows['audio.volume'].label} description={SETTINGS.rows['audio.volume'].description} disabled={disabledFor('audio.volume')}>
        <SliderField
          label={SETTINGS.rows['audio.volume'].label}
          hideLabel
          value={audio.volume}
          onChange={() => {}}
          onChangeEnd={(value) => setGlobal({ key: 'audio_volume', value: Math.round(value) })}
          minValue={0}
          maxValue={100}
          step={1}
          disabledReason={reason('audio.volume') ?? audioOff}
        />
      </SettingRow>
      <SettingRow label={SETTINGS.rows['audio.muted'].label} description={SETTINGS.rows['audio.muted'].description} disabled={disabledFor('audio.muted')}>
        <SwitchField label={SETTINGS.rows['audio.muted'].label} hideLabel isSelected={audio.muted} onChange={(value) => setGlobal({ key: 'audio_muted', value })} disabledReason={reason('audio.muted') ?? audioOff} />
      </SettingRow>
      <SettingRow label={SETTINGS.rows['audio.cues'].label} description={SETTINGS.rows['audio.cues'].description} disabled={disabledFor('audio.cues')}>
        <div className="flex flex-col divide-y divide-[var(--separator)]">
          {CUE_KEYS.map((cue) => (
            <CueMapRow
              key={cue}
              cue={cue}
              file={audio.cues[cue]}
              files={PACK_FILES}
              onChange={(file) => setGlobal({ key: 'audio_cue', value: [cue, file] })}
              onPreview={() => preview(cue)}
              isPreviewing={previewing === cue}
              disabledReason={reason('audio.cues') ?? audioOff}
            />
          ))}
        </div>
      </SettingRow>
      <SettingRow label={SETTINGS.rows['feat.audio'].label} description={SETTINGS.rows['feat.audio'].description} disabled={disabledFor('feat.audio')}>
        <SwitchField label={SETTINGS.rows['feat.audio'].label} hideLabel isSelected={view.globals.features.audio} onChange={(on) => setGlobal({ key: 'feature', value: ['audio', on] })} disabledReason={reason('feat.audio')} />
      </SettingRow>
      <SettingRow label={SETTINGS.rows['feat.audio.synth'].label} description={SETTINGS.rows['feat.audio.synth'].description} nested disabled={disabledFor('feat.audio.synth')}>
        <SwitchField label={SETTINGS.rows['feat.audio.synth'].label} hideLabel isSelected={view.globals.features.audio_synth} onChange={(on) => setGlobal({ key: 'feature', value: ['audio_synth', on] })} disabledReason={reason('feat.audio.synth')} />
      </SettingRow>
      {view.globals.features.audio_synth ? (
        <Text variant="studio-caption" tone="warning" className="pt-2">
          {SETTINGS.rows['feat.audio.synth'].description}
        </Text>
      ) : null}
    </SettingsGroup>
  )
}
