import { nodeId } from '@questiongame/contract'
import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { resolveCopy } from '@/copy'
import { ScreenTitle } from '@/molecules'
import { SequenceTable } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * TeamOrder - the playing sequence and whose turn it is. Title over the
 * sequence table in the left column; the scatter lives in the frame's decor
 * layer on the right.
 */
export function TeamOrderPage({ state }: StagePageProps) {
  const copy = resolveCopy()
  return (
    <section
      data-page="teamOrder"
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: SPACE[4],
        width: LAYOUT.contentColumn,
        maxWidth: '100%',
      }}
    >
      <ScreenTitle nodeId={nodeId('teamOrder', 'title')} title={copy.screenTitle.teamOrder} />
      <SequenceTable state={state} />
    </section>
  )
}
