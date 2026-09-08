import { Description, Label, Switch } from '@heroui/react'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface SwitchFieldProps {
  label: string
  /** Hide the label visually (a `SettingRow` already names the setting). */
  hideLabel?: boolean | undefined
  description?: string | undefined
  isSelected: boolean
  onChange: (isSelected: boolean) => void
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  size?: 'sm' | 'md'
  className?: string | undefined
}

/**
 * **`Switch.Content` is the switch.** HeroUI v3's `Switch` root is React Aria's
 * `SwitchField` — a field wrapper with no input and no ARIA — and the clickable
 * `SwitchButton` is `Switch.Content`. Rendering it only when there was a label
 * to show (which no `SettingRow` has, they all pass `hideLabel`) left every
 * settings switch as decorative markup: a control that could not be operated
 * and reported nothing when it wasn't.
 *
 * So `Switch.Content` is always rendered and always wraps the control; only
 * the `Label` inside it is conditional. `Description` stays a sibling of
 * `Content`, which is where HeroUI puts it.
 */
export function SwitchField({
  label,
  hideLabel,
  description,
  isSelected,
  onChange,
  isDisabled,
  disabledReason,
  size = 'sm',
  className,
}: SwitchFieldProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const field = (
    <Switch isSelected={isSelected} onChange={onChange} isDisabled={disabled} size={size} {...defined({ className, 'aria-label': hideLabel ? label : undefined })}>
      <Switch.Content>
        <Switch.Control>
          <Switch.Thumb />
        </Switch.Control>
        {hideLabel ? null : <Label>{label}</Label>}
      </Switch.Content>
      {!hideLabel && description ? <Description>{description}</Description> : null}
    </Switch>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
