import { BORDER, COLOR } from '@questiongame/design-stage'

/**
 * A divider at one of the three sanctioned weights. Horizontal fills the
 * width; vertical fills the height of its flex parent.
 */

export interface RuleProps {
  weight?: keyof typeof BORDER
  orientation?: 'horizontal' | 'vertical'
  tone?: 'default' | 'subtle'
}

export function Rule({ weight = 'thick', orientation = 'horizontal', tone = 'default' }: RuleProps) {
  const color = tone === 'subtle' ? COLOR.borderSubtle : COLOR.borderDefault
  const size = BORDER[weight]
  return (
    <span
      role="separator"
      aria-orientation={orientation}
      data-rule={weight}
      style={
        orientation === 'horizontal'
          ? { display: 'block', width: '100%', height: size, background: color, flex: '0 0 auto' }
          : { display: 'block', width: size, alignSelf: 'stretch', background: color, flex: '0 0 auto' }
      }
    />
  )
}
