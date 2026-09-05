import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { OVERLAY_COVERAGE, teamById, type OverlayRequest, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Arrow, LabelBox, Text } from '@/atoms'
import { resolveCopy } from '@/copy'
import { optionLetter } from '@/copy/format'
import { stageEvents } from '@/host/events'
import { runOverlay, sequencer, type RunningOverlay } from '@/presentation'

/**
 * The overlay layer: whatever the queue is showing, drawn above the live
 * screen (spec §2.6). The screen underneath is never remounted; a full-screen
 * overlay paints paper over it, a half-screen one paints the bottom half and
 * leaves the question visible above.
 *
 * The host owns the queue (`overlay.active`, `overlay.pending`). This layer
 * owns the moment: when a new `active` arrives it is *shown* (kept locally,
 * so a host that clears `active` early cannot cut the animation short), its
 * timeline plays enter → hold → exit once any running transition has ended,
 * and `overlay:<kind>` is reported exactly once. A newer `active` arriving
 * mid-run waits its turn; a second one replaces the waiting one (pending
 * depth 1). With overlays disabled nothing is drawn and completion is
 * reported at once, so the host's token still advances (spec §5.6).
 *
 *   token-handoff     TEAM ALPHA  →  NOW PLAYING / TEAM BETA
 *   round-advance     ROUND // 3
 *   multiple-answers  MULTIPLE ANSWERS + one letter box per option
 *   outcome           CORRECT / INCORRECT / EXTRA SELECTION, bottom half,
 *                     with a burst of + or - pieces
 */

export interface OverlayLayerProps {
  state: PlayStateForStage
}

const requestKey = (r: OverlayRequest | null) => (r ? JSON.stringify(r) : '')

function Sheet({ kind, children, ref }: { kind: OverlayRequest['kind']; children: ReactNode; ref: Ref<HTMLDivElement> }) {
  const coverage = OVERLAY_COVERAGE[kind]
  return (
    <div
      ref={ref}
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
        overflow: 'hidden',
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
          <span data-overlay-from>
            <Text variant="stage-hero" tone="muted" style={{ textDecoration: 'line-through', textDecorationThickness: 'var(--border-thick)' }}>
              {fromTeam.name}
            </Text>
          </span>
          <Arrow size={ARROW_SIZE} />
        </>
      ) : null}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[2] }}>
        <span data-overlay-label>
          <Text variant="stage-hud-large" tone="heading">
            {copy.nowPlayingLabel}
          </Text>
        </span>
        <span data-overlay-to>
          <Text variant="stage-hero" transition="swap" tone="heading">
            {toTeam?.name ?? ''}
          </Text>
        </span>
      </div>
    </div>
  )
}

function MultipleAnswers({ count }: { count: number }) {
  const copy = resolveCopy()
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: SPACE[6] }}>
      <span data-overlay-word>
        <Text variant="stage-hero" tone="heading">
          {copy.multipleAnswersWord}
        </Text>
      </span>
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

function Content({ state, request }: { state: PlayStateForStage; request: OverlayRequest }) {
  const copy = resolveCopy()
  switch (request.kind) {
    case 'token-handoff':
      return <Handoff state={state} from={request.fromTeamId} to={request.toTeamId} />
    case 'round-advance':
      return (
        <span data-overlay-word>
          <Text variant="stage-hero" tone="heading">
            {`${copy.roundAdvanceLabel} ${copy.delimiter} ${request.roundIndex}`}
          </Text>
        </span>
      )
    case 'multiple-answers':
      return <MultipleAnswers count={request.optionIds.length} />
    case 'outcome':
      return (
        <span data-overlay-word>
          <Text variant="stage-hero" tone="heading">
            {copy.outcomeWord[request.verdict]}
          </Text>
        </span>
      )
  }
}

export function OverlayLayer({ state }: OverlayLayerProps) {
  const active = state.overlay.active
  const enabled = state.overlay.enabled
  const key = requestKey(active)

  // What is on screen right now: kept locally so it runs to completion.
  const [showing, setShowing] = useState<OverlayRequest | null>(null)
  const running = useRef<RunningOverlay | null>(null)
  const next = useRef<OverlayRequest | null>(null)
  const sheet = useRef<HTMLDivElement | null>(null)
  const lastKey = useRef('')

  // A new active request: show it now, or queue it (depth 1) behind the running one.
  useEffect(() => {
    if (key === lastKey.current) return
    lastKey.current = key
    if (!active) return
    if (!enabled) {
      // No visual; the host still needs the handshake to advance its token.
      stageEvents.emit('anim-complete', { key: `overlay:${active.kind}` })
      return
    }
    if (running.current) next.current = active
    else setShowing(active)
  }, [key, active, enabled])

  // Play whatever is showing once the sheet exists and no transition runs.
  useEffect(() => {
    if (!showing || !sheet.current) return
    const el = sheet.current
    const request = showing
    let release = () => {}
    const cancel = sequencer.whenFree('transition', () => {
      // StrictMode runs this effect twice in dev; one timeline per request.
      if (running.current && running.current.request === request) return
      release = sequencer.acquire('overlay')
      running.current = runOverlay({ request, sheet: el }, () => {
        running.current = null
        release()
        const queued = next.current
        next.current = null
        setShowing(queued)
      })
    })
    return () => {
      cancel()
    }
  }, [showing])

  if (!showing) return null
  return (
    <Sheet kind={showing.kind} ref={sheet}>
      <Content state={state} request={showing} />
    </Sheet>
  )
}
