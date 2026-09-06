import { Text, TransportButton } from '@/atoms'
import { SESSION } from '@/copy'

export interface RevealControlsProps {
  stemRevealed: boolean
  optionsRevealed: number
  optionsTotal: number
  outcomeRevealed: boolean
  locked: boolean
  /** From `revealModes`: an auto channel greys its button (the host drives it). */
  autoStem: boolean
  autoAnswers: boolean
  isDisabled?: boolean | undefined
  disabledReason?: string | null | undefined
  kbd?: { stem?: string | undefined; option?: string | undefined; outcome?: string | undefined; lock?: string | undefined } | undefined
  onRevealStem: () => void
  onRevealOption: () => void
  onLock: () => void
  onRevealOutcome: () => void
}

/** Stem → answers → lock → outcome, in the order the show goes (spec §5.3). */
export function RevealControls({
  stemRevealed,
  optionsRevealed,
  optionsTotal,
  outcomeRevealed,
  locked,
  autoStem,
  autoAnswers,
  isDisabled,
  disabledReason,
  kbd,
  onRevealStem,
  onRevealOption,
  onLock,
  onRevealOutcome,
}: RevealControlsProps) {
  const allOptions = optionsRevealed >= optionsTotal
  return (
    <div className="flex flex-wrap items-center gap-2" data-reveal-controls>
      <TransportButton
        icon="eye"
        label={SESSION.revealStem}
        state={stemRevealed ? 'active' : 'rest'}
        onPress={onRevealStem}
        isDisabled={isDisabled || stemRevealed || autoStem}
        disabledReason={disabledReason ?? (autoStem ? 'Auto' : null)}
        kbd={kbd?.stem}
      />
      <div className="flex items-center gap-1.5">
        <TransportButton
          icon="listCheck"
          label={SESSION.revealOption}
          onPress={onRevealOption}
          isDisabled={isDisabled || allOptions || autoAnswers}
          disabledReason={disabledReason ?? (autoAnswers ? 'Auto' : null)}
          kbd={kbd?.option}
        />
        <Text variant="studio-mono" tone="muted" tabular>
          {`${optionsRevealed}/${optionsTotal}`}
        </Text>
      </div>
      <TransportButton
        icon="lock"
        label={SESSION.lock}
        state={locked ? 'active' : 'rest'}
        withLabel
        onPress={onLock}
        isDisabled={isDisabled || locked || outcomeRevealed}
        disabledReason={disabledReason}
        kbd={kbd?.lock}
      />
      <TransportButton
        icon="correct"
        label={SESSION.revealOutcome}
        state={outcomeRevealed ? 'active' : 'rest'}
        withLabel
        onPress={onRevealOutcome}
        isDisabled={isDisabled || outcomeRevealed}
        disabledReason={disabledReason}
        kbd={kbd?.outcome}
      />
    </div>
  )
}
