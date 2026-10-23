import type { ReactNode } from 'react'
import { Button as HeroButton } from '@heroui/react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { DisabledReason, Tooltip } from './Tooltip'
import { defined } from './props'

export type ButtonVariant = 'primary' | 'secondary' | 'tertiary' | 'outline' | 'ghost' | 'danger'
export type ButtonSize = 'sm' | 'md' | 'lg'

export interface ButtonProps {
  variant?: ButtonVariant
  size?: ButtonSize
  /** Leading icon, from `ICONS`. */
  icon?: IconName | undefined
  isDisabled?: boolean | undefined
  /** Why it is disabled. Renders as a tooltip; the control stays visible (§4.2). */
  disabledReason?: string | null | undefined
  isPending?: boolean | undefined
  fullWidth?: boolean | undefined
  type?: 'button' | 'submit'
  autoFocus?: boolean | undefined
  onPress?: (() => void) | undefined
  className?: string | undefined
  /** The full name when the visible text is a short one under a heading
   * (P21.5: *Send* under Stage is "Send Stage here"); it must contain the
   * visible text. */
  label?: string | undefined
  children: ReactNode
}

/**
 * HeroUI `Button`, pinned to the project's rules: one `primary` per region,
 * `danger` only for a destructive act, `ghost` for row and toolbar actions.
 */
export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  isDisabled,
  disabledReason,
  isPending,
  fullWidth,
  type = 'button',
  autoFocus,
  onPress,
  className,
  label,
  children,
}: ButtonProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const button = (
    <HeroButton
      variant={variant}
      size={size}
      isDisabled={disabled}
      isPending={Boolean(isPending)}
      fullWidth={Boolean(fullWidth)}
      type={type}
      {...defined({ autoFocus, onPress, className, 'aria-label': label })}
    >
      {icon ? <Icon name={icon} size={size === 'lg' ? 'md' : 'sm'} /> : null}
      {children}
    </HeroButton>
  )
  return <DisabledReason reason={disabled ? disabledReason : null}>{button}</DisabledReason>
}

export interface IconButtonProps {
  icon: IconName
  /** Required: the accessible name and the tooltip. */
  label: string
  variant?: ButtonVariant
  size?: ButtonSize
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  isPending?: boolean | undefined
  /** Hide the tooltip when the label is already visible beside it. */
  hideTooltip?: boolean | undefined
  onPress?: (() => void) | undefined
  className?: string | undefined
}

/** An icon-only button never ships without a label. */
export function IconButton({
  icon,
  label,
  variant = 'ghost',
  size = 'md',
  isDisabled,
  disabledReason,
  isPending,
  hideTooltip,
  onPress,
  className,
}: IconButtonProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const button = (
    <HeroButton
      variant={variant}
      size={size}
      isIconOnly
      isDisabled={disabled}
      isPending={Boolean(isPending)}
      aria-label={label}
      {...defined({ onPress, className })}
    >
      <Icon name={icon} size={size === 'lg' ? 'md' : 'sm'} />
    </HeroButton>
  )
  if (disabled && disabledReason) return <DisabledReason reason={disabledReason}>{button}</DisabledReason>
  return (
    <Tooltip content={label} isDisabled={hideTooltip}>
      {button}
    </Tooltip>
  )
}
