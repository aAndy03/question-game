import { NumberField } from './NumberField'
import type { FieldFrameProps } from './TextField'

export interface DurationFieldProps extends FieldFrameProps {
  /** Milliseconds, the host's unit. */
  value: number | null
  onChange: (ms: number | null) => void
  minSeconds?: number | undefined
  maxSeconds?: number | undefined
  autoFocus?: boolean | undefined
}

const SECONDS: Intl.NumberFormatOptions = { style: 'unit', unit: 'second', unitDisplay: 'narrow', maximumFractionDigits: 0 }

/**
 * A `NumberField` that shows whole seconds and speaks milliseconds — the
 * timer duration the operator reads as `30s` and the host stores as 30000.
 */
export function DurationField({ value, onChange, minSeconds = 1, maxSeconds, autoFocus, ...frame }: DurationFieldProps) {
  return (
    <NumberField
      {...frame}
      value={value === null ? null : Math.round(value / 1000)}
      onChange={(seconds) => onChange(seconds === null ? null : Math.round(seconds) * 1000)}
      minValue={minSeconds}
      maxValue={maxSeconds}
      step={1}
      formatOptions={SECONDS}
      autoFocus={autoFocus}
    />
  )
}
