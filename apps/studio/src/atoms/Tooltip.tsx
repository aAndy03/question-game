import type { ReactNode } from 'react'
import { Tooltip as HeroTooltip } from '@heroui/react'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** The tooltip text. Reasons and labels only, never content. */
  content: ReactNode
  placement?: TooltipPlacement
  delay?: number
  isDisabled?: boolean | undefined
  children: ReactNode
}

/** HeroUI `Tooltip` with the arrow on and a short delay, everywhere. */
export function Tooltip({ content, placement = 'top', delay = 400, isDisabled, children }: TooltipProps) {
  if (isDisabled || content === null || content === undefined || content === '') return <>{children}</>
  return (
    <HeroTooltip delay={delay}>
      <HeroTooltip.Trigger>{children}</HeroTooltip.Trigger>
      <HeroTooltip.Content placement={placement} showArrow>
        {content}
      </HeroTooltip.Content>
    </HeroTooltip>
  )
}

/**
 * "Visible but disabled, with the reason" (spec §4.2) as one wrapper. A
 * disabled control does not receive pointer events, so the reason is hung on
 * a focusable span around it. `block` for a field that fills its width (P20):
 * an inline wrapper shrank a disabled slider to 24px.
 */
export function DisabledReason({ reason, children, block }: { reason: string | null | undefined; children: ReactNode; block?: boolean | undefined }) {
  if (!reason) return <>{children}</>
  return (
    <Tooltip content={reason}>
      <span className={[block ? 'flex w-full' : 'inline-flex', 'cursor-not-allowed'].join(' ')} role="group" tabIndex={0} aria-label={reason}>
        {children}
      </span>
    </Tooltip>
  )
}
