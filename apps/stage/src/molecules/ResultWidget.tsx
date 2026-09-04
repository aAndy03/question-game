import type { OutcomeVerdict } from '@questiongame/contract'
import { LAYOUT, RADIUS, SPACE } from '@questiongame/design-stage'
import { PointsFigure, Text, insetFrame } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { hud } from '@/copy/format'

/**
 * `result // all correct` over `+500 PTS`, in the side panel slot: verdict
 * colour fill, 3px frame, 8px radius (one of the two rounded surfaces).
 * Verdict picks the frame and the signal colour; points are the number the
 * host awarded. The widget never computes them.
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
        alignItems: 'center',
        justifyContent: 'center',
        gap: SPACE[2],
        width: LAYOUT.sidePanelWidth,
        minHeight: LAYOUT.sidePanelHeight,
        boxSizing: 'border-box',
        padding: SPACE[4],
        background: FILL[verdict],
        borderRadius: RADIUS.md,
        boxShadow: insetFrame('heavy'),
        visibility: revealed ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-hud" tone="heading">
        {hud(STAGE_COPY.resultLabel, STAGE_COPY.verdict[verdict])}
      </Text>
      <PointsFigure points={points} />
      {bonus !== null && bonus !== 0 ? (
        <Text variant="stage-hud" tone="heading">
          {hud(STAGE_COPY.bonusLabel, `+${bonus} ${STAGE_COPY.pointsUnit}`)}
        </Text>
      ) : null}
    </div>
  )
}
