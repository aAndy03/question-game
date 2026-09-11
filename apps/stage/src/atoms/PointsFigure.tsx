import { SPACE } from '@questiongame/design-stage'
import { useCopy } from '@/copy'
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
  const copy = useCopy()
  return (
    <span data-points={points} style={{ display: 'inline-flex', alignItems: 'baseline', gap: SPACE[2] }}>
      <Text variant={size === 'hero' ? 'stage-figure' : 'stage-heading'} transition="count" tone={tone}>
        {signedPoints(points)}
      </Text>
      <Text variant={size === 'hero' ? 'stage-figure' : 'stage-code'} tone={tone}>
        {copy.pointsUnit}
      </Text>
    </span>
  )
}
