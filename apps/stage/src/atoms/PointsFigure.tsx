import { SPACE } from '@questiongame/design-stage'
import { STAGE_COPY } from '@/copy'
import { signedPoints } from '@/copy/format'
import { Text, type TextTone } from './Text'

/**
 * `+500 PTS`. The number is derived (award outcome); the unit is authored copy.
 */

export interface PointsFigureProps {
  points: number
  size?: 'hero' | 'row'
  tone?: TextTone
}

export function PointsFigure({ points, size = 'hero', tone = 'heading' }: PointsFigureProps) {
  return (
    <span data-points={points} style={{ display: 'inline-flex', alignItems: 'baseline', gap: SPACE[2] }}>
      <Text variant={size === 'hero' ? 'stage-number' : 'stage-heading'} transition="count" tone={tone}>
        {signedPoints(points)}
      </Text>
      <Text variant="stage-code" tone={tone === 'muted' ? 'muted' : 'primary'}>
        {STAGE_COPY.pointsUnit}
      </Text>
    </span>
  )
}
