import { SPACE } from '@questiongame/design-stage'
import { Tag, Text, insetBorder } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { sequencePosition } from '@/copy/format'
import { TeamChip } from './TeamChip'

/**
 * One row of the playing order: `G1 · TEAM ALPHA · score`. The position
 * label is derived from the ring index; the CURRENT pill marks the token
 * holder. Nothing here is a fixed team.
 */

export interface SequenceRowProps {
  nodeId: string
  /** 0-based position in the ring. */
  index: number
  name: string
  shortCode: string
  score: number
  current?: boolean
  /** Already played this round. */
  served?: boolean
  dimmed?: boolean
}

export function SequenceRow({
  nodeId,
  index,
  name,
  shortCode,
  score,
  current = false,
  served = false,
  dimmed = false,
}: SequenceRowProps) {
  return (
    <div
      data-node-id={nodeId}
      data-current={current}
      data-served={served}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        gap: SPACE[5],
        padding: `${SPACE[4]} ${SPACE[3]}`,
        boxShadow: current ? insetBorder({ top: 'thin', right: 'thin', bottom: 'thick', left: 'thin' }) : insetBorder({ bottom: 'thin' }, 'var(--border-subtle)'),
      }}
    >
      <Text variant="stage-code" tone={dimmed ? 'muted' : 'primary'}>
        {sequencePosition(index)}
      </Text>
      <TeamChip name={name} shortCode={shortCode} dimmed={dimmed} emphasised={current} />
      <span style={{ visibility: current ? 'visible' : 'hidden' }}>
        <Tag tone="ink">{STAGE_COPY.currentTag}</Tag>
      </span>
      <Text variant="stage-heading" transition="count" tone={dimmed ? 'muted' : 'heading'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </Text>
    </div>
  )
}
