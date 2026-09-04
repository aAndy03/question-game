import type { ComponentType } from 'react'
import { STAGE_SCREENS, type PlayStateForStage, type StageScreen } from '@questiongame/contract'
import { Text } from '@/atoms'
import { DecorField, OverlayLayer, StageHeader } from '@/organisms'
import { StageFrame } from '@/templates'
import { IdlePage } from './Idle'
import { TeamOrderPage } from './TeamOrder'
import { ChooseDomainPage } from './ChooseDomain'
import { QuestionPage } from './Question'
import { ScoreboardPage } from './Scoreboard'
import { FinalLeaderboardPage } from './FinalLeaderboard'
import { CurrentTeamPage } from './CurrentTeam'

/**
 * The Stage tree. One frame for the life of the window; the persistent slots
 * (header, decor) mount here, outside any page, so a screen change swaps only
 * the body (contract §3). The page for the current screen comes from the
 * registry — adding a screen is one page file plus one entry.
 */

export interface StagePageProps {
  state: PlayStateForStage
}

const PAGES: Partial<Record<StageScreen, ComponentType<StagePageProps>>> = {
  idle: IdlePage,
  teamOrder: TeamOrderPage,
  chooseDomain: ChooseDomainPage,
  question: QuestionPage,
  scoreboard: ScoreboardPage,
  finalLeaderboard: FinalLeaderboardPage,
  currentTeam: CurrentTeamPage,
}

/** Screens with a page built. Tests assert the registry against the contract. */
export const BUILT_SCREENS = STAGE_SCREENS.filter((s) => s in PAGES)

function Unbuilt({ state }: StagePageProps) {
  return (
    <section data-page="unbuilt" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center' }}>
      <Text variant="stage-hud" tone="muted">
        {`${state.currentScreen} // not built yet`}
      </Text>
    </section>
  )
}

export interface StageRootProps {
  state: PlayStateForStage
}

export function StageRoot({ state }: StageRootProps) {
  const Page = PAGES[state.currentScreen] ?? Unbuilt
  return (
    <StageFrame
      screen={state.currentScreen}
      header={<StageHeader state={state} />}
      decor={<DecorField state={state} />}
      overlay={<OverlayLayer state={state} />}
    >
      <Page state={state} />
    </StageFrame>
  )
}
