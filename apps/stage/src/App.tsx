import { FIXTURES, FIXTURE_NAMES, type DecorMotionMode, type FixtureName, type PlayStateForStage } from '@questiongame/contract'
import { StageRoot } from '@/pages'

/**
 * Fixture switcher — the P2/P3 dev harness. Until P6 there is no host, so
 * Stage renders the fixture named in `?fixture=`; the strip of links below the
 * canvas swaps it. The strip is outside the 1920×1080 frame and outside the
 * Stage tree, so nothing interactive is ever inside the surface the camera
 * sees. It is removed at P6 when play-state arrives from the host.
 */

function fixtureFromUrl(): FixtureName {
  const raw = new URLSearchParams(window.location.search).get('fixture')
  return raw && (FIXTURE_NAMES as readonly string[]).includes(raw) ? (raw as FixtureName) : 'idle'
}

/** `?decor=collide|collide-attract` overrides the fixture's decor mode, dev only. */
function withDecorOverride(state: PlayStateForStage): PlayStateForStage {
  const raw = new URLSearchParams(window.location.search).get('decor')
  const mode: DecorMotionMode | null = raw === 'collide' || raw === 'collide-attract' ? raw : null
  return mode ? { ...state, decor: { ...state.decor, mode } } : state
}

export function App() {
  const name = fixtureFromUrl()
  const state = withDecorOverride(FIXTURES[name])
  return (
    <>
      <StageRoot state={state} />
      {import.meta.env.DEV ? (
        <nav
          data-dev-fixtures
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-2)',
            padding: 'var(--space-3)',
            fontFamily: 'var(--font-mono)',
            fontSize: 'var(--text-caption)',
            cursor: 'auto',
          }}
        >
          {(['collide', 'collide-attract'] as const).map((m) => (
            <a
              key={m}
              href={`?fixture=${name}&decor=${m}`}
              style={{
                color: 'var(--ink)',
                background: m === state.decor.mode ? 'var(--state-info)' : 'transparent',
                padding: '0 var(--space-1)',
                textDecoration: 'none',
              }}
            >
              {`decor:${m}`}
            </a>
          ))}
          {FIXTURE_NAMES.map((f) => (
            <a
              key={f}
              href={`?fixture=${f}`}
              style={{
                color: f === name ? 'var(--paper)' : 'var(--ink)',
                background: f === name ? 'var(--ink)' : 'transparent',
                padding: '0 var(--space-1)',
                textDecoration: 'none',
              }}
            >
              {f}
            </a>
          ))}
        </nav>
      ) : null}
    </>
  )
}
