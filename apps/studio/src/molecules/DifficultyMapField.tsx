import { useRef } from 'react'
import { Button, IconButton, NumberField, SegmentedField, Text } from '@/atoms'
import { SETTINGS } from '@/copy/settings'
import type { DifficultyBand, DifficultyMap } from '@/host/types'

export interface DifficultyMapFieldProps {
  value: DifficultyMap
  onChange: (value: DifficultyMap) => void
  error?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

const DEFAULT_FACTOR = 10
const DEFAULT_BANDS: readonly DifficultyBand[] = [
  { up_to: 33, points: 10 },
  { up_to: 66, points: 20 },
  { up_to: 100, points: 30 },
]

function sorted(bands: readonly DifficultyBand[]): DifficultyBand[] {
  return [...bands].sort((a, b) => a.up_to - b.up_to)
}

/**
 * The `scoring.difficulty_map` control: linear (points per difficulty
 * point) or bands (an editable table of `up_to` → `points`). Bands leave
 * here sorted by `up_to`; the last kind of each is kept so switching back
 * restores what the operator typed.
 */
export function DifficultyMapField({ value, onChange, error, isDisabled, disabledReason }: DifficultyMapFieldProps) {
  const lastFactor = useRef(DEFAULT_FACTOR)
  const lastBands = useRef<readonly DifficultyBand[]>(DEFAULT_BANDS)
  if (value.kind === 'linear') lastFactor.current = value.factor
  else lastBands.current = value.bands

  const setKind = (kind: DifficultyMap['kind']) => {
    if (kind === value.kind) return
    onChange(kind === 'linear' ? { kind, factor: lastFactor.current } : { kind, bands: sorted(lastBands.current) })
  }
  const setBands = (bands: readonly DifficultyBand[]) => onChange({ kind: 'bands', bands: sorted(bands) })
  const bands = value.kind === 'bands' ? value.bands : []
  const last = bands[bands.length - 1]
  const addBand = () =>
    setBands([...bands, { up_to: Math.min(100, (last?.up_to ?? 0) + 10), points: (last?.points ?? 0) + 10 }])

  return (
    <div className="flex flex-col gap-3">
      <SegmentedField<DifficultyMap['kind']>
        label={SETTINGS.difficultyMap.kind}
        hideLabel
        value={value.kind}
        onChange={setKind}
        options={[
          { value: 'linear', label: SETTINGS.difficultyMap.linear },
          { value: 'bands', label: SETTINGS.difficultyMap.bands },
        ]}
        isDisabled={isDisabled}
        disabledReason={disabledReason}
      />
      {/* A number keeps a number's width, even in a wide setting row (P20). */}
      {value.kind === 'linear' ? (
        <div className="max-w-xs">
          <NumberField
            label={SETTINGS.difficultyMap.factor}
            value={value.factor}
            onChange={(factor) => onChange({ kind: 'linear', factor: Math.max(0, factor ?? 0) })}
            minValue={0}
            step={0.5}
            error={error}
            isDisabled={isDisabled}
            disabledReason={disabledReason}
          />
        </div>
      ) : (
        <div className="flex max-w-md flex-col gap-2" role="group" aria-label={SETTINGS.difficultyMap.bands}>
          <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-2">
            <Text variant="studio-caption" tone="muted">
              {SETTINGS.difficultyMap.upTo}
            </Text>
            <Text variant="studio-caption" tone="muted">
              {SETTINGS.difficultyMap.points}
            </Text>
          </div>
          {bands.map((band, i) => (
            <div key={i} className="grid grid-cols-[1fr_1fr_2.5rem] items-center gap-2" data-band-row>
              <NumberField
                label={`${SETTINGS.difficultyMap.band(i)} ${SETTINGS.difficultyMap.upTo}`}
                hideLabel
                value={band.up_to}
                onChange={(up_to) => setBands(bands.map((b, j) => (j === i ? { ...b, up_to: Math.min(100, Math.max(1, up_to ?? 1)) } : b)))}
                minValue={1}
                maxValue={100}
                isDisabled={isDisabled}
                disabledReason={disabledReason}
              />
              <NumberField
                label={`${SETTINGS.difficultyMap.band(i)} ${SETTINGS.difficultyMap.points}`}
                hideLabel
                value={band.points}
                onChange={(points) => setBands(bands.map((b, j) => (j === i ? { ...b, points: Math.max(0, points ?? 0) } : b)))}
                minValue={0}
                isDisabled={isDisabled}
                disabledReason={disabledReason}
              />
              <IconButton
                icon="remove"
                label={SETTINGS.difficultyMap.removeBand}
                size="sm"
                onPress={() => setBands(bands.filter((_, j) => j !== i))}
                isDisabled={isDisabled || bands.length <= 1}
                disabledReason={disabledReason ?? (bands.length <= 1 ? SETTINGS.difficultyMap.lastBand : null)}
              />
            </div>
          ))}
          <div className="flex items-center justify-between gap-3">
            <Button size="sm" variant="secondary" icon="add" onPress={addBand} isDisabled={isDisabled || (last?.up_to ?? 0) >= 100} disabledReason={disabledReason}>
              {SETTINGS.difficultyMap.addBand}
            </Button>
            {error ? (
              <Text variant="studio-caption" tone="danger">
                {error}
              </Text>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
