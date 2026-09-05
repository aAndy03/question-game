import type { CSSProperties } from 'react'
import { ICON_BODIES } from './icons.generated'
import type { IconName } from './icons'

export type IconSize = 'sm' | 'md' | 'lg'

const PX: Record<IconSize, number> = { sm: 16, md: 20, lg: 24 }

export interface IconProps {
  name: IconName
  size?: IconSize
  /** Decorative by default. Give a label only when the icon stands alone. */
  label?: string | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
}

/**
 * One icon from `ICONS`, as inline SVG in `currentColor`. Nothing is fetched:
 * the bodies are generated at build time (`scripts/studio-icons.ts`).
 */
export function Icon({ name, size = 'md', label, className, style }: IconProps) {
  const icon = ICON_BODIES[name]
  const px = PX[size]
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${icon.width} ${icon.height}`}
      width={px}
      height={px}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
      className={['shrink-0', className].filter(Boolean).join(' ')}
      style={style}
      dangerouslySetInnerHTML={{ __html: icon.body }}
    />
  )
}
