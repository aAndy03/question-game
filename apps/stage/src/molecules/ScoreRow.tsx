import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { Rule, Tag, Text, insetFrame } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { scoreWithUnit } from '@/copy/format'

/**
 * One standings row, as the reference draws it:
 *
 *   01 | TEAM ALPHA  [LEADER]                              2,400 PTS
 *
 * The leader row (competition rank 1; several rows when the lead is shared)
 * fills ink with gold points and a gold pill; every other row is a 1px
 * frame. The rank shown is the host's competition rank, so tied teams read
 * the same number.
 *
 * `revealed=false` keeps the row mounted but invisible (spec §2.6).
 */

export interface ScoreRowProps {
  nodeId: string
  /** Competition rank. */
  rank: number
  name: string
  score: number
  leader?: boolean
  dimmed?: boolean
  revealed?: boolean
}

export function ScoreRow({ nodeId, rank, name, score, leader = false, dimmed = false, revealed = true }: ScoreRowProps) {
  const tone = leader ? 'inverse' : dimmed ? 'muted' : 'heading'
  return (
    <div
      data-node-id={nodeId}
      data-rank={rank}
      data-leader={leader}
      data-revealed={revealed}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[4],
        padding: `0 ${SPACE[4]}`,
        minHeight: LAYOUT.scoreRowHeight,
        boxSizing: 'border-box',
        background: leader ? 'var(--ink)' : 'var(--paper)',
        boxShadow: insetFrame('thin', leader ? 'var(--ink)' : dimmed ? 'var(--border-subtle)' : 'var(--border-default)'),
        opacity: dimmed && !leader ? 0.6 : 1,
        visibility: revealed ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-row-number" tone={tone} style={{ minWidth: '2ch' }}>
        {String(rank).padStart(STAGE_COPY.sequenceDigits, '0')}
      </Text>
      <Rule orientation="vertical" weight="thin" tone={leader || dimmed ? 'subtle' : 'default'} />
      <Text
        variant="stage-row-name"
        transition="swap"
        tone={tone}
        style={{ minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
      >
        {name}
      </Text>
      <span style={{ visibility: leader ? undefined : 'hidden' }}>
        <Tag tone="leader">{STAGE_COPY.leaderTag}</Tag>
      </span>
      <Text
        variant="stage-answer"
        transition="count"
        tone={tone}
        style={{ marginLeft: 'auto', fontVariantNumeric: 'tabular-nums', color: leader ? 'var(--state-leader)' : undefined }}
      >
        {scoreWithUnit(score)}
      </Text>
    </div>
  )
}
