import { SPACE } from '@questiongame/design-stage'
import { Rule, Text, insetFrame } from '@/atoms'
import { useCopy } from '@/copy'
import { sequencePosition } from '@/copy/format'

/**
 * One row of the playing order, as the reference draws it:
 *
 *   01 │ TEAM ALPHA                         REGION        CURRENT POINTS
 *                                            MOLDOVA                   0
 *
 * The position is derived from the ring index; the detail and score from
 * the team; the two small labels are authored copy. The current row fills
 * gold with a 2px frame; every other row is paper with a 1px frame.
 */

export interface SequenceRowProps {
  nodeId: string
  /** 0-based position in the ring. */
  index: number
  name: string
  /** The team's catalog detail line; null hides the stack. */
  detail: string | null
  score: number
  current?: boolean
  /** Already played this round. */
  served?: boolean
  dimmed?: boolean
}

function MetaStack({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'muted' }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', gap: 'var(--space-1)', minWidth: 'calc(var(--space-8) + var(--space-5))' }}>
      <Text variant="stage-meta-label" tone={tone}>
        {label}
      </Text>
      <Text variant="stage-meta-value" transition="count" tone={tone === 'muted' ? 'muted' : 'heading'}>
        {value}
      </Text>
    </span>
  )
}

export function SequenceRow({ nodeId, index, name, detail, score, current = false, served = false, dimmed = false }: SequenceRowProps) {
  const copy = useCopy()
  const tone = dimmed ? 'muted' : 'primary'
  return (
    <div
      data-node-id={nodeId}
      data-current={current}
      data-served={served}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[4],
        padding: `${SPACE[3]} ${SPACE[4]}`,
        minHeight: 'calc(var(--space-8) + var(--space-3))',
        boxSizing: 'border-box',
        background: current ? 'var(--state-leader)' : 'var(--paper)',
        boxShadow: insetFrame(current ? 'thick' : 'thin', dimmed ? 'var(--border-subtle)' : 'var(--border-default)'),
      }}
    >
      <Text variant="stage-row-number" tone={dimmed ? 'muted' : 'heading'} style={{ minWidth: '2ch' }}>
        {sequencePosition(copy, index)}
      </Text>
      <Rule orientation="vertical" weight="thin" tone={dimmed ? 'subtle' : 'default'} />
      <Text
        variant="stage-row-name"
        transition="swap"
        tone={dimmed ? 'muted' : 'heading'}
        style={{ flex: '1 1 auto', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </Text>
      {detail !== null ? <MetaStack label={copy.teamDetailLabel} value={detail} tone={tone} /> : null}
      <MetaStack label={copy.teamPointsLabel} value={String(score)} tone={tone} />
    </div>
  )
}
