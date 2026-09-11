import { DifficultyMapField, SettingRow, SpeedWindowField, disabledReasonText } from '@/molecules'
import { NumberField, Panel, SegmentedField, SelectField, SwitchField, Text } from '@/atoms'
import { GAME, RULES } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { useRulesPreview } from '@/host/queries'
import { useSettings } from '@/host/queries'
import type { Disabled, GameSettings, Recipe, RevealChannel, RevealMode } from '@/host/types'
import { STAGE_LANGUAGES, type StageLanguage } from '@questiongame/contract'

export interface RulesSectionProps {
  recipe: Recipe
  frozenReason: string | null
}

const CHANNELS: readonly RevealChannel[] = ['question', 'answers', 'outcome', 'leaderboard']

/**
 * The recipe's B5 document (spec §4.2), one `SettingRow` per key, parents
 * nesting children (award mode → points / map / weight).
 *
 * **Interlocks come from the host, for this recipe, always** (P11.12).
 * `settings_get.disabled` can only answer for the recipe in Control, so this
 * form used to re-derive "the weight is inert" and "the timer is off" in
 * TypeScript — a second copy of the §4.2 table, which is the thing §4.2 exists
 * to prevent. `rules_preview.effects` is the same table run over *this*
 * document, so nothing here recomputes an interlock. Writes the whole document
 * with `recipe_set_settings`; the host validates.
 */
