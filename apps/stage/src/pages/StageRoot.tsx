import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react'
import { STAGE_SCREENS, type PlayStateForStage, type StageScreen } from '@questiongame/contract'
import { Text } from '@/atoms'
import { runTransition, sequencer, type RunningTransition } from '@/presentation'
import { DecorField, OverlayLayer, StageHeader } from '@/organisms'
import { StageFrame } from '@/templates'
import { LayoutProvider, applyLayout } from '@/layout'
import { IdlePage } from './Idle'
import { TeamOrderPage } from './TeamOrder'
import { ChooseDomainPage } from './ChooseDomain'
import { QuestionPage } from './Question'
import { ScoreboardPage } from './Scoreboard'
import { FinalLeaderboardPage } from './FinalLeaderboard'
import { CurrentTeamPage } from './CurrentTeam'

/**
 * The Stage tree. One frame for the life of the window; the persistent slots
 * (header, decor, overlay) mount here, outside any page, so a screen change
 * swaps only the body (contract §3). The page for the current screen comes
 * from the registry — adding a screen is one page file plus one entry.
 *
 * Screen changes are transitions (presentation/): when `currentScreen` changes,
 * the outgoing page stays mounted in a lower layer with the play-state it
 * last had, the incoming page mounts on top, and one timeline plays over
 * both plus the header and decor. The decor world swaps when the timeline
 * says so, not when React renders. On completion the outgoing layer is
 * dropped and `anim-complete` fires once. A jump during a transition
 * finishes the running one first, then starts the next from the new pair.
 */

export interface StagePageProps {
  state: PlayStateForStage
}

const PAGES: Partial<Record<StageScreen, ComponentType<StagePageProps>>> = {
  idle: IdlePage,
  teamOrder: TeamOrderPage,
  chooseDomain: ChooseDomainPage,
  question: QuestionPage,
  scoreboard: ScoreboardPage,
  finalLeaderboard: FinalLeaderboardPage,
  currentTeam: CurrentTeamPage,
}

/** Screens with a page built. Tests assert the registry against the contract. */
export const BUILT_SCREENS = STAGE_SCREENS.filter((s) => s in PAGES)

function Unbuilt({ state }: StagePageProps) {
  return (
    <section data-page="unbuilt" style={{ flex: '1 1 auto', display: 'flex', alignItems: 'center' }}>
      <Text variant="stage-hud" tone="muted">
        {`${state.currentScreen} // not built yet`}
      </Text>
    </section>
  )
}

interface Leaving {
  readonly screen: StageScreen
  readonly state: PlayStateForStage
}

export interface StageRootProps {
  state: PlayStateForStage
}

export function StageRoot({ state }: StageRootProps) {
  const screen = state.currentScreen
  const Page = PAGES[screen] ?? Unbuilt

  // The page that is on its way out, frozen with the last state it drew.
  const [leaving, setLeaving] = useState<Leaving | null>(null)
  // Which screen the persistent slots present; flips mid-transition.
  const [presented, setPresented] = useState<StageScreen>(screen)

  // The recipe's node overrides, written onto the DOM (layout/apply.ts).
  const frameForLayout = useRef<HTMLDivElement | null>(null)
  useLayoutEffect(() => {
    const root = frameForLayout.current
    if (!root) return
    return applyLayout(root, state.layout)
  }, [state.layout])

  const shown = useRef(screen)
  const lastState = useRef(state)
  const running = useRef<RunningTransition | null>(null)
  // The transition lane, taken the instant a change is seen (layout effect)
  // so an overlay arriving in the same snapshot waits for the transition
  // rather than the other way round (child effects run before ours).
  const reserved = useRef<(() => void) | null>(null)
  const frame = useRef<HTMLDivElement | null>(null)
  const incomingLayer = useRef<HTMLDivElement | null>(null)
  const outgoingLayer = useRef<HTMLDivElement | null>(null)

  // Detect a screen change before paint, so the outgoing layer is mounted
  // in the same commit as the incoming one.
  useLayoutEffect(() => {
    if (shown.current === screen) {
      lastState.current = state
      return
    }
    const from = shown.current
    shown.current = screen
    // A jump mid-transition: finish the running one now, then start the new pair.
    running.current?.finish()
    running.current = null
    reserved.current?.()
    reserved.current = sequencer.isBusy('overlay') ? null : sequencer.acquire('transition')
    setLeaving({ screen: from, state: lastState.current })
    lastState.current = state
  }, [screen, state])

  // Play the transition once both layers exist — and once no overlay is
  // running (spec §5.6: no base transition under a running overlay).
  useEffect(() => {
    if (!leaving || !incomingLayer.current) return
    const root = frame.current
    const incoming = incomingLayer.current
    const outgoing = outgoingLayer.current
    let release = () => {}
    const cancel = sequencer.whenFree('overlay', () => {
      // StrictMode runs this effect twice in dev; one timeline per pair.
      if (running.current && running.current.from === leaving.screen && running.current.to === screen) return
      release = reserved.current ?? sequencer.acquire('transition')
      reserved.current = null
      const ctx = {
        from: leaving.screen,
        to: screen,
        outgoing,
        incoming,
        header: root?.querySelector<HTMLElement>('[data-stage-header]') ?? null,
        decor: root?.querySelector<HTMLElement>('[data-stage-decor]') ?? null,
        swapDecor: () => setPresented(screen),
      }
      // Assigned only if the timeline is still running: `motionConfig.
      // immediate` completes inside `runTransition`, and overwriting the
      // `null` its callback wrote would leave the lane looking busy for ever.
      let finished = false
      const started = runTransition(ctx, () => {
        finished = true
        running.current = null
        release()
        setPresented(screen)
        setLeaving(null)
      })
      if (!finished) running.current = started
    })
    return () => {
      // Another jump before this one started: it never runs. A running one
      // was already finished by the layout effect.
      cancel()
    }
  }, [leaving, screen])

  const LeavingPage = leaving ? (PAGES[leaving.screen] ?? Unbuilt) : null
  const headerState = presented === screen ? state : (leaving?.state ?? state)

  return (
    <LayoutProvider layout={state.layout}>
    <div ref={frameForLayout} style={{ display: 'contents' }}>
    <div ref={frame} style={{ display: 'contents' }}>
      <StageFrame
        screen={screen}
        header={<StageHeader state={headerState} screen={presented} />}
        decor={<DecorField state={state} screen={presented} />}
        overlay={<OverlayLayer state={state} />}
      >
        {leaving && LeavingPage ? (
          <div ref={outgoingLayer} data-screen-layer="outgoing" data-screen={leaving.screen} style={LAYER}>
            <LeavingPage state={leaving.state} />
          </div>
        ) : null}
        <div key={screen} ref={incomingLayer} data-screen-layer="current" data-screen={screen} style={LAYER}>
          <Page state={state} />
        </div>
      </StageFrame>
    </div>
    </div>
    </LayoutProvider>
  )
}

/** Both page layers fill the body and stack; the incoming one is on top. */
const LAYER = {
  position: 'absolute',
  inset: 0,
  display: 'flex',
  flexDirection: 'column',
} as const
