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
 */
export function SettingRow({ label, description, children, disabled, nested }: SettingRowProps) {
  const reason = disabledReasonText(disabled)
  return (
    <div
      className={[
        'grid grid-cols-[minmax(0,1fr)_minmax(0,20rem)] items-start gap-6 py-3',
        nested ? 'ml-6 border-l-2 border-[var(--separator)] pl-4' : '',
      ].join(' ')}
    >
      <div className="flex min-w-0 flex-col gap-0.5 pt-1.5">
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
  )
}
