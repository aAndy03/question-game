import { currentTeam, nodeId, SCREEN_SLOTS, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Text, insetHeaderRule } from '@/atoms'
import { STAGE_COPY } from '@/copy'
import { hud } from '@/copy/format'
import { TimerPanel } from '@/molecules'

/**
 * The persistent header: mounted once in the Stage frame, never remounted on
 * a screen change (contract §3). Its content is derived from play-state:
 *
 *   left   `<screen title> // <subject>` — the title is authored copy, the
 *          subject (team on token, domain in play) is derived.
 *   right  `SESSION // <authored>` and the Play clock.
 *
 * On a screen without a header slot (idle) it stays mounted and hidden.
 */

export interface StageHeaderProps {
  state: PlayStateForStage
}

function subjectFor(state: PlayStateForStage): string | null {
  switch (state.currentScreen) {
    case 'chooseDomain':
    case 'currentTeam':
      return currentTeam(state)?.name ?? null
    case 'question': {
      const domain = state.domains.find((d) => d.id === state.session?.domainId)
      return domain?.name ?? null
    }
    default:
      return null
  }
}

function titleFor(state: PlayStateForStage): string {
  if (state.currentScreen === 'question') return hud(STAGE_COPY.domainLabel, subjectFor(state))
  return hud(STAGE_COPY.screenTitle[state.currentScreen], subjectFor(state))
}

export function StageHeader({ state }: StageHeaderProps) {
  const screen = state.currentScreen
  const hasHeader = 'header' in SCREEN_SLOTS[screen]
  const id = hasHeader ? nodeId(screen, 'header' as never) : undefined
  const started = state.status !== 'loaded'

  return (
    <header
      {...(id ? { 'data-node-id': id } : {})}
      data-stage-header
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto',
        alignItems: 'center',
        gap: SPACE[6],
        padding: `${SPACE[3]} ${SPACE[4]}`,
        boxShadow: insetHeaderRule(),
        visibility: hasHeader ? 'visible' : 'hidden',
      }}
    >
      <Text variant="stage-hud" transition="swap">
        {titleFor(state)}
      </Text>
      <Text variant="stage-hud" tone="muted" style={{ visibility: STAGE_COPY.sessionValue ? 'visible' : 'hidden' }}>
        {hud(STAGE_COPY.sessionLabel, STAGE_COPY.sessionValue)}
      </Text>
      <TimerPanel
        label={STAGE_COPY.playClockLabel}
        value={STAGE_COPY.playClockValue}
        ms={state.clock.elapsedMs}
        hours="always"
        framed={false}
        size="inline"
        visible={started}
      />
    </header>
  )
}
