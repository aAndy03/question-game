import { nodeId, type PlayStateForStage, type StageSession } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { optionLetter } from '@/copy/format'
import { AnswerOption, type AnswerOptionState } from '@/molecules'

/**
 * The answer cards for the issued question. State per card is derived from
 * the session, in precedence order: outcome (correct / incorrect) → lock →
 * working selection → neutral. Reveal state comes from `reveals.optionIds`,
 * a list of ids, so out-of-order reveals point at the right card.
 *
 * Renders an empty grid with no session so the node stays mounted.
 */

export interface AnswerGridProps {
  state: PlayStateForStage
  columns?: number
}

export function optionState(session: StageSession, optionId: string): AnswerOptionState {
  const { outcome, reveals, lockedOptionIds, selectedOptionIds } = session
  const chosen = lockedOptionIds ?? selectedOptionIds
  const picked = chosen.includes(optionId)

  if (outcome && reveals.outcome) {
    if (outcome.correctOptionIds.includes(optionId)) return 'correct'
    return picked ? 'incorrect' : 'dim'
  }
  if (lockedOptionIds !== null) return picked ? 'selected' : 'dim'
  if (selectedOptionIds.length > 0) return picked ? 'selected' : 'neutral'
  return 'neutral'
}

export function AnswerGrid({ state, columns = 2 }: AnswerGridProps) {
  const session = state.session
  return (
    <div
      data-answer-grid
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: SPACE[4],
      }}
    >
      {session
        ? session.options.map((o, i) => (
            <AnswerOption
              key={o.id}
              nodeId={nodeId('question', 'option', o.id)}
              letter={optionLetter(i)}
              text={o.text}
              state={optionState(session, o.id)}
              revealed={session.reveals.optionIds.includes(o.id)}
            />
          ))
        : null}
    </div>
  )
}
