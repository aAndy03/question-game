import { SPACE } from '@questiongame/design-stage'
import { Tag, Text, insetBorder } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { TeamChip } from './TeamChip'

/**
 * One standings row: rank · team · score, with an optional LEADER pill. Used
 * by the Scoreboard and, revealed one rank at a time, by the FinalLeaderboard.
 *
 * `revealed=false` keeps the row mounted but invisible (spec §2.6: nodes must
 * not unmount to hide), so a later reveal animates the same DOM node.
 */

export interface ScoreRowProps {
  nodeId: string
  rank: number
  name: string
  shortCode: string
  score: number
  leader?: boolean
  dimmed?: boolean
  revealed?: boolean
}

export function ScoreRow({
  nodeId,
  rank,
  name,
  shortCode,
  score,
  leader = false,
  dimmed = false,
  revealed = true,
}: ScoreRowProps) {
  return (
    <div
      data-node-id={nodeId}
      data-rank={rank}
      data-revealed={revealed}
      style={{
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto auto',
        alignItems: 'center',
        gap: SPACE[5],
        padding: `${SPACE[4]} 0`,
        boxShadow: insetBorder({ bottom: 'thin' }, 'var(--border-subtle)'),
        background: leader ? 'var(--state-leader)' : 'transparent',
        visibility: revealed ? 'visible' : 'hidden',
      }}
    >
      <Text variant="stage-number" tone={dimmed ? 'muted' : 'heading'} style={{ minWidth: '2ch', textAlign: 'right' }}>
        {rank}
      </Text>
      <TeamChip name={name} shortCode={shortCode} dimmed={dimmed} size="lg" />
      <span style={{ visibility: leader ? 'visible' : 'hidden' }}>
        <Tag tone="ink">{STAGE_COPY.leaderTag}</Tag>
      </span>
      <Text variant="stage-number" transition="count" tone={dimmed ? 'muted' : 'heading'} style={{ fontVariantNumeric: 'tabular-nums' }}>
        {score}
      </Text>
    </div>
  )
}
