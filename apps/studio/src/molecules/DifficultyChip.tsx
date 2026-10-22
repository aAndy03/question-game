import { MeaningChip } from '@/atoms'
import { QUESTION } from '@/copy'
import { difficultyBand } from '@/host/types'

/** A difficulty in words and number — `Easy · 20` — or *Not set*. */
export function difficultyLabel(difficulty: number | null, unset: string = QUESTION.difficultyUnset): string {
  return difficulty === null ? unset : `${QUESTION.band[difficultyBand(difficulty)]} · ${difficulty}`
}

export interface DifficultyChipProps {
  difficulty: number | null
  /** What an unset difficulty says; *Not set* unless the place needs the noun too. */
  unset?: string | undefined
}

/**
 * The one difficulty pill (P20): the band's colour, its word and the number,
 * wherever a question is listed — the Board, the pickers, the managers, the
 * import dialog and the Questions list. One spelling, so `Easy · 20` reads the
 * same on every tab and a list needs no separate number column.
 */
export function DifficultyChip({ difficulty, unset }: DifficultyChipProps) {
  return <MeaningChip meaning={difficulty === null ? 'unset' : difficultyBand(difficulty)}>{difficultyLabel(difficulty, unset)}</MeaningChip>
}
