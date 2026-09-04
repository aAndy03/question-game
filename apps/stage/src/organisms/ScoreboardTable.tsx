import { leaderboard, nodeId, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { ScoreRow } from '@/molecules'

/**
 * Mid-show standings: every team in finishing order, keyed by team id. The
 * rank shown is the host's competition rank (ties share it: 1, 1, 3); every
 * team at rank 1 wears the LEADER pill, so a shared lead shows two.
 */

export interface ScoreboardTableProps {
  state: PlayStateForStage
}

export function ScoreboardTable({ state }: ScoreboardTableProps) {
  return (
    <div data-scoreboard-table style={{ display: 'flex', flexDirection: 'column', gap: SPACE[4] }}>
      {leaderboard(state).map((team) => (
        <ScoreRow
          key={team.id}
          nodeId={nodeId('scoreboard', 'row', team.id)}
          rank={team.rank}
          name={team.name}
          score={team.score}
          leader={team.rank === 1}
          dimmed={!team.active}
        />
      ))}
    </div>
  )
}
