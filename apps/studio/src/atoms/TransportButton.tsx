import { Button as HeroButton } from '@heroui/react'
import { Icon } from './Icon'
import type { IconName } from './icons'
import { defined } from './props'
import { DisabledReason, Tooltip } from './Tooltip'

export type TransportState = 'rest' | 'active' | 'armed'

export interface TransportButtonProps {
  icon: IconName
  /** The accessible name and the tooltip. */
  label: string
  /** `active`: the thing it controls is running (timer, play). `armed`: press again to confirm. */
  state?: TransportState
  size?: 'sm' | 'md' | 'lg'
  /** Show the label beside the icon (comfortable density). */
  withLabel?: boolean | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  isPending?: boolean | undefined
  kbd?: string | undefined
  onPress: () => void
}

/**
 * An Action Panel button: icon-first, tooltip always, `armed` in danger
 * (spec §14: arm → confirm), `active` in the accent.
 */
export function TransportButton({
  icon,
  label,
  state = 'rest',
  size = 'md',
  withLabel,
  isDisabled,
  disabledReason,
  isPending,
  kbd,
  onPress,
}: TransportButtonProps) {
  const disabled = Boolean(isDisabled) || Boolean(disabledReason)
  const variant = state === 'armed' ? 'danger' : state === 'active' ? 'primary' : 'secondary'
  const button = (
    <HeroButton
      variant={variant}
      size={size}
      isIconOnly={!withLabel}
      isDisabled={disabled}
      isPending={Boolean(isPending)}
      onPress={onPress}
      aria-label={label}
      {...defined({ className: withLabel ? 'justify-start' : undefined, 'aria-pressed': state === 'active' ? true : undefined })}
    >
      <Icon name={icon} size={size === 'lg' ? 'md' : 'sm'} />
      {withLabel ? <span className="truncate">{label}</span> : null}
    </HeroButton>
  )
  if (disabled && disabledReason) return <DisabledReason reason={disabledReason}>{button}</DisabledReason>
  return (
    <Tooltip content={kbd ? `${label} · ${kbd}` : label} isDisabled={withLabel && !kbd}>
      {button}
    </Tooltip>
  )
}
