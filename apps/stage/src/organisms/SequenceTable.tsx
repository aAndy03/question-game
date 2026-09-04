import { nodeId, teamById, type PlayStateForStage } from '@questiongame/contract'
import { SequenceRow } from '@/molecules'

/**
 * The playing order for this round: one row per team in ring order, keyed by
 * team id (never by index — contract §2). "Served" is derived from the round
 * invariant: a team has played this round once its token count reaches the
 * round index.
 */

export interface SequenceTableProps {
  state: PlayStateForStage
}

export function SequenceTable({ state }: SequenceTableProps) {
  const { ring } = state
  return (
    <div data-sequence-table style={{ display: 'flex', flexDirection: 'column' }}>
      {ring.order.map((teamId, index) => {
        const team = teamById(state, teamId)
        if (!team) return null
        const current = ring.currentTeamId === team.id
        return (
          <SequenceRow
            key={team.id}
            nodeId={nodeId('teamOrder', 'row', team.id)}
            index={index}
            name={team.name}
            shortCode={team.shortCode}
            score={team.score}
            current={current}
            served={!current && team.turnsTaken >= ring.roundIndex}
            dimmed={!team.active}
          />
        )
      })}
    </div>
  )
}
