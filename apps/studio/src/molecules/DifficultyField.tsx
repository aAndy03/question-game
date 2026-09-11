import { MeaningChip, NumberField, SliderField } from '@/atoms'
import { QUESTION } from '@/copy'
import { difficultyBand } from '@/host/types'

export interface DifficultyFieldProps {
  /** `null` is *not set* — an incomplete question (§2.32). The first touch sets it. */
  value: number | null
  onChange: (value: number) => void
  error?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

/** 1–100 as a number field and a slider, with the band chip (§4.6) — or *Not set*. */
export function DifficultyField({ value, onChange, error, isDisabled, disabledReason }: DifficultyFieldProps) {
  const band = value === null ? null : difficultyBand(value)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[8rem_1fr_auto] items-end gap-4">
        <NumberField
          label={QUESTION.difficulty}
          value={value}
          onChange={(v) => {
            // Clearing the number is not a way back to *not set*: an unset
            // difficulty is a gap to close, not a value to choose.
            if (v !== null) onChange(Math.min(100, Math.max(1, v)))
          }}
          minValue={1}
          maxValue={100}
          error={error}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
        <div className={value === null ? 'pb-2 opacity-50' : 'pb-2'}>
          <SliderField
            label={QUESTION.difficulty}
            hideLabel
            value={value ?? 50}
            onChange={onChange}
            minValue={1}
            maxValue={100}
            isDisabled={isDisabled}
            disabledReason={disabledReason}
          />
        </div>
        <div className="pb-2.5">
          {band ? (
            <MeaningChip meaning={band}>{QUESTION.band[band]}</MeaningChip>
          ) : (
            <MeaningChip meaning="unset">{QUESTION.difficultyUnset}</MeaningChip>
          )}
        </div>
      </div>
    </div>
  )
}
