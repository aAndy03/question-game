import { useRef } from 'react'
import { NumberField } from './NumberField'
import { SwitchField } from './SwitchField'

export interface OptionalNumberFieldProps {
  label: string
  /** Hide the label visually (a `SettingRow` already names the setting). */
  hideLabel?: boolean | undefined
  description?: string | undefined
  /** `null` is off. */
  value: number | null
  onChange: (value: number | null) => void
  min?: number | undefined
  max?: number | undefined
  step?: number | undefined
  error?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  className?: string | undefined
}

/**
 * A switch and a number side by side for a setting whose "off" is `null`
 * (the consecutive cap, the bonus). Switching off sends `null`; switching
 * back on restores the last number, or the minimum the first time.
 */
export function OptionalNumberField({
  label,
  hideLabel,
  description,
  value,
  onChange,
  min = 1,
  max,
  step = 1,
  error,
  isDisabled,
  disabledReason,
  className,
}: OptionalNumberFieldProps) {
  const last = useRef<number | null>(value)
  if (value !== null) last.current = value
  const on = value !== null
  return (
    <div className={['flex items-start gap-3', className].filter(Boolean).join(' ')}>
      <div className="flex h-10 items-center">
        <SwitchField
          label={label}
          hideLabel={hideLabel ?? true}
          isSelected={on}
          onChange={(next) => onChange(next ? (last.current ?? min) : null)}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
      </div>
      <NumberField
        label={label}
        hideLabel
        description={description}
        error={error}
        value={value}
        onChange={(next) => {
          if (next !== null) onChange(next)
        }}
        minValue={min}
        maxValue={max}
        step={step}
        isDisabled={isDisabled || !on}
        disabledReason={disabledReason}
        className="w-36"
      />
    </div>
  )
}
