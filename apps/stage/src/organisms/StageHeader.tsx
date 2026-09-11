import { nodeId, SCREEN_SLOTS, type PlayStateForStage, type StageScreen } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { ClockDigits, Text, insetBorder } from '@/atoms'
import { useCopy } from '@/copy'
import { useLiveStageClock } from '@/host/clock'

/**
 * The persistent header: mounted once in the Stage frame, never remounted on
 * a screen change (contract §3). As the reference draws it:
 *
 *   YOUR TEXT GOES HERE                                  [ 00:12:20 ]
 *   ----------------------------------------------------------------
 *
 * The line on the left is the idle eyebrow: the show's name, authored once
 * and carried by every header. The clock is the Play clock from play-state
 * (how long the game has been running). One 1px rule below.
 * On a screen without a header slot (idle) it stays mounted and hidden.
 */

export interface StageHeaderProps {
  state: PlayStateForStage
  /** The screen being presented; defaults to `state.currentScreen`. */
  screen?: StageScreen | undefined
}

export function StageHeader({ state, screen: presented }: StageHeaderProps) {
  const copy = useCopy()
  const screen = presented ?? state.currentScreen
  const hasHeader = 'header' in SCREEN_SLOTS[screen]
  const id = hasHeader ? nodeId(screen as 'teamOrder', 'header') : undefined

  return (
    <header
      {...(id ? { 'data-node-id': id } : {})}
      data-stage-header
      data-decor-solid
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
        {copy.idleEyebrow}
      </Text>
      <span style={{ marginLeft: 'auto' }}>
        <HeaderClock carriedMs={state.clock.elapsedMs} />
      </span>
    </header>
  )
}

/**
 * The Play clock, and nothing else.
 *
 * A leaf so the show loop re-renders these digits and not the header around
 * them — nor `StageFrame`, `StageRoot` and the current page above it, which is
 * what reading `state.clock` here used to cost (P11.10).
 */
function HeaderClock({ carriedMs }: { carriedMs: number }) {
  const live = useLiveStageClock()
  return <ClockDigits ms={live ? live.elapsedMs : carriedMs} hours="always" variant="stage-code" tone="heading" />
}
