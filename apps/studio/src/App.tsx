import { useCallback, useEffect, useState } from 'react'
import type {
  MonitorsChanged,
  Notice,
  PlayStateForMain,
  StageScreen,
} from '@questiongame/contract'
import { STAGE_SCREENS } from '@questiongame/contract'
import { THEME } from '@questiongame/design-studio'
import { command, hasHost, isHostError, on } from '@/host/host'

/**
 * **P6 harness, not the Studio shell.** P7 builds the real one (sidebar, tabs,
 * library lists); this exists so the phase is runnable end to end: load a
 * recipe, start the Play, drive a turn, move Stage between displays, and watch
 * `play-state` come back.
 *
 * It is deliberately ugly and deliberately thin — every button is one
 * `command(...)` and nothing else. Nothing here holds Play state: what it draws
 * comes from the `play-state` event, which is why there is no local score, no
 * local ring, and no cache.
 */
export function App() {
  const [state, setState] = useState<PlayStateForMain | null>(null)
  const [monitors, setMonitors] = useState<MonitorsChanged | null>(null)
  const [notices, setNotices] = useState<Notice[]>([])
  const [error, setError] = useState<string | null>(null)
  const [recipeId, setRecipeId] = useState('')

  useEffect(() => {
    const offs: Array<() => void> = []
    void on<PlayStateForMain>('play-state', setState).then((off) => offs.push(off))
    void on<MonitorsChanged>('monitors-changed', setMonitors).then((off) => offs.push(off))
    void on<Notice>('notice', (n) => setNotices((all) => [n, ...all].slice(0, 5))).then((off) =>
      offs.push(off),
    )
    return () => offs.forEach((off) => off())
  }, [])

  /** Every button is this: run a command, show the refusal if there is one. */
  const run = useCallback(async (fn: () => Promise<unknown>) => {
    setError(null)
    try {
      await fn()
    } catch (caught) {
      setError(isHostError(caught) ? `${caught.code}: ${caught.message}` : String(caught))
    }
  }, [])

  useEffect(() => {
    void run(async () => {
      const list = await command<{ id: string }[]>('recipe_list', { scope: 'active' })
      const first = list[0]
      if (first) setRecipeId(first.id)
      setMonitors({
        monitors: await command('monitors_list'),
        stageMonitorId: null,
        stageOn: null,
      })
    })
  }, [run])

  if (!hasHost()) {
    return (
      <Frame>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>questiongame Studio</h1>
        <p style={{ margin: 0, color: THEME.muted }}>
          No host. Run the desktop app with <code>npm run dev:app</code>; this dev server on its
          own has no Rust behind it.
        </p>
      </Frame>
    )
  }

  const play = state
  const session = play?.session ?? null
  return (
    <Frame>
      <h1 style={{ margin: 0, fontSize: '1.5rem' }}>questiongame Studio — P6 harness</h1>

      <Row>
        <input
          value={recipeId}
          onChange={(e) => setRecipeId(e.target.value)}
          placeholder="recipe id"
          style={{ padding: '0.35rem 0.5rem', borderRadius: 'var(--radius)' }}
        />
        <Btn
          onClick={() =>
            run(() =>
              command('play_load', { recipeId, playId: `play-${Date.now()}` }),
            )
          }
        >
          Control Load
        </Btn>
        <Btn onClick={() => run(() => command('play_start'))}>Start</Btn>
        <Btn
          onClick={() =>
            run(async () => {
              const recipe = await command<{ id: string }>('seed_demo_library')
              setRecipeId(recipe.id)
            })
          }
        >
          Seed demo
        </Btn>
        <Btn onClick={() => run(() => command('pause'))}>Pause</Btn>
        <Btn onClick={() => run(() => command('resume'))}>Resume</Btn>
        <Btn onClick={() => run(() => command('undo_turn'))} disabled={!play?.operator.canUndo}>
          Undo
        </Btn>
        <Btn onClick={() => run(() => command('redo_turn'))} disabled={!play?.operator.canRedo}>
          Redo
        </Btn>
      </Row>

      <Row>
        {STAGE_SCREENS.map((screen: StageScreen) => (
          <Btn
            key={screen}
            active={play?.currentScreen === screen}
            onClick={() => run(() => command('show_screen', { screen }))}
          >
            {screen}
          </Btn>
        ))}
      </Row>

      <Row>
        {play?.domains.map((domain) => (
          <Btn
            key={domain.id}
            disabled={domain.exhausted}
            onClick={() => run(() => command('choose_domain', { domainId: domain.id }))}
          >
            {`${domain.code} (${domain.remaining})`}
          </Btn>
        ))}
      </Row>

      <Row>
        {session?.options.map((option) => (
          <Btn
            key={option.id}
            active={session.selectedOptionIds.includes(option.id)}
            onClick={() => run(() => command('set_selection', { optionIds: [option.id] }))}
          >
            {option.text}
          </Btn>
        ))}
        {session ? (
          <>
            <Btn onClick={() => run(() => command('reveal_stem'))}>Reveal stem</Btn>
            <Btn onClick={() => run(() => command('reveal_next_option'))}>Reveal option</Btn>
            <Btn onClick={() => run(() => command('start_timer'))}>Timer</Btn>
            <Btn onClick={() => run(() => command('lock_selection'))}>Lock</Btn>
            <Btn onClick={() => run(() => command('reveal_outcome'))}>Reveal outcome</Btn>
          </>
        ) : null}
      </Row>

      <Row>
        {play?.operator.legalTokenTargets.map((teamId) => (
          <Btn
            key={teamId}
            active={teamId === play.operator.defaultNextTeamId}
            onClick={() => run(() => command('give_token', { teamId }))}
          >
            {`give → ${teamId}`}
          </Btn>
        ))}
      </Row>

      <section>
        <h2 style={{ fontSize: '0.9rem', margin: '0 0 0.4rem' }}>Stage display</h2>
        <Row>
          <Btn onClick={() => run(() => command('stage_open'))}>Open Stage</Btn>
          <Btn onClick={() => run(() => command('stage_set_monitor', { monitorId: null }))}>
            Primary
          </Btn>
          {monitors?.monitors.map((m) => (
            <Btn
              key={m.key}
              active={monitors.stageOn === m.key}
              onClick={() => run(() => command('stage_set_monitor', { monitorId: m.key }))}
            >
              {`${m.name ?? m.key}${m.primary ? ' (primary)' : ''}`}
            </Btn>
          ))}
        </Row>
      </section>

      {error ? (
        <p style={{ margin: 0, color: THEME.danger, fontFamily: 'monospace' }}>{error}</p>
      ) : null}

      {notices.map((notice, i) => (
        <p key={`${notice.code}-${i}`} style={{ margin: 0, color: THEME.warning, fontFamily: 'monospace' }}>
          {`${notice.severity} ${notice.code} ${JSON.stringify(notice.detail)} [${notice.actions.join(', ')}]`}
        </p>
      ))}

      <pre
        style={{
          margin: 0,
          padding: '0.75rem',
          borderRadius: 'var(--radius)',
          background: THEME.muted,
          color: THEME.background,
          fontSize: '0.75rem',
          maxHeight: '40vh',
          overflow: 'auto',
        }}
      >
        {play ? JSON.stringify(play, null, 2) : 'no play loaded'}
      </pre>
    </Frame>
  )
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '1.5rem',
        background: THEME.background,
        color: THEME.foreground,
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        alignItems: 'stretch',
      }}
    >
      {children}
    </div>
  )
}

function Row({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>{children}</div>
}

function Btn({
  children,
  onClick,
  disabled,
  active,
}: {
  children: React.ReactNode
  onClick: () => void
  disabled?: boolean | undefined
  active?: boolean | undefined
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '0.3rem 0.6rem',
        borderRadius: 'var(--radius)',
        border: `1px solid ${THEME.muted}`,
        background: active ? THEME.accent : 'transparent',
        color: active ? THEME.background : THEME.foreground,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'default' : 'pointer',
        fontSize: '0.8rem',
      }}
    >
      {children}
    </button>
  )
}
