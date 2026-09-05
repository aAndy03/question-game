import { currentTeam, nodeId } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Text } from '@/atoms'
import { resolveCopy } from '@/copy'
import { hud } from '@/copy/format'
import { TeamMark } from '@/molecules'
import type { StagePageProps } from './StageRoot'

/**
 * CurrentTeam - the handoff interstitial as a full screen:
 *
 *              QUESTION 20
 *        [A]  TEAM ALPHA
 *        DOMAIN // TECHNOLOGY 10
 *
 * The counter is `questionsIssued`; the team is the token holder; the domain
 * line names the issued question's domain and its difficulty, and stays
 * mounted but hidden while no question is issued. No header on this screen.
 */
export function CurrentTeamPage({ state }: StagePageProps) {
  const copy = resolveCopy()
  const team = currentTeam(state)
  const session = state.session
  const domain = state.domains.find((d) => d.id === session?.domainId) ?? null
  const domainLine = domain && session ? `${domain.name} ${session.difficulty}` : null

  return (
    <section
      data-page="currentTeam"
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE[4],
        textAlign: 'center',
      }}
    >
      <div data-decor-solid style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[4] }}>
      <Text variant="stage-code" tone="heading" nodeId={nodeId('currentTeam', 'question')}>
        {`${copy.questionLabel} ${state.questionsIssued}`}
      </Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3] }}>
        {team ? <TeamMark nodeId={nodeId('currentTeam', 'mark')} shortCode={team.shortCode} name={team.name} color={team.color} /> : null}
        <Text as="h1" variant="stage-hero" transition="swap" tone="heading" nodeId={nodeId('currentTeam', 'teamName')}>
          {team?.name ?? ''}
        </Text>
      </div>
      <Text
        variant="stage-hud-large"
        transition="swap"
        tone="heading"
        nodeId={nodeId('currentTeam', 'domain')}
        style={{ visibility: domainLine ? undefined : 'hidden', marginTop: SPACE[3] }}
      >
        {hud(copy.domainLabel, domainLine)}
      </Text>
      </div>
    </section>
  )
}
