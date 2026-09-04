import { leaderboard, nodeId, type PlayStateForStage } from '@questiongame/contract'
import { ScoreRow } from '@/molecules'

/**
 * Mid-show standings: every team in finishing order, keyed by team id. The
 * rank shown is the host's competition rank (ties share it: 1, 1, 3); the
 * LEADER pill marks rank 1.
 */

export interface ScoreboardTableProps {
  state: PlayStateForStage
}

export function ScoreboardTable({ state }: ScoreboardTableProps) {
  return (
    <div data-scoreboard-table style={{ display: 'flex', flexDirection: 'column' }}>
      {leaderboard(state).map((team) => (
        <ScoreRow
          key={team.id}
          nodeId={nodeId('scoreboard', 'row', team.id)}
          rank={team.rank}
          name={team.name}
          shortCode={team.shortCode}
          score={team.score}
          leader={team.rank === 1}
          dimmed={!team.active}
        />
      ))}
    </div>
  )
}
