import type { ReactNode } from 'react'
import { Text } from '@/atoms'
import { FIELD } from '@/copy'
import type { Disabled } from '@/host/types'

export interface SettingRowProps {
  label: string
  description?: string | undefined
  /** The control. It receives `disabledReason` itself; this row only frames it. */
  children: ReactNode
  /** The host's `disabled` entry for this key, when there is one. */
  disabled?: Disabled | undefined
  /** Nest child rows under a parent (award mode → points / map / weight). */
  nested?: boolean | undefined
}

/** Why the host disabled a key, in the operator's words (spec §4.2). */
export function disabledReasonText(disabled: Disabled | undefined): string | null {
  if (!disabled) return null
  switch (disabled.reason) {
    case 'frozen':
      return FIELD.frozen
    case 'inert':
      return FIELD.inert(disabled.detail)
    case 'feature_off':
      return FIELD.featureOff(disabled.detail)
  }
}

/**
 * Label · description · control · reason, on one row. Used by the Games
 * Rules section now, the Settings tab (P10) and the Control float (P8).
 *
 * **Two columns only when two columns fit.** The row is a container query, not
 * a fixed grid: the Settings tab is wide and reads label-left / control-right,
 * while the Control float is a 32rem popover where a 20rem control column left
 * the label eight characters wide and broke every description into one word
 * per line. Below the threshold the row stacks — label, description, then the
 * control at full width — and the nesting indent shrinks with it.
 */
export function SettingRow({ label, description, children, disabled, nested }: SettingRowProps) {
  const reason = disabledReasonText(disabled)
  return (
    <div className={['@container/setting-row', nested ? 'ml-2 border-l-2 border-[var(--separator)] pl-3 @[34rem]/setting-row:ml-6 @[34rem]/setting-row:pl-4' : ''].join(' ')}>
      <div className="grid grid-cols-1 gap-x-6 gap-y-2 py-3 @[34rem]/setting-row:grid-cols-[minmax(0,1fr)_minmax(0,20rem)] @[34rem]/setting-row:items-start">
        <div className="flex min-w-0 flex-col gap-0.5 @[34rem]/setting-row:pt-1.5">
          <Text as="div" variant="studio-label" tone={reason ? 'muted' : 'default'}>
            {label}
          </Text>
          {description ? (
            <Text as="div" variant="studio-caption" tone="muted">
              {description}
            </Text>
          ) : null}
          {reason ? (
            <Text as="div" variant="studio-caption" tone="warning">
              {reason}
            </Text>
          ) : null}
        </div>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  )
}
