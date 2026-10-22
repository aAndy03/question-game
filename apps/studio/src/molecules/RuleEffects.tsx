import { Chip, Icon, Panel, Text, Tooltip } from '@/atoms'
import { disabledReasonText } from './SettingRow'
import { PREVIEW } from '@/copy/preview'
import { RULES } from '@/copy'
import type { Disabled, RuleEffect, RulesPreview } from '@/host/types'

export interface RuleEffectsProps {
  preview: RulesPreview
}

/** The §4.2 key → its operator-facing label, so the table reads like the form. */
const LABEL: Record<string, string> = {
  'scoring.mode': RULES.scoringMode,
  'scoring.flat_points': RULES.flatPoints,
  'scoring.difficulty_map': RULES.difficultyMap,
  'scoring.lock_speed.enabled': RULES.lockSpeedEnabled,
  'scoring.lock_speed_base': RULES.lockSpeedBase,
  'scoring.speed_weight': RULES.speedWeight,
  'scoring.speed_window': RULES.speedWindow,
  'scoring.speed_steps': RULES.speedSteps,
  'timer.enabled': RULES.timerEnabled,
  'timer.duration_ms': RULES.timerDuration,
  'judging.partial_credit': RULES.partialCredit,
  'judging.order_matters': RULES.orderMatters,
  'turn.max_consecutive_correct': RULES.maxConsecutive,
  'turn.bonus_after_consecutive': RULES.bonus,
}

/**
 * One row per award setting: what it changes, and what is currently switching
 * it off (P11.12).
 *
 * The compound problem, made readable. Four of these keys silently neutralise
 * others — a mode that does not read the flat base, a timer that is off, a
 * weight of zero — and until now the only way to find out was to watch a
 * control go grey with no explanation of which sibling did it.
 *
 * **The key list and the disabled entries both come from the host.** `keys` is
 * `preview::AWARD_KEYS`, so a setting that gains an interlock cannot be left
 * out of the explanation; `effects` is the same §4.2 table `settings_get`
 * serves, run over *this* recipe rather than only the one in Control. Nothing
 * here recomputes an interlock.
 */
export function RuleEffects({ preview }: RuleEffectsProps) {
  return (
    // Reference, read when asked (P20): a closed disclosure, the rows still in the page.
    <details className="group flex flex-col gap-2" data-rule-effects>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded py-1 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]">
        <Icon name="chevronRight" size="sm" className="transition-transform group-open:rotate-90" />
        <Text as="h3" variant="studio-subheading">{`${PREVIEW.effects.title} · ${preview.rules.length}`}</Text>
      </summary>
      <Panel className="mt-2 overflow-x-auto" flush>
        <table className="w-full border-collapse" aria-label={PREVIEW.effects.title}>
          <thead>
            <tr className="border-b border-[var(--separator)]">
              <th scope="col" className="p-2 pl-3 text-left">
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.effects.key}
                </Text>
              </th>
              <th scope="col" className="p-2 text-left">
                <Text variant="studio-caption" tone="muted">
                  {PREVIEW.effects.state}
                </Text>
              </th>
            </tr>
          </thead>
          <tbody>
            {preview.rules.map((rule) => (
              <tr key={rule.key} className="border-b border-[var(--separator)] last:border-0" data-effect={rule.key} data-state={rule.state}>
                <th scope="row" className="max-w-[24rem] p-2 pl-3 text-left align-top font-normal">
                  {/* `Text` is inline by default, so the label and the
                      sentence under it need blocks or they run together. */}
                  <div className="flex flex-col gap-0.5">
                    <Text as="div" variant="studio-label">
                      {LABEL[rule.key] ?? rule.key}
                    </Text>
                    <Text as="div" variant="studio-caption" tone="muted">
                      {PREVIEW.changes[rule.key] ?? rule.key}
                    </Text>
                  </div>
                </th>
                <td className="p-2 align-top">
                  <StateCell rule={rule} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </details>
  )
}

/**
 * The "Right now" cell — three states, never two.
 *
 * `off` is not `disabled`, and the difference is the whole reason this cell
 * exists: a switch the operator turned off is usable and simply not
 * contributing, while a disabled key cannot contribute whatever its value.
 * Reading only the second made every off switch render as *In use*.
 *
 * The value follows the state in both live cases, because "In use" alone
 * never answers the question the operator is actually asking.
 */
function StateCell({ rule }: { rule: RuleEffect }) {
  if (rule.state === 'disabled') {
    const reason = disabledReasonText(rule as Disabled)
    return (
      <Tooltip content={reason ?? ''}>
        <Chip tone={rule.reason === 'frozen' ? 'accent' : 'warning'}>{reason}</Chip>
      </Tooltip>
    )
  }
  // An off key's value *is* its state — a switch that is off, an optional
  // that is unset — so the chip says it once rather than "Off Off".
  if (rule.state === 'off') {
    return <Chip tone="default">{PREVIEW.value(rule.value)}</Chip>
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip tone="success">{PREVIEW.effects.live}</Chip>
      <Text variant="studio-caption" tone="muted">
        {PREVIEW.value(rule.value)}
      </Text>
    </div>
  )
}
