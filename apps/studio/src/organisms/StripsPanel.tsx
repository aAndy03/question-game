import type { OverlayKind, OverlayRequest } from '@questiongame/contract'
import { EmptyState, OverlayStrip, ScreenStrip } from '@/molecules'
import { CONTROL } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { usePlayState } from '@/host/playState'

export interface StripsPanelProps {
  density: 'comfortable' | 'compact' | 'dense'
}

/** Screens and overlays, the operator's two hands on Stage (spec §5.5, §5.6). */
export function StripsPanel({ density }: StripsPanelProps) {
  const play = usePlayState()
  const run = useHostCommand()
  if (!play) return <EmptyState kind="empty" what={CONTROL.panels.strips.toLowerCase()} detail={CONTROL.noRecipeBody} compact />

  const overlayFor = (kind: OverlayKind): OverlayRequest => {
    switch (kind) {
      case 'token-handoff':
        return { kind, fromTeamId: null, toTeamId: play.ring.currentTeamId ?? play.ring.order[0] ?? '' }
      case 'round-advance':
        return { kind, roundIndex: play.ring.roundIndex }
      case 'multiple-answers':
        return { kind, optionIds: play.session?.selectedOptionIds ?? [] }
      case 'outcome':
        return { kind, verdict: play.session?.outcome?.verdict ?? 'correct' }
      case 'current-team':
        return { kind, teamId: play.ring.currentTeamId }
    }
  }

  return (
    <div className="flex flex-col gap-4" data-strips-panel>
      <ScreenStrip current={play.currentScreen} overlayBusy={play.overlay.busy} density={density} onShow={(screen) => void run('show_screen', { screen })} />
      <OverlayStrip active={play.overlay.active} pending={play.overlay.pending} enabled={play.overlay.enabled} density={density} onShow={(kind) => void run('show_overlay', { overlay: overlayFor(kind) })} />
    </div>
  )
}
