import { MeaningChip, NumberField, SliderField } from '@/atoms'
import { QUESTION } from '@/copy'
import { difficultyBand } from '@/host/types'

export interface DifficultyFieldProps {
  value: number
  onChange: (value: number) => void
  error?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
}

/** 1–100 as a number field and a slider, with the band chip (§4.6). */
export function DifficultyField({ value, onChange, error, isDisabled, disabledReason }: DifficultyFieldProps) {
  const band = difficultyBand(value)
  return (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[8rem_1fr_auto] items-end gap-4">
        <NumberField
          label={QUESTION.difficulty}
          value={value}
          onChange={(v) => onChange(Math.min(100, Math.max(1, v ?? 1)))}
          minValue={1}
          maxValue={100}
          error={error}
          isDisabled={isDisabled}
          disabledReason={disabledReason}
        />
        <div className="pb-2">
          <SliderField
            label={QUESTION.difficulty}
            hideLabel
            value={value}
            onChange={onChange}
            minValue={1}
            maxValue={100}
            isDisabled={isDisabled}
            disabledReason={disabledReason}
          />
        </div>
        <div className="pb-2.5">
          <MeaningChip meaning={band}>{QUESTION.band[band]}</MeaningChip>
        </div>
      </div>
    </div>
  )
}
