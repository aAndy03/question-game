import type { ReactNode } from 'react'
import { Checkbox } from '@heroui/react'
import { DisabledReason } from './Tooltip'
import { defined } from './props'

export interface CheckboxFieldProps {
  /** The accessible name. Rendered unless `hideLabel`. */
  label: string
  hideLabel?: boolean | undefined
  isSelected: boolean
  isIndeterminate?: boolean | undefined
  onChange: (isSelected: boolean) => void
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  className?: string | undefined
  children?: ReactNode
}

export function CheckboxField({
  label,
  hideLabel,
  isSelected,
  isIndeterminate,
  onChange,
  isDisabled,
  disabledReason,
  className,
  children,
}: CheckboxFieldProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const field = (
    <Checkbox
      isSelected={isSelected}
      isIndeterminate={Boolean(isIndeterminate)}
      onChange={onChange}
      isDisabled={disabled}
      {...defined({ 'aria-label': hideLabel ? label : undefined, className })}
    >
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        {hideLabel ? null : (children ?? label)}
      </Checkbox.Content>
    </Checkbox>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{field}</DisabledReason>
}
