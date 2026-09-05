import { CurrentTeamBlock } from '@/organisms'
import type { StagePageProps } from './StageRoot'

/**
 * CurrentTeam - the handoff interstitial as a full screen. The block is
 * shared with the `current-team` overlay; the screen carries the node ids.
 * No header on this screen.
 */
export function CurrentTeamPage({ state }: StagePageProps) {
  return (
    <section
      data-page="currentTeam"
      style={{ flex: '1 1 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}
    >
      <CurrentTeamBlock state={state} withNodeIds />
    </section>
  )
}
