import { useRef } from 'react'
import { NumberField, SegmentedField, Text } from '@/atoms'
import { RULES } from '@/copy'
import { PREVIEW } from '@/copy/preview'
import type { SpeedWindow } from '@/host/types'

export interface SpeedWindowFieldProps {
  value: SpeedWindow
  /** The countdown the cascade resolves to, so the field can say what the share means in seconds. */
  durationMs?: number | null | undefined
  onChange: (value: SpeedWindow) => void
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

const DEFAULT_MS = 10_000

/**
 * `scoring.speed_window` (P11.12) — where the speed bonus reaches zero.
 *
 * Two units, because the operator means two different things by "fast":
 *
 * - **a share of the clock** — "no bonus after a third of the time". The
 *   default is the whole clock, which is the formula that existed before this
 *   field did, so an untouched game pays exactly what it always paid.
 * - **fixed seconds** — "the bonus decays over ten seconds, whatever the
 *   clock". This is the one that makes the *same answer time* worth the same
 *   on every question: a per-question countdown override otherwise changes the
 *   denominator, so a one-second answer pays differently on a 30 s question
 *   and a 10 s one.
 *
 * The last value of each kind is remembered, so switching units and back
 * restores what the operator typed.
 */
export function SpeedWindowField({ value, durationMs, onChange, isDisabled, disabledReason }: SpeedWindowFieldProps) {
  const lastFraction = useRef(1)
  const lastMs = useRef(DEFAULT_MS)
  if (value.kind === 'fraction') lastFraction.current = value.value
  else lastMs.current = value.value

  const setKind = (kind: SpeedWindow['kind']) => {
    if (kind === value.kind) return
    onChange(kind === 'fraction' ? { kind, value: lastFraction.current } : { kind, value: lastMs.current })
  }

  const resolved =
    durationMs === null || durationMs === undefined
      ? null
      : value.kind === 'fraction'
        ? Math.round(durationMs * Math.min(1, Math.max(0, value.value)))
        : Math.min(value.value, durationMs)

  return (
    <div className="flex flex-col gap-2">
      <SegmentedField<SpeedWindow['kind']>
        label={RULES.speedWindow}
        hideLabel
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'fraction', label: RULES.speedWindowFraction },
          { value: 'ms', label: RULES.speedWindowMs },
        ]}
        isDisabled={isDisabled}
        disabledReason={disabledReason}
      />
      {value.kind === 'fraction' ? (
        <NumberField
          label={RULES.speedWindowFraction}
          hideLabel
          // A percentage on screen, a 0–1 share on the wire: the host's unit
          // is a share and stays a share, the operator types what they mean.
          value={Math.round(value.value * 100)}
          onChange={(percent) => onChange({ kind: 'fraction', value: Math.min(100, Math.max(1, percent ?? 100)) / 100 })}
          minValue={1}
          maxValue={100}
          step={1}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
      ) : (
        <NumberField
          label={RULES.speedWindowMs}
          hideLabel
          value={Math.round(value.value / 1000)}
          onChange={(secs) => onChange({ kind: 'ms', value: Math.max(1, secs ?? 1) * 1000 })}
          minValue={1}
          step={1}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
      )}
      {resolved !== null && durationMs !== null && durationMs !== undefined ? (
        <Text variant="studio-caption" tone="muted">
          {PREVIEW.timer.window(resolved, durationMs)}
        </Text>
      ) : null}
    </div>
  )
}
