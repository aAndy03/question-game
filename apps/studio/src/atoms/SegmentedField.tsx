import { ToggleButton, ToggleButtonGroup } from '@heroui/react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { Text } from './Text'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface SegmentedOption<V extends string> {
  readonly value: V
  readonly label: string
  readonly icon?: IconName | undefined
  readonly isDisabled?: boolean | undefined
}

export interface SegmentedFieldProps<V extends string> {
  label: string
  /** Hide the label visually; it stays the accessible name. */
  hideLabel?: boolean | undefined
  description?: string | undefined
  value: V
  onChange: (value: V) => void
  options: readonly SegmentedOption<V>[]
  size?: 'sm' | 'md' | 'lg'
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  error?: string | null | undefined
  className?: string | undefined
}

/**
 * A single-select `ToggleButtonGroup` with the field frame — one of a few
 * named values, always one selected (award mode, reveal mode, map kind).
 */
export function SegmentedField<V extends string>({
  label,
  hideLabel,
  description,
  value,
  onChange,
  options,
  size = 'sm',
  isDisabled,
  disabledReason,
  error,
  className,
}: SegmentedFieldProps<V>) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const values = new Set<string>(options.map((o) => o.value))
  const group = (
    <ToggleButtonGroup
      selectionMode="single"
      selectedKeys={[value]}
      disallowEmptySelection
      size={size}
      isDisabled={disabled}
      aria-label={label}
      onSelectionChange={(keys) => {
        const next = [...keys][0]
        if (typeof next === 'string' && values.has(next) && next !== value) onChange(next as V)
      }}
    >
      {options.map((option, i) => (
        <ToggleButton key={option.value} id={option.value} {...defined({ isDisabled: option.isDisabled })}>
          {i > 0 ? <ToggleButtonGroup.Separator /> : null}
          {option.icon ? <Icon name={option.icon} size="sm" /> : null}
          {option.label}
        </ToggleButton>
      ))}
    </ToggleButtonGroup>
  )
  const field = (
    <div className={['flex flex-col gap-1.5', className].filter(Boolean).join(' ')}>
      {hideLabel ? null : (
        <Text as="span" variant="studio-label" tone={disabled ? 'muted' : 'default'}>
          {label}
        </Text>
      )}
      {group}
      {error ? (
        <Text as="span" variant="studio-caption" tone="danger">
          {error}
        </Text>
      ) : description ? (
        <Text as="span" variant="studio-caption" tone="muted">
          {description}
        </Text>
      ) : null}
    </div>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
