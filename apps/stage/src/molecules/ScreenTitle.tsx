import { Text } from '@/atoms'
import { hud } from '@/copy/format'

/**
 * A body title, `playing sequence //` or `select category // team alpha`.
 * Authored title, derived subject, HUD casing. The `//` always shows: it is
 * the design system's delimiter even with nothing after it.
 */

export interface ScreenTitleProps {
  nodeId: string
  title: string
  subject?: string | null | undefined
}

export function ScreenTitle({ nodeId, title, subject = null }: ScreenTitleProps) {
  return (
    <Text as="h1" variant="stage-title" transition="swap" tone="heading" nodeId={nodeId}>
      {hud(title, subject)}
    </Text>
  )
}
