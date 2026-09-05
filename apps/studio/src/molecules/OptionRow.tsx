import { CheckboxField, IconButton, Text, TextField } from '@/atoms'
import { QUESTION } from '@/copy'

export interface OptionRowProps {
  index: number
  text: string
  correct: boolean
  onTextChange: (text: string) => void
  onCorrectChange: (correct: boolean) => void
  onRemove: () => void
  /** True when unticking this would leave no correct mark (§4.1). */
  isLastCorrect: boolean
  /** True when removing would leave fewer than two options. */
  isRequired: boolean
  error?: string | null | undefined
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  autoFocus?: boolean | undefined
}

/** One answer option in the question editor: letter · text · correct · remove. */
export function OptionRow({
  index,
  text,
  correct,
  onTextChange,
  onCorrectChange,
  onRemove,
  isLastCorrect,
  isRequired,
  error,
  isDisabled,
  disabledReason,
  autoFocus,
}: OptionRowProps) {
  return (
    <div className="grid grid-cols-[2rem_1fr_auto_auto] items-start gap-3">
      <div className="flex h-10 items-center justify-center rounded-[calc(var(--radius)/2)]" style={{ background: 'var(--surface-secondary)' }}>
        <Text variant="studio-label" tone={correct ? 'success' : 'muted'}>
          {String.fromCharCode(65 + index)}
        </Text>
      </div>
      <TextField
        label={QUESTION.option(index)}
        hideLabel
        value={text}
        onChange={onTextChange}
        error={error}
        isDisabled={isDisabled}
        disabledReason={disabledReason}
        autoFocus={autoFocus}
      />
      <div className="flex h-10 items-center">
        <CheckboxField
          label={QUESTION.correct}
          isSelected={correct}
          onChange={onCorrectChange}
          isDisabled={isDisabled}
          disabledReason={disabledReason ?? (isLastCorrect && correct ? QUESTION.lastCorrect : null)}
        />
      </div>
      <div className="flex h-10 items-center">
        <IconButton
          icon="remove"
          label={QUESTION.removeOption}
          size="sm"
          onPress={onRemove}
          isDisabled={isDisabled || isRequired}
          disabledReason={disabledReason ?? (isRequired ? QUESTION.optionsHint : null)}
        />
      </div>
    </div>
  )
}
