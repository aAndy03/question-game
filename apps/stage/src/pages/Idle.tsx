import { nodeId, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Tag, Text, Wordmark } from '@/atoms'
import { resolveCopy } from '@/copy'
import { hud } from '@/copy/format'

/**
 * Idle — nothing playing yet. The wordmark holds the audience.
 *
 * The body is a left column: eyebrow, wordmark, tagline, then a status pill
 * beside the session line. Everything except the wordmark is authored copy
 * (operator-editable later); nothing here is derived from the Play, which is
 * why the page barely reads `state`. The scatter on the right is the
 * persistent decor layer, laid out by the frame, not by this page.
 */

export interface IdlePageProps {
  state: PlayStateForStage
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- the page signature is uniform across the registry
export function IdlePage(_props: IdlePageProps) {
  const copy = resolveCopy()
  return (
    <section
      data-page="idle"
      data-decor-solid
      style={{
        flex: '1 1 auto',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'flex-start',
        gap: SPACE[4],
        width: 'fit-content',
        maxWidth: '50%',
      }}
    >
      <Text as="p" variant="stage-eyebrow" nodeId={nodeId('idle', 'eyebrow')}>
        {copy.idleEyebrow}
      </Text>

      <Wordmark nodeId={nodeId('idle', 'wordmark')} />

      <Text as="p" variant="stage-tagline" nodeId={nodeId('idle', 'tagline')}>
        {copy.idleTagline}
      </Text>

      <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[3], marginTop: SPACE[3] }}>
        <span data-node-id={nodeId('idle', 'status')}>
          <Tag tone="ink">{copy.idleStatus}</Tag>
        </span>
        <Text variant="stage-code" tone="muted" nodeId={nodeId('idle', 'session')}>
          {hud(copy.sessionLabel, copy.sessionValue)}
        </Text>
      </div>
    </section>
  )
}
