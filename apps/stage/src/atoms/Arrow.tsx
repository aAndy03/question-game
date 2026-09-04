import arrow from '@questiongame/design-stage/assets/arrow-right.svg?raw'
import { COLOR } from '@questiongame/design-stage'

/**
 * The handoff arrow, from the export. The only arrow the system has; drawn
 * as a hairline stroke in the current text colour, never redrawn.
 */

const MARKUP = arrow
  .replace(/<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%">`)
  .replace(/stroke="[^"]*"/g, 'stroke="currentColor"')

export interface ArrowProps {
  /** Side length in canvas px. */
  size: number
}

export function Arrow({ size }: ArrowProps) {
  return (
    <span
      data-arrow
      aria-hidden
      style={{ display: 'inline-block', width: size, height: size, lineHeight: 0, color: COLOR.textHeading }}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  )
}
