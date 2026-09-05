import { leaderboard, nodeId } from '@questiongame/contract'
import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { Rule, Text } from '@/atoms'
import { resolveCopy } from '@/copy'
import { hud } from '@/copy/format'
import { LeaderboardList } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * FinalLeaderboard - the end of the Play, revealed lowest place first.
 *
 *   tournament champion //
 *   TEAM ALPHA                     ← shown once rank 1 is revealed; a shared
 *   ──────────────────────────       lead names every champion
 *   [PLACE_01] [PLACE_02] [PLACE_03] [PLACE_03]
 *
 * The champion line is derived: every team at competition rank 1, joined by
 * authored copy. It stays mounted and hidden until its rank is revealed,
 * like the cards (spec §2.6).
 */
export function FinalLeaderboardPage({ state }: StagePageProps) {
  const copy = resolveCopy()
  const champions = leaderboard(state).filter((t) => t.rank === 1)
  const championShown = state.leaderboardRevealedRanks.includes(1) && champions.length > 0

  return (
    <section
      data-page="finalLeaderboard"
      data-decor-solid
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: SPACE[5],
        width: LAYOUT.contentColumnWide,
        maxWidth: '100%',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE[2] }}>
        <Text variant="stage-hud" tone="heading" nodeId={nodeId('finalLeaderboard', 'title')}>
          {hud(copy.screenTitle.finalLeaderboard)}
        </Text>
        <Text
          as="h1"
          variant="stage-champion"
          transition="swap"
          tone="heading"
          nodeId={nodeId('finalLeaderboard', 'champion')}
          style={{ visibility: championShown ? undefined : 'hidden', overflowWrap: 'anywhere' }}
        >
          {champions.map((t) => t.name).join(copy.championJoiner)}
        </Text>
      </div>
      <Rule weight="thin" />
      <LeaderboardList state={state} />
    </section>
  )
}
