import type { ReactNode } from 'react'
import { OVERLAY_COVERAGE, teamById, type OverlayRequest, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Arrow, LabelBox, Text } from '@/atoms'
import { resolveCopy } from '@/copy'
import { optionLetter } from '@/copy/format'

/**
 * The overlay layer: whatever the queue is showing, drawn above the live
 * screen (spec §2.6). The screen underneath is never remounted; a full-screen
 * overlay simply paints paper over it, a half-screen one paints the bottom
 * half and leaves the question visible above.
 *
 * This is the static end state of each overlay. P3 animates into it inside
 * the overlay timeline and reports `overlay:<kind>` on completion; the `+` /
 * `−` particle bursts on the outcome overlay grow out of this layer.
 *
 *   token-handoff     TEAM ALPHA  →  NOW PLAYING / TEAM BETA
 *   round-advance     ROUND // 3
 *   multiple-answers  MULTIPLE ANSWERS + one letter box per option
 *   outcome           CORRECT / INCORRECT / EXTRA SELECTION, bottom half
 */

export interface OverlayLayerProps {
  state: PlayStateForStage
}

function Sheet({ kind, children }: { kind: OverlayRequest['kind']; children: ReactNode }) {
  const coverage = OVERLAY_COVERAGE[kind]
  return (
    <div
      data-overlay={kind}
      data-coverage={coverage}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        top: coverage === 'full' ? 0 : '50%',
        display: 'flex',
        alignItems: coverage === 'full' ? 'center' : 'flex-end',
        justifyContent: 'center',
        padding: 'var(--stage-padding)',
        boxSizing: 'border-box',
        background: 'var(--surface)',
        color: 'var(--text-heading)',
      }}
    >
      {children}
    </div>
  )
}

/** The export's arrow is 120px on a 1920 canvas. */
const ARROW_SIZE = 120

function Handoff({ state, from, to }: { state: PlayStateForStage; from: string | null; to: string }) {
  const copy = resolveCopy()
  const fromTeam = from ? teamById(state, from) : undefined
  const toTeam = teamById(state, to)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: SPACE[8] }}>
      {fromTeam ? (
        <>
          <Text variant="stage-hero" tone="muted" style={{ textDecoration: 'line-through', textDecorationThickness: 'var(--border-thick)' }}>
            {fromTeam.name}
          </Text>
          <Arrow size={ARROW_SIZE} />
        </>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[2] }}>
        <Text variant="stage-hud-large" tone="heading">
          {copy.nowPlayingLabel}
        </Text>
        <Text variant="stage-hero" transition="swap" tone="heading">
          {toTeam?.name ?? ''}
        </Text>
      </div>
    </div>
  )
}

function MultipleAnswers({ count }: { count: number }) {
  const copy = resolveCopy()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[6] }}>
      <Text variant="stage-hero" tone="heading">
        {copy.multipleAnswersWord}
      </Text>
      <div style={{ display: 'flex', gap: SPACE[4] }}>
        {Array.from({ length: count }, (_, i) => (
          <LabelBox key={i} size="lg" fill="paper" border="thin">
            {optionLetter(i)}
          </LabelBox>
        ))}
      </div>
    </div>
  )
}

export function OverlayLayer({ state }: OverlayLayerProps) {
  const copy = resolveCopy()
  const active = state.overlay.enabled ? state.overlay.active : null
  if (!active) return null

  switch (active.kind) {
    case 'token-handoff':
      return (
        <Sheet kind={active.kind}>
          <Handoff state={state} from={active.fromTeamId} to={active.toTeamId} />
        </Sheet>
      )
    case 'round-advance':
      return (
        <Sheet kind={active.kind}>
          <Text variant="stage-hero" tone="heading">
            {`${copy.roundAdvanceLabel} ${copy.delimiter} ${active.roundIndex}`}
          </Text>
        </Sheet>
      )
    case 'multiple-answers':
      return (
        <Sheet kind={active.kind}>
          <MultipleAnswers count={active.optionIds.length} />
        </Sheet>
      )
    case 'outcome':
      return (
        <Sheet kind={active.kind}>
          <Text variant="stage-hero" tone="heading">
            {copy.outcomeWord[active.verdict]}
          </Text>
        </Sheet>
      )
  }
}
