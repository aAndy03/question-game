import { useState } from 'react'
import { Description, FieldError, Input, Label, TextField as HeroTextField } from '@heroui/react'
import { SETTINGS } from '@/copy/settings'
import { IconButton } from './Button'
import type { FieldFrameProps } from './TextField'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface PinFieldProps extends Omit<FieldFrameProps, 'hideLabel'> {
  value: string
  onChange: (value: string) => void
  autoFocus?: boolean | undefined
  name?: string | undefined
}

/** The client-side shape of a pin. The host is the judge; this only phrases the hint. */
export const PIN_SHAPE = /^\d{4,8}$/

/**
 * A pin: password input, numeric keypad, no autocomplete, an eye toggle
 * (05_STUDIO_DESIGN.md §12.3). Digits go to the host as typed — Studio never
 * hashes (§2.15). A host refusal arrives as `error`; the 4–8 digit hint is
 * shown as a description while the value has another shape.
 */
export function PinField({
  label,
  description,
  error,
  isRequired,
  isDisabled,
  disabledReason,
  className,
  value,
  onChange,
  autoFocus,
  name,
}: PinFieldProps) {
  const [visible, setVisible] = useState(false)
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const hint = value !== '' && !PIN_SHAPE.test(value) ? SETTINGS.pin.invalid : (description ?? SETTINGS.pin.hint)
  const field = (
    <HeroTextField
      value={value}
      onChange={(next) => onChange(next.replace(/\D/g, '').slice(0, 8))}
      isRequired={Boolean(isRequired)}
      isDisabled={disabled}
      isInvalid={Boolean(error)}
      fullWidth
      {...defined({ name, autoFocus, className })}
    >
      <Label>{label}</Label>
      <div className="relative">
        <Input
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="off"
          maxLength={8}
          className="pr-10 font-mono"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <IconButton
            icon={visible ? 'eyeOff' : 'eye'}
            label={visible ? SETTINGS.pin.hide : SETTINGS.pin.show}
            size="sm"
            isDisabled={disabled}
            onPress={() => setVisible((v) => !v)}
          />
        </div>
      </div>
      {!error ? <Description>{hint}</Description> : null}
      {error ? <FieldError>{error}</FieldError> : null}
    </HeroTextField>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
