import { Description, FieldError, Label, ListBox, Select } from '@heroui/react'
import type { FieldFrameProps } from './TextField'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface SelectOption<V extends string> {
  readonly value: V
  readonly label: string
  readonly description?: string | undefined
  readonly isDisabled?: boolean | undefined
}

export interface SelectFieldProps<V extends string> extends FieldFrameProps {
  value: V | null
  onChange: (value: V) => void
  options: readonly SelectOption<V>[]
  placeholder?: string | undefined
}

export function SelectField<V extends string>({
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
  options,
  placeholder,
}: SelectFieldProps<V>) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const disabledKeys = options.filter((o) => o.isDisabled).map((o) => o.value)
  const field = (
    <Select
      value={value}
      onChange={(next) => {
        if (typeof next === 'string') onChange(next as V)
      }}
      {...defined({ placeholder, className, 'aria-label': hideLabel ? label : undefined })}
      isRequired={Boolean(isRequired)}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      disabledKeys={disabledKeys}
      fullWidth
    >
      {hideLabel ? null : <Label>{label}</Label>}
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description && !error ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
              <Label>{option.label}</Label>
              {option.description ? <Description>{option.description}</Description> : null}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
