import { Description, FieldError, Input, Label, TextField as HeroTextField } from '@heroui/react'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

/**
 * Every field atom carries the same frame: `label`, `description`, `error`,
 * `isRequired`, `isDisabled` and `disabledReason`. A host refusal routed to
 * this field arrives as `error`; the form never re-implements the rule.
 */
export interface FieldFrameProps {
  label: string
  description?: string | undefined
  error?: string | null | undefined
  isRequired?: boolean | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  /** Hide the label visually; it stays the accessible name. */
  hideLabel?: boolean | undefined
  className?: string | undefined
}

export interface TextFieldProps extends FieldFrameProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string | undefined
  autoFocus?: boolean | undefined
  name?: string | undefined
  /** `mono` for ids, codes and chords. */
  font?: 'sans' | 'mono'
  maxLength?: number | undefined
  onBlur?: (() => void) | undefined
}

export function TextField({
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
  autoFocus,
  name,
  font = 'sans',
  maxLength,
  onBlur,
}: TextFieldProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const field = (
    <HeroTextField
      value={value}
      onChange={onChange}
      isRequired={Boolean(isRequired)}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      fullWidth
      {...defined({ name, autoFocus, className, 'aria-label': hideLabel ? label : undefined })}
    >
      {hideLabel ? null : <Label>{label}</Label>}
      <Input {...defined({ placeholder, maxLength, onBlur, className: font === 'mono' ? 'font-mono' : undefined })} />
      {description && !error ? <Description>{description}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </HeroTextField>
  )
  return <DisabledReason reason={disabled ? disabledReason : null} block>{field}</DisabledReason>
}
