import { leaderboard, nodeId, type PlayStateForStage } from '@questiongame/contract'
import { ScoreRow } from '@/molecules'

/**
 * Final standings, revealed lowest place first (spec §5.5).
 *
 * Node ids key off the 1-based *position* in finishing order, so two tied
 * teams still get distinct ids (`finalLeaderboard.row.1` and `.row.2`); the
 * rank they *display* is the shared competition rank. A row is revealed when
 * its competition rank is in `leaderboardRevealedRanks`, so tied teams reveal
 * together.
 *
 * Every row stays mounted while hidden — reveal state lives here, on the
 * organism, never in the row (roadmap atomic rule 4).
 */

export interface LeaderboardListProps {
  state: PlayStateForStage
}

export function LeaderboardList({ state }: LeaderboardListProps) {
  const revealedRanks = state.leaderboardRevealedRanks
  return (
    <div data-leaderboard-list style={{ display: 'flex', flexDirection: 'column' }}>
      {leaderboard(state).map((team, i) => (
        <ScoreRow
          key={team.id}
          nodeId={nodeId('finalLeaderboard', 'row', i + 1)}
          rank={team.rank}
          name={team.name}
          shortCode={team.shortCode}
          score={team.score}
          leader={team.rank === 1}
          dimmed={!team.active}
          revealed={revealedRanks.includes(team.rank)}
        />
      ))}
    </div>
  )
}
