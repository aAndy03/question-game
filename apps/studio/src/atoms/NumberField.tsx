import { Description, FieldError, Label, NumberField as HeroNumberField } from '@heroui/react'
import type { FieldFrameProps } from './TextField'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface NumberFieldProps extends FieldFrameProps {
  value: number | null
  onChange: (value: number | null) => void
  minValue?: number | undefined
  maxValue?: number | undefined
  step?: number | undefined
  /** A unit or hint shown after the value, e.g. `ms`. */
  formatOptions?: Intl.NumberFormatOptions | undefined
  autoFocus?: boolean | undefined
}

export function NumberField({
  label,
  description,
  error,
  isRequired,
  isDisabled,
  disabledReason,
  hideLabel,
  className,
  value,
  onChange,
  minValue,
  maxValue,
  step,
  formatOptions,
  autoFocus,
}: NumberFieldProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const field = (
    <HeroNumberField
      value={value ?? Number.NaN}
      onChange={(next) => onChange(next === undefined || Number.isNaN(next) ? null : next)}
      {...defined({ minValue, maxValue, step, formatOptions, autoFocus, className, 'aria-label': hideLabel ? label : undefined })}
      isRequired={Boolean(isRequired)}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      fullWidth
    >
      {hideLabel ? null : <Label>{label}</Label>}
      <HeroNumberField.Group>
        <HeroNumberField.DecrementButton />
        <HeroNumberField.Input />
        <HeroNumberField.IncrementButton />
      </HeroNumberField.Group>
      {description && !error ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </HeroNumberField>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
