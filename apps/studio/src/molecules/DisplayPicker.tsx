import type { MonitorInfo } from '@questiongame/contract'
import { SelectField } from '@/atoms'
import { CONTROL } from '@/copy'

export interface DisplayPickerProps {
  label: string
  monitors: readonly MonitorInfo[]
  /** The remembered pick (a key), or null for the primary display. */
  value: string | null
  /** Where the window actually stands, when that differs (unplugged, pending). */
  standingOn?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  onChange: (monitorId: string | null) => void
}

/** A Select over the OS display list; the host never picks (spec §9). */
export function DisplayPicker({ label, monitors, value, standingOn, isDisabled, disabledReason, onChange }: DisplayPickerProps) {
  const PRIMARY = '__primary'
  const options = [
    { value: PRIMARY, label: CONTROL.primaryDisplay },
    ...monitors.map((m) => ({
      value: m.key,
      label: `${m.name ?? m.key}${m.primary ? ' (primary)' : ''}`,
      description: `${m.size[0]}×${m.size[1]}${standingOn === m.key ? ' · Stage is here' : ''}`,
    })),
  ]
  return (
    <SelectField
      label={label}
      hideLabel
      value={value ?? PRIMARY}
      onChange={(v) => onChange(v === PRIMARY ? null : v)}
      options={options}
      isDisabled={isDisabled}
      disabledReason={disabledReason}
      className="w-56"
    />
  )
}
