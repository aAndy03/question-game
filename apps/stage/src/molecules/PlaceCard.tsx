import { LAYOUT, SPACE } from '@questiongame/design-stage'
import { Rule, Text, insetFrame } from '@/atoms'
import { useCopy } from '@/copy'
import { placeLabel, scoreWithUnit } from '@/copy/format'

/**
 * One final-standings card, as the reference draws it:
 *
 *   PLACE_01
 *   TEAM ALPHA
 *   ─────────
 *   4,200 PTS
 *
 * The label is the competition rank, so tied teams read the same place.
 * The winner's card (rank 1) fills ink with a gold label. Hidden-but-mounted
 * until its rank is revealed (spec §2.6).
 */

export interface PlaceCardProps {
  nodeId: string
  rank: number
  name: string
  score: number
  winner?: boolean
  dimmed?: boolean
  revealed?: boolean
}

export function PlaceCard({ nodeId, rank, name, score, winner = false, dimmed = false, revealed = true }: PlaceCardProps) {
  const copy = useCopy()
  const tone = winner ? 'inverse' : dimmed ? 'muted' : 'heading'
  return (
    <div
      data-node-id={nodeId}
      data-rank={rank}
      data-winner={winner}
      data-revealed={revealed}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE[4],
        padding: `${SPACE[5]} ${SPACE[5]}`,
        minHeight: LAYOUT.placeCardHeight,
        boxSizing: 'border-box',
        background: winner ? 'var(--ink)' : 'var(--paper)',
        boxShadow: insetFrame('thin', winner ? 'var(--ink)' : dimmed ? 'var(--border-subtle)' : 'var(--border-default)'),
        opacity: dimmed && !winner ? 0.6 : 1,
        visibility: revealed ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-place-label" tone={tone} style={winner ? { color: 'var(--state-leader)' } : undefined}>
        {placeLabel(copy, rank)}
      </Text>
      <Text variant="stage-row-name" transition="swap" tone={tone} style={{ overflowWrap: 'anywhere' }}>
        {name}
      </Text>
      <Rule weight="thin" tone={winner ? 'subtle' : 'default'} />
      <Text variant="stage-card-figure" transition="count" tone={tone} style={{ fontVariantNumeric: 'tabular-nums', marginTop: 'auto' }}>
        {scoreWithUnit(copy, score)}
      </Text>
    </div>
  )
}
