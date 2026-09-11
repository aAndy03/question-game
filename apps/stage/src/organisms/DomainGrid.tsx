import { nodeId, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { useCopy } from '@/copy'
import { difficultyFigure } from '@/copy/format'
import { DomainCard } from '@/molecules'

/**
 * The domain board. Every domain in the snapshot is a card keyed by domain id;
 * the selected one is the domain of the current session, if any. Exhausted
 * domains stay on the board, dimmed.
 */

export interface DomainGridProps {
  state: PlayStateForStage
  columns?: number
}

export function DomainGrid({ state, columns = 3 }: DomainGridProps) {
  const copy = useCopy()
  const selectedId = state.session?.domainId ?? null
  return (
    <div
      data-domain-grid
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: SPACE[4],
      }}
    >
      {state.domains.map((d) => (
        <DomainCard
          key={d.id}
          nodeId={nodeId('chooseDomain', 'card', d.id)}
          name={d.name}
          difficulty={d.nextDifficulty === null ? null : difficultyFigure(copy, d.nextDifficulty)}
          code={d.code}
          selected={d.id === selectedId}
          exhausted={d.exhausted}
        />
      ))}
    </div>
  )
}
