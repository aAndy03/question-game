import { leaderboard, nodeId, type PlayStateForStage } from '@questiongame/contract'
import { LAYOUT } from '@questiongame/design-stage'
import { PlaceCard } from '@/molecules'

/**
 * Final standings as a row of place cards, revealed lowest place first
 * (spec §5.5).
 *
 * Node ids key off the 1-based *position* in finishing order, so two tied
 * teams still get distinct ids; the label they show is the shared
 * competition rank. A card is revealed when its rank is in
 * `leaderboardRevealedRanks`, so tied teams reveal together. More than four
 * teams wrap onto further rows.
 *
 * Every card stays mounted while hidden: reveal state lives here, on the
 * organism, never in the card (roadmap atomic rule 4).
 */

export interface LeaderboardListProps {
  state: PlayStateForStage
  columns?: number
}

export function LeaderboardList({ state, columns = 4 }: LeaderboardListProps) {
  const revealed = state.leaderboardRevealedRanks
  return (
    <div
      data-leaderboard-list
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gap: LAYOUT.placeCardGap,
      }}
    >
      {leaderboard(state).map((team, i) => (
        <PlaceCard
          key={team.id}
          nodeId={nodeId('finalLeaderboard', 'row', i + 1)}
          rank={team.rank}
          name={team.name}
          score={team.score}
          winner={team.rank === 1}
          dimmed={!team.active}
          revealed={revealed.includes(team.rank)}
        />
      ))}
    </div>
  )
}
