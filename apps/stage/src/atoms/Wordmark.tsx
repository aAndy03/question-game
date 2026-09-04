import wordmark from '@questiongame/design-stage/assets/wordmark.svg?raw'
import { COLOR } from '@questiongame/design-stage'

/**
 * The brand mark. "question\ngame" set in Space Mono Bold is the logo — there
 * is no other (design system: "Source"). It is the one string on Stage that is
 * not operator-editable, so it is an asset, not copy.
 */

const NATURAL = /viewBox="[-\d.]+ [-\d.]+ ([-\d.]+) ([-\d.]+)"/.exec(wordmark)
export const WORDMARK_WIDTH = NATURAL ? Number(NATURAL[1]) : 0
export const WORDMARK_HEIGHT = NATURAL ? Number(NATURAL[2]) : 0

const MARKUP = wordmark
  .replace(/<svg([^>]*)>/, (_m, attrs: string) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, '')} width="100%" height="100%">`)
  .replace(/fill="#[0-9a-fA-F]{3,8}"/g, 'fill="currentColor"')

export interface WordmarkProps {
  nodeId: string
  /** Rendered width in canvas px. Defaults to the asset's natural width. */
  width?: number
}

export function Wordmark({ nodeId, width = WORDMARK_WIDTH }: WordmarkProps) {
  const height = WORDMARK_WIDTH ? (width * WORDMARK_HEIGHT) / WORDMARK_WIDTH : 0
  return (
    <div
      data-node-id={nodeId}
      data-wordmark
      role="img"
      aria-label="question game"
      style={{ width, height, color: COLOR.textHeading, lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: MARKUP }}
    />
  )
}
