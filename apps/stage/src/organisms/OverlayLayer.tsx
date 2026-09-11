import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react'
import { OVERLAY_COVERAGE, teamById, type OverlayRequest, type PlayStateForStage } from '@questiongame/contract'
import { SPACE } from '@questiongame/design-stage'
import { Arrow, LabelBox, Text } from '@/atoms'
import { useCopy } from '@/copy'
import { optionLetter } from '@/copy/format'
import { stageEvents } from '@/host/events'
import { isHoldMode } from '@/host/host'
import { runOverlay, sequencer, type RunningOverlay } from '@/presentation'
import { CurrentTeamBlock } from './CurrentTeamBlock'

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
 *   outcome           CORRECT / INCORRECT / EXTRA SELECTION, bottom half on a
 *                     transparent sheet, with a burst of + or - pieces
 *   current-team      the current-team block over any screen
 *
 * Every kind arrives automatically from the host when its cause occurs, and
 * the operator may call any of them by hand at any time (`show_overlay`);
 * this layer cannot tell the two apart and does not need to.
 */

export interface OverlayLayerProps {
  state: PlayStateForStage
}



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
        // A half-screen overlay sits on the question, so it paints nothing behind its word.
        background: coverage === 'full' ? 'var(--surface)' : 'transparent',
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
  const copy = useCopy()
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
  const copy = useCopy()
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
  const copy = useCopy()
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
    case 'current-team':
      return <CurrentTeamBlock state={state} teamId={request.teamId} />
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
  // **The occurrence, never the value.** The operator may call the same
  // overlay twice, and `round-advance` on the same round — or `current-team`
  // for the same team — is equal by value to the one that just ran. Keyed on
  // the value, the promoted duplicate would look like "still the same run":
  // nothing would play, nothing would be acked, and the host's queue would
  // stop for the rest of the Play (spec §2.6 — the queue advances on an ack).
  const runId = state.overlay.runId
  // The Screens canvas (`?viewer&hold`) draws the request at rest.
  const hold = isHoldMode()

  // What is on screen right now: kept locally so it runs to completion.
  const [showing, setShowing] = useState<OverlayRequest | null>(null)
  const running = useRef<RunningOverlay | null>(null)
  const next = useRef<OverlayRequest | null>(null)
  const sheet = useRef<HTMLDivElement | null>(null)
  const lastRun = useRef(0)

  // A new active request: show it now, or queue it (depth 1) behind the running one.
  useEffect(() => {
    if (hold) return
    if (runId === lastRun.current) return
    lastRun.current = runId
    if (!active) return
    if (!enabled) {
      // No visual; the host still needs the handshake to advance its token.
      stageEvents.emit('anim-complete', { key: `overlay:${active.kind}` })
      return
    }
    if (running.current) next.current = active
    else setShowing(active)
  }, [hold, runId, active, enabled])

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
      // A timeline can finish *inside* `runOverlay` — `motionConfig.immediate`
      // does exactly that, and so does a zero-length one. Assigning the return
      // value afterwards would then overwrite the `null` the callback just
      // wrote and leave a finished overlay marked as running for ever, so
      // every later one would queue behind it and never play.
      let finished = false
      const started = runOverlay({ request, sheet: el }, () => {
        finished = true
        running.current = null
        release()
        const queued = next.current
        next.current = null
        setShowing(queued)
      })
      if (!finished) running.current = started
    })
    return () => {
      cancel()
    }
  }, [showing])

  // Hold mode is a projection, not a queue: the canvas shows exactly the
  // request the preview has on air, and nothing once it has none. The local
  // `showing` copy exists so a live overlay survives the host clearing
  // `active` mid-animation — and only the timeline's completion clears it. A
  // canvas never starts a timeline, so a copy there is never cleared: the
  // first overlay picked stayed on top of every screen picked after it.
  // (Screens-tab-only; see 05_STUDIO_DESIGN.md §16.6.)
  const drawn = hold ? active : showing
  if (!drawn) return null
  return (
    <Sheet key={hold ? drawn.kind : undefined} kind={drawn.kind} ref={sheet}>
      <Content state={state} request={drawn} />
    </Sheet>
  )
}
