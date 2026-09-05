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
      <Switch.Control>
        <Switch.Thumb />
      </Switch.Control>
      {hideLabel ? null : (
        <Switch.Content>
          <Label>{label}</Label>
          {description ? <Description>{description}</Description> : null}
        </Switch.Content>
      )}
    </Switch>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
