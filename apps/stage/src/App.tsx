import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import {
  FIXTURES,
  FIXTURE_NAMES,
  type DecorMotionMode,
  type FixtureName,
  type PlayStateForStage,
} from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { stageHost, type StageHost } from '@/host/host'
import { StageRoot } from '@/pages'

/**
 * Stage's root. Two ways in, one tree:
 *
 * ```text
 * host present   `play-state` from the Rust host. The real thing (P6).
 * no host        the P2/P3 fixture strip, dev builds only — `npm run dev:stage`
 *                in a plain browser, for screen work without booting the app.
 * ```
 *
 * The fixture strip is a **fallback**, not a mode: inside the desktop app there
 * is a host, so it never renders. It stays because a designer iterating on a
 * screen should not need a database, and because "Stage renders identically
 * fixture-fed or host-fed" is a P6 exit criterion that wants both paths alive.
 * Either way it is outside the 1920×1080 frame and outside the Stage tree, so
 * nothing interactive is ever inside the surface the camera sees.
 */

function HostFed({ host }: { host: StageHost }) {
  // `useSyncExternalStore` rather than an effect: the host is the store, and a
  // render that tears halfway through a Play is a wrong score on a surface
  // someone is filming. Until the first emission this is `EMPTY_PLAY_STATE` —
  // the Idle screen, which reads nothing off the Play.
  const state = useSyncExternalStore(host.subscribe, host.snapshot, host.snapshot)
  return <StageRoot state={state} />
}

export function App() {
  const host = stageHost()
  return host ? <HostFed host={host} /> : <FixtureFed />
}

// ------------------------------------------------------- the no-host fallback

function fixtureFromUrl(): FixtureName {
  const raw = new URLSearchParams(window.location.search).get('fixture')
  return raw && (FIXTURE_NAMES as readonly string[]).includes(raw) ? (raw as FixtureName) : 'idle'
}

function decorFromUrl(): DecorMotionMode | null {
  const raw = new URLSearchParams(window.location.search).get('decor')
  return raw === 'collide' || raw === 'collide-attract' ? raw : null
}

function withDecor(state: PlayStateForStage, mode: DecorMotionMode | null): PlayStateForStage {
  return mode ? { ...state, decor: { ...state.decor, mode } } : state
}

const NO_OVERLAY = { busy: false, active: null, pending: null, enabled: true } as const

const link = (active: boolean, activeBg: string) =>
  ({
    color: active && activeBg === 'var(--ink)' ? 'var(--paper)' : 'var(--ink)',
    background: active ? activeBg : 'transparent',
    border: 0,
    padding: '0 var(--space-1)',
    font: 'inherit',
    cursor: 'pointer',
  }) as const

/**
 * `?fixture=<name>&decor=<mode>` seeds the first state; the URL follows the
 * strip so a view can be bookmarked. The strip swaps the fixture *in place*, so
 * screen changes play their transitions instead of reloading.
 */
function FixtureFed() {
  const [name, setName] = useState<FixtureName>(fixtureFromUrl)
  const [decor, setDecor] = useState<DecorMotionMode | null>(decorFromUrl)
  const [lastEvent, setLastEvent] = useState<string>('')
  // Fake host for the overlay queue: `run` re-arms the fixture's overlay,
  // and an `overlay:*` anim-complete clears it, as the real host would.
  const [overlayRun, setOverlayRun] = useState(0)
  const [overlayDone, setOverlayDone] = useState(false)
  const state = useMemo(() => {
    const base = withDecor(FIXTURES[name], decor)
    return overlayDone && base.overlay.active ? { ...base, overlay: { ...NO_OVERLAY, enabled: base.overlay.enabled } } : base
  }, [name, decor, overlayDone, overlayRun])

  useEffect(() => {
    const q = new URLSearchParams()
    q.set('fixture', name)
    if (decor) q.set('decor', decor)
    window.history.replaceState(null, '', `?${q}`)
  }, [name, decor])

  useEffect(
    () =>
      stageEvents.on('anim-complete', ({ key }) => {
        setLastEvent(key)
        if (key.startsWith('overlay:')) setOverlayDone(true)
      }),
    [],
  )
  useEffect(() => setOverlayDone(false), [name, overlayRun])

  return (
    <>
      <StageRoot state={state} />
      {import.meta.env.DEV ? (
        <nav
          data-dev-fixtures
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-caption)',
            cursor: 'auto',
          }}
        >
          {(['collide', 'collide-attract'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setDecor(m)} style={link(m === state.decor.mode, 'var(--state-info)')}>
              {`decor:${m}`}
            </button>
          ))}
          {FIXTURE_NAMES.map((f) => (
            <button key={f} type="button" onClick={() => setName(f)} style={link(f === name, 'var(--ink)')}>
              {f}
            </button>
          ))}
          {FIXTURES[name].overlay.active ? (
            <button type="button" data-dev-overlay-replay onClick={() => setOverlayRun((n) => n + 1)} style={link(true, 'var(--state-accent)')}>
              replay overlay
            </button>
          ) : null}
          <span data-dev-last-event style={{ marginLeft: 'auto', color: 'var(--text-muted)' }}>
            {lastEvent ? `anim-complete ${lastEvent}` : ''}
          </span>
        </nav>
      ) : null}
    </>
  )
}
