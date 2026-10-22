import { Description, FieldError, Label, TextArea, TextField as HeroTextField } from '@heroui/react'
import type { FieldFrameProps } from './TextField'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface TextAreaFieldProps extends FieldFrameProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  rows?: number
  autoFocus?: boolean | undefined
  onBlur?: (() => void) | undefined
}

export function TextAreaField({
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
  placeholder,
  rows = 3,
  autoFocus,
  onBlur,
}: TextAreaFieldProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const field = (
    <HeroTextField
      value={value}
      onChange={onChange}
      isRequired={Boolean(isRequired)}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      fullWidth
      {...defined({ autoFocus, className, 'aria-label': hideLabel ? label : undefined })}
    >
      {hideLabel ? null : <Label>{label}</Label>}
      <TextArea rows={rows} fullWidth {...defined({ placeholder, onBlur })} />
      {description && !error ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </HeroTextField>
  )
  return <DisabledReason reason={disabled ? disabledReason : null} block>{field}</DisabledReason>
}
