import { nodeId, SCREEN_SLOTS, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { ClockDigits, Rule, Text, insetBorder } from '@/atoms'
import { resolveCopy } from '@/copy'

/**
 * The persistent header: mounted once in the Stage frame, never remounted on
 * a screen change (contract §3). As the reference draws it:
 *
 *   HOPE CHALLENGE | AMiCUS                              [ 00:12:20 ]
 *   ----------------------------------------------------------------
 *
 * Brand and partner are authored copy; the clock is the Play clock from
 * play-state (how long the game has been running). One 1px rule below.
 * On a screen without a header slot (idle) it stays mounted and hidden.
 */

export interface StageHeaderProps {
  state: PlayStateForStage
}

export function StageHeader({ state }: StageHeaderProps) {
  const copy = resolveCopy()
  const screen = state.currentScreen
  const hasHeader = 'header' in SCREEN_SLOTS[screen]
  const id = hasHeader ? nodeId(screen as 'teamOrder', 'header') : undefined

  return (
    <header
      {...(id ? { 'data-node-id': id } : {})}
      data-stage-header
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: SPACE[3],
        paddingBottom: SPACE[4],
        boxShadow: insetBorder({ bottom: 'thin' }),
        visibility: hasHeader ? undefined : 'hidden',
      }}
    >
      <Text variant="stage-brand" tone="heading">
        {copy.headerBrand}
      </Text>
      <Rule orientation="vertical" weight="thin" />
      <Text variant="stage-partner" tone="primary">
        {copy.headerPartner}
      </Text>
      <span style={{ marginLeft: 'auto' }}>
        <ClockDigits ms={state.clock.elapsedMs} hours="always" variant="stage-code" tone="heading" />
      </span>
    </header>
  )
}
