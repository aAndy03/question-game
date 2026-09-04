import type { OutcomeVerdict } from '@questiongame/contract'
import { RADIUS, SPACE } from '@questiongame/design-stage'
import { PointsFigure, Text, insetFrame } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { hud } from '@/copy/format'

/**
 * `RESULT // ALL CORRECT` + `+N PTS`. The other rounded surface (8px).
 * Verdict picks the frame and the signal colour; points are the number the
 * host awarded — the widget never computes them.
 *
 * `revealed=false` keeps it mounted but hidden (spec §2.6).
 */

const FILL: Record<OutcomeVerdict, string> = {
  correct: 'var(--state-correct)',
  incorrect: 'var(--state-incorrect)',
  partial: 'var(--state-accent)',
}

export interface ResultWidgetProps {
  nodeId: string
  verdict: OutcomeVerdict
  points: number
  bonus?: number | null
  revealed?: boolean
}

export function ResultWidget({ nodeId, verdict, points, bonus = null, revealed = true }: ResultWidgetProps) {
  return (
    <div
      data-node-id={nodeId}
      data-verdict={verdict}
      data-revealed={revealed}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: SPACE[4],
        padding: SPACE[6],
        background: FILL[verdict],
        borderRadius: RADIUS.md,
        boxShadow: insetFrame('heavy'),
        visibility: revealed ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-hud">{hud(STAGE_COPY.resultLabel, STAGE_COPY.verdict[verdict])}</Text>
      <PointsFigure points={points} />
      {bonus !== null && bonus !== 0 ? (
        <Text variant="stage-hud" tone="primary">
          {hud(STAGE_COPY.bonusLabel, `+${bonus} ${STAGE_COPY.pointsUnit}`)}
        </Text>
      ) : null}
    </div>
  )
}
