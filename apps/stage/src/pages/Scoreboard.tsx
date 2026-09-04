import { nodeId } from '@questiongame/contract'
import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { resolveCopy } from '@/copy'
import { ScreenTitle } from '@/molecules'
import { ScoreboardTable } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * Scoreboard - standings mid-show. Title over the standings rows in the
 * content column; the scoreboard shapes live in the decor layer on the right.
 */
export function ScoreboardPage({ state }: StagePageProps) {
  const copy = resolveCopy()
  return (
    <section
      data-page="scoreboard"
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
      <ScreenTitle nodeId={nodeId('scoreboard', 'title')} title={copy.screenTitle.scoreboard} />
      <ScoreboardTable state={state} />
    </section>
  )
}