export function RulesSection({ recipe, frozenReason }: RulesSectionProps) {
  const settings = useSettings()
  const preview = useRulesPreview(recipe.id, recipe.rev)
  const run = useHostCommand()
  const s = recipe.settings
  // The preview's effects are about this recipe; `settings_get`'s are about
  // the one in Control. Prefer the specific answer, fall back while it loads.
  const disabledList: readonly Disabled[] = preview.data?.effects ?? settings.data?.disabled ?? []
  const disabledFor = (key: string): Disabled | undefined =>
    frozenReason ? { key, reason: 'frozen' } : disabledList.find((d) => d.key === key)
  const reason = (key: string) => frozenReason ?? disabledReasonText(disabledFor(key))
  const resolvedDuration = preview.data?.timer.durationMs ?? null

  const write = (next: GameSettings) => void run('recipe_set_settings', { id: recipe.id, settings: next })
  const scoring = (patch: Partial<GameSettings['scoring']>) => write({ ...s, scoring: { ...s.scoring, ...patch } })
  const judging = (patch: Partial<GameSettings['judging']>) => write({ ...s, judging: { ...s.judging, ...patch } })
  const turn = (patch: Partial<GameSettings['turn']>) => write({ ...s, turn: { ...s.turn, ...patch } })
  const timer = (patch: Partial<GameSettings['timer']>) => write({ ...s, timer: { ...s.timer, ...patch } })
  const reveal = (channel: RevealChannel, mode: RevealMode) => write({ ...s, reveal: { ...s.reveal, [channel]: mode } })
  const language = (value: StageLanguage) => write({ ...s, language: value })

  const exclusiveLockSpeed = s.scoring.mode === 'lock_speed'
  const globalsTimer = settings.data?.globals.timer

  return (
    <Panel className="flex flex-col gap-2">
      <div className="flex flex-col gap-0.5 pb-2">
        <Text variant="studio-heading">{GAME.rules}</Text>
        <Text variant="studio-caption" tone="muted">
          {GAME.rulesHint}
        </Text>
      </div>

      <SettingRow label={RULES.scoringMode} description={RULES.scoringModeHint} disabled={disabledFor('scoring.mode')}>
        <SelectField
          label={RULES.scoringMode}
          hideLabel
          value={s.scoring.mode}
          onChange={(mode) => scoring({ mode })}
          options={[
            { value: 'flat', label: RULES.flat },
            { value: 'difficulty', label: RULES.difficulty },
            { value: 'lock_speed', label: RULES.lockSpeed },
          ]}
          disabledReason={reason('scoring.mode')}
        />
      </SettingRow>
      {s.scoring.mode === 'flat' || (exclusiveLockSpeed && s.scoring.lock_speed_base === 'flat') ? (
        <SettingRow label={RULES.flatPoints} nested>
          <NumberField label={RULES.flatPoints} hideLabel value={s.scoring.flat_points} onChange={(v) => scoring({ flat_points: v ?? 0 })} minValue={0} disabledReason={reason('scoring.flat_points')} />
        </SettingRow>
      ) : null}
      {s.scoring.mode === 'difficulty' || (exclusiveLockSpeed && s.scoring.lock_speed_base === 'difficulty') ? (
        <SettingRow label={RULES.difficultyMap} description={RULES.difficultyMapHint} nested>
          {/*
            One molecule, both call sites. Until P11.12 this row had its own
            Select and a factor field, and the Bands branch rendered *nothing*:
            the operator picked Bands and the panel went blank, which is most
            of why nobody could say what Bands did.
          */}
          <DifficultyMapField
            value={s.scoring.difficulty_map}
            onChange={(difficulty_map) => scoring({ difficulty_map })}
            disabledReason={reason('scoring.difficulty_map')}
            isDisabled={reason('scoring.difficulty_map') !== null}
          />
        </SettingRow>
      ) : null}
      {exclusiveLockSpeed ? (
        <SettingRow label={RULES.lockSpeedBase} nested>
          <SelectField
            label={RULES.lockSpeedBase}
            hideLabel
            value={s.scoring.lock_speed_base}
            onChange={(lock_speed_base) => scoring({ lock_speed_base })}
            options={[
              { value: 'flat', label: RULES.flat },
              { value: 'difficulty', label: RULES.difficulty },
            ]}
            disabledReason={reason('scoring.lock_speed_base')}
          />
        </SettingRow>
      ) : (
        <SettingRow label={RULES.lockSpeedEnabled} description={RULES.lockSpeedEnabledHint} nested>
          <SwitchField label={RULES.lockSpeedEnabled} hideLabel isSelected={s.scoring.lock_speed_enabled} onChange={(lock_speed_enabled) => scoring({ lock_speed_enabled })} disabledReason={reason('scoring.lock_speed.enabled')} />
        </SettingRow>
      )}
      <SettingRow label={RULES.speedWeight} description={RULES.speedWeightHint} nested>
        <NumberField
          label={RULES.speedWeight}
          hideLabel
          value={s.scoring.speed_weight}
          onChange={(v) => scoring({ speed_weight: v ?? 0 })}
          minValue={0}
          step={0.1}
          disabledReason={reason('scoring.speed_weight')}
        />
      </SettingRow>
      {/*
        P11.12. Both default to the pre-P11.12 formula — the whole clock, no
        banding — so an existing game pays exactly what it paid before.
      */}
      <SettingRow label={RULES.speedWindow} description={RULES.speedWindowHint} nested>
        <SpeedWindowField
          value={s.scoring.speed_window}
          durationMs={resolvedDuration}
          onChange={(speed_window) => scoring({ speed_window })}
          disabledReason={reason('scoring.speed_window')}
        />
      </SettingRow>
      <SettingRow label={RULES.speedSteps} description={RULES.speedStepsHint} nested>
        <div className="flex items-center gap-2">
          <SwitchField
            label={RULES.speedSteps}
            hideLabel
            isSelected={s.scoring.speed_steps !== null}
            onChange={(on) => scoring({ speed_steps: on ? 3 : null })}
            disabledReason={reason('scoring.speed_steps')}
          />
          {s.scoring.speed_steps !== null ? (
            <NumberField
              label={RULES.speedSteps}
              hideLabel
              value={s.scoring.speed_steps}
              onChange={(v) => scoring({ speed_steps: Math.max(1, v ?? 1) })}
              minValue={1}
              maxValue={20}
              disabledReason={reason('scoring.speed_steps')}
            />
          ) : null}
        </div>
      </SettingRow>

      <SettingRow label={RULES.partialCredit} description={RULES.partialCreditHint} disabled={disabledFor('judging.partial_credit')}>
        <SwitchField label={RULES.partialCredit} hideLabel isSelected={s.judging.partial_credit} onChange={(partial_credit) => judging({ partial_credit })} disabledReason={reason('judging.partial_credit')} />
      </SettingRow>
      <SettingRow label={RULES.orderMatters} description={RULES.orderMattersHint} disabled={disabledFor('judging.order_matters')}>
        <SwitchField label={RULES.orderMatters} hideLabel isSelected={s.judging.order_matters} onChange={(order_matters) => judging({ order_matters })} disabledReason={reason('judging.order_matters')} />
      </SettingRow>

      <SettingRow label={RULES.maxConsecutive} description={RULES.maxConsecutiveHint}>
        <NumberField label={RULES.maxConsecutive} hideLabel value={s.turn.max_consecutive_correct} onChange={(v) => turn({ max_consecutive_correct: v })} minValue={1} disabledReason={reason('turn.max_consecutive_correct')} />
      </SettingRow>
      <SettingRow label={RULES.bonus}>
        <div className="flex items-center gap-2">
          <SwitchField
            label={RULES.bonus}
            hideLabel
            isSelected={s.turn.bonus_after_consecutive !== null}
            onChange={(on) => turn({ bonus_after_consecutive: on ? { count: 3, award: 10 } : null })}
            disabledReason={reason('turn.bonus_after_consecutive')}
          />
          {s.turn.bonus_after_consecutive ? (
            <>
              <NumberField label={RULES.bonusCount} hideLabel value={s.turn.bonus_after_consecutive.count} onChange={(v) => turn({ bonus_after_consecutive: { count: v ?? 1, award: s.turn.bonus_after_consecutive?.award ?? 0 } })} minValue={1} disabledReason={reason('turn.bonus_after_consecutive')} />
              <NumberField label={RULES.bonusAward} hideLabel value={s.turn.bonus_after_consecutive.award} onChange={(v) => turn({ bonus_after_consecutive: { count: s.turn.bonus_after_consecutive?.count ?? 1, award: v ?? 0 } })} minValue={0} disabledReason={reason('turn.bonus_after_consecutive')} />
            </>
          ) : null}
        </div>
      </SettingRow>

      <SettingRow label={RULES.timerEnabled} description={RULES.timerEnabledHint} disabled={disabledFor('timer.enabled')}>
        <SelectField
          label={RULES.timerEnabled}
          hideLabel
          value={s.timer.enabled === null ? 'inherit' : s.timer.enabled ? 'on' : 'off'}
          onChange={(v) => timer({ enabled: v === 'inherit' ? null : v === 'on' })}
          options={[
            { value: 'inherit', label: `${RULES.inherit}${globalsTimer ? ` (${globalsTimer.enabled ? RULES.on : RULES.off})` : ''}` },
            { value: 'on', label: RULES.on },
            { value: 'off', label: RULES.off },
          ]}
          disabledReason={reason('timer.enabled')}
        />
      </SettingRow>
      <SettingRow label={RULES.timerDuration} description={RULES.timerDurationHint} nested>
        <NumberField
          label={RULES.timerDuration}
          hideLabel
          value={s.timer.duration_ms}
          onChange={(v) => timer({ duration_ms: v })}
          minValue={1000}
          step={1000}
          description={globalsTimer?.duration_ms ? `${RULES.inherit}: ${globalsTimer.duration_ms} ms` : undefined}
          disabledReason={reason('timer.duration_ms')}
        />
      </SettingRow>

      <SettingRow label={RULES.reveal} description={RULES.revealHint}>
        <div className="grid grid-cols-2 gap-2">
          {CHANNELS.map((channel) => (
            <SelectField
              key={channel}
              label={RULES.revealChannel[channel]}
              value={s.reveal[channel]}
              onChange={(mode) => reveal(channel, mode)}
              options={[
                { value: 'operator', label: RULES.operator },
                { value: 'auto', label: RULES.auto },
              ]}
              disabledReason={frozenReason ? null : reason(`reveal.${channel}`)}
            />
          ))}
        </div>
      </SettingRow>

      {/* Presentation, not rules: live like reveal, so never frozen. */}
      <SettingRow label={RULES.language} description={RULES.languageHint}>
        <SegmentedField
          label={RULES.language}
          hideLabel
          value={s.language ?? 'en'}
          onChange={language}
          options={STAGE_LANGUAGES.map((value) => ({ value, label: RULES.languageName[value] }))}
        />
      </SettingRow>
    </Panel>
  )
}
