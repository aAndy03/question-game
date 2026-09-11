import { currentTeam, nodeId, teamById, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Text } from '@/atoms'
import { useCopy } from '@/copy'
import { hud } from '@/copy/format'
import { TeamMark } from '@/molecules'

/**
 * The current-team block:
 *
 *              QUESTION 20
 *        [A]  TEAM ALPHA
 *        DOMAIN // TECHNOLOGY 10
 *
 * Shared by the CurrentTeam screen and the `current-team` overlay, so the
 * operator can call it over any screen and it reads the same. The counter
 * is `questionsIssued`; the team is the token holder unless the overlay
 * names one; the domain line reads the issued question's domain and
 * difficulty and stays mounted but hidden while no question is issued.
 * Node ids are carried only on the screen, never on the overlay.
 */

export interface CurrentTeamBlockProps {
  state: PlayStateForStage
  /** A specific team (overlay request); defaults to the token holder. */
  teamId?: string | null | undefined
  /** Carry the `currentTeam.*` node ids (the screen does, the overlay does not). */
  withNodeIds?: boolean
}

export function CurrentTeamBlock({ state, teamId = null, withNodeIds = false }: CurrentTeamBlockProps) {
  const copy = useCopy()
  const team = teamId ? (teamById(state, teamId) ?? null) : currentTeam(state)
  const session = state.session
  const domain = state.domains.find((d) => d.id === session?.domainId) ?? null
  const domainLine = domain && session ? `${domain.name} ${session.difficulty}` : null
  const id = (slot: 'question' | 'mark' | 'teamName' | 'domain') => (withNodeIds ? nodeId('currentTeam', slot) : undefined)

  return (
    <div data-decor-solid data-current-team-block style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[4], textAlign: 'center' }}>
      <Text variant="stage-code" tone="heading" nodeId={id('question')}>
        {`${copy.questionLabel} ${state.questionsIssued}`}
      </Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3] }}>
        {team ? <TeamMark nodeId={id('mark')} shortCode={team.shortCode} name={team.name} color={team.color} /> : null}
        <Text as="h1" variant="stage-hero" transition="swap" tone="heading" nodeId={id('teamName')}>
          {team?.name ?? ''}
        </Text>
      </div>
      <Text
        variant="stage-hud-large"
        transition="swap"
        tone="heading"
        nodeId={id('domain')}
        style={{ visibility: domainLine ? undefined : 'hidden', marginTop: SPACE[3] }}
      >
        {hud(copy, copy.domainLabel, domainLine)}
      </Text>
    </div>
  )
}
