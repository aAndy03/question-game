import { currentTeam, nodeId } from '@questiongame/contract'
import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { useCopy } from '@/copy'
import { ScreenTitle } from '@/molecules'
import { DomainGrid } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * ChooseDomain - the board for the team on token. Title names the team;
 * the grid fills the content column; the scatter is in the decor layer.
 */
export function ChooseDomainPage({ state }: StagePageProps) {
  const copy = useCopy()
  return (
    <section
      data-page="chooseDomain"
      data-decor-solid
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: SPACE[4],
        width: LAYOUT.contentColumnWide,
        maxWidth: '100%',
      }}
    >
      <ScreenTitle nodeId={nodeId('chooseDomain', 'title')} title={copy.screenTitle.chooseDomain} subject={currentTeam(state)?.name} />
      <DomainGrid state={state} columns={3} />
    </section>
  )
}
