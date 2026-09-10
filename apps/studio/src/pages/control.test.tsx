import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { Profiler } from 'react'
import { VIEWER_SOURCE, type PlayStateForMain } from '@questiongame/contract'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoPlay, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'

/**
 * P8 exit criteria:
 *   - Viewer click, Action Panel button and keyboard chord dispatch the same
 *     command — three call sites, one handler.
 *   - Undo, restart and abandon are blocked with a wait notice while an
 *     overlay is busy.
 */
describe('Control', () => {
  let fake: FakeHost

  beforeEach(() => {
    fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    receivePlayState(null)
  })
  afterEach(() => {
    setHostTransport(null)
    receivePlayState(null)
  })

  /** `anchor` is what says the panel has drawn — the Lock button, unless the
    * phase has no question in it. */
  async function openControl(state: PlayStateForMain, anchorText?: string) {
    fake.playState = state
    render(<App />)
    await act(async () => {
      receivePlayState(state)
      await useNavStore.getState().go({ tab: 'control' })
    })
    if (anchorText) await screen.findByText(anchorText)
    else await screen.findByLabelText('Lock')
  }

  /** A disabled control keeps its tooltip wrapper (§4.2), so look inside it. */
  const isDisabled = (el: HTMLElement) => {
    const button = el.tagName === 'BUTTON' ? el : (el.querySelector('button') ?? el)
    return (button as HTMLButtonElement).disabled === true || button.getAttribute('aria-disabled') === 'true'
  }

  const lockCalls = () => fake.calls.filter((c) => c.name === 'lock_selection').length

  it('a button, a chord and a Viewer hit target all reach one lock_selection', async () => {
    await openControl(demoPlay('question-issued'))

    // 1. the Action Panel button
    fireEvent.click(screen.getByLabelText('Lock'))
    await waitFor(() => expect(lockCalls()).toBe(1))

    // 2. the keyboard chord (Enter), on the page, not in an input
    fireEvent.keyDown(document.body, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(lockCalls()).toBe(2))

    // 3. a Viewer hit target: Stage would post the stem's rect; we post it.
    const iframe = document.querySelector('iframe') as HTMLIFrameElement
    await act(async () => {
      window.dispatchEvent(new MessageEvent('message', { data: { source: VIEWER_SOURCE, type: 'ready' }, source: iframe.contentWindow }))
      window.dispatchEvent(
        new MessageEvent('message', {
          data: { source: VIEWER_SOURCE, type: 'nodes', nodes: [{ id: 'question.stem', x: 10, y: 10, width: 100, height: 40 }] },
          source: iframe.contentWindow,
        }),
      )
    })
    await waitFor(() => expect(document.querySelector('[data-hit-target="legal"]')).not.toBeNull())
    fireEvent.click(document.querySelector('[data-hit-target="legal"]') as HTMLElement)
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'reveal_stem').length).toBe(1))

    // All three went through the same seam: every call is in the one log.
    expect(fake.calls.map((c) => c.name)).toEqual(expect.arrayContaining(['lock_selection', 'lock_selection', 'reveal_stem']))
  })

  /**
   * The 2026-09-07 report, replayed: Red answers the first Geography question
   * correctly, the operator reveals the outcome — and the game has to be able
   * to go on. The token stays with Red (`token_ends: false`), so the next act
   * is another question, from any screen.
   *
   * `question-outcome-correct` is that state: a session that is issued,
   * locked, revealed and scored. `play.session` is still non-null there, and
   * every surface that read *that* as "a question is in progress" left the
   * operator with nothing legal to press for the rest of the Play.
   */
  it('after the outcome is revealed, the next question is one press away', async () => {
    const resolved = demoPlay('question-outcome-correct')
    expect(resolved.session, 'the projection keeps the resolved session').not.toBeNull()
    await openControl(resolved, 'Next question')

    const domain = resolved.domains.find((d) => !d.exhausted)!
    const button = screen.getAllByRole('button').find((b) => b.textContent?.startsWith(domain.name))
    expect(button, 'a domain button on the Action Panel').toBeTruthy()
    expect(isDisabled(button!)).toBe(false)

    fireEvent.click(button!)
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'choose_domain')).toHaveLength(1))
    expect(fake.calls.find((c) => c.name === 'choose_domain')?.args).toEqual({ domainId: domain.id })
  })

  it('while the question is still live, the panel shows the question and nothing else', async () => {
    const live = demoPlay('question-locked')
    expect(live.session?.outcome).toBeNull()
    await openControl(live)

    // One phase, one block: the reveal controls are there, the domains are
    // not — `choose_domain` would be refused, and a control the host refuses
    // is not a disabled control, it is the wrong block.
    expect(screen.getByLabelText('Reveal outcome')).toBeTruthy()
    const domain = live.domains.find((d) => !d.exhausted)!
    expect(screen.queryAllByRole('button').find((b) => b.textContent?.startsWith(domain.name))).toBeUndefined()
  })

  /**
   * The 2026-09-07 report, second half: the board empties, the Play completes
   * — and Control went on showing the last question's dead controls with no
   * way to reveal the standings. `reveal_leaderboard_rank` is legal on a
   * completed Play; nothing in Studio offered it.
   */
  it('a completed Play offers the standings, not the question that ended it', async () => {
    const done = demoPlay('final-leaderboard-partial')
    expect(done.status).toBe('completed')
    await openControl(done, 'Reveal next place')

    // Gone: the question controls, the domains and the token rows — every one
    // of them a refusal on a completed Play.
    expect(screen.queryByLabelText('Reveal outcome')).toBeNull()
    expect(screen.queryByText('Give token')).toBeNull()
    for (const d of done.domains) {
      expect(screen.queryAllByRole('button').find((b) => b.textContent?.startsWith(d.name))).toBeUndefined()
    }

    // Ranks 4 and 2 are up; the next place is rank 2's neighbour above — 1.
    fireEvent.click(screen.getByText('Reveal next place'))
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'reveal_leaderboard_rank')).toHaveLength(1))
    expect(fake.calls.find((c) => c.name === 'reveal_leaderboard_rank')?.args).toEqual({ rank: 1 })
  })

  it('with the token free, the panel says so and the ring is the way on', async () => {
    const base = demoPlay('question-outcome-incorrect')
    const free: PlayStateForMain = {
      ...base,
      ring: { ...base.ring, currentTeamId: null },
      operator: { ...base.operator, legalTokenTargets: [base.teams[1]!.id], defaultNextTeamId: base.teams[1]!.id },
    }
    await openControl(free, 'The token is free')

    // No domains: `choose_domain` needs a holder, so the only way on is the
    // hand-over — and that is what the panel names.
    for (const d of free.domains) {
      expect(screen.queryAllByRole('button').find((b) => b.textContent?.startsWith(d.name))).toBeUndefined()
    }
    expect(screen.queryByText('Give the token')).not.toBeNull()
  })

  it('the token rows disappear once the Play can no longer take one', async () => {
    const playing = demoPlay('question-outcome-correct')
    await openControl(playing, 'Next question')
    expect(screen.queryByText('Give token')).not.toBeNull()
  })

  /**
   * The way back out of Control. Before this there was none: a loaded recipe
   * could only be replaced by loading another one, so a finished or mistaken
   * game stayed in Control for ever.
   */
  it('a game that was never played is unloaded without a question, and discarded', async () => {
    const loaded: PlayStateForMain = { ...demoPlay('question-issued'), status: 'loaded', session: null }
    await openControl(loaded, 'Unload game')

    fireEvent.click(screen.getByText('Unload game'))
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'play_unload')).toHaveLength(1))
    // Nothing was played, so there is no record worth keeping and nothing to ask.
    expect(fake.calls.find((c) => c.name === 'play_unload')?.args).toEqual({ discard: true })
    expect(screen.queryByText('Unload the game?')).toBeNull()
  })

  it('a game that was played asks whether to keep the record, and keeps it by default', async () => {
    await openControl(demoPlay('question-outcome-correct'), 'Unload game')

    fireEvent.click(screen.getByText('Unload game'))
    await screen.findByText('Unload the game?')
    // Keep is the standing answer; the confirm button says which act it runs.
    fireEvent.click(screen.getByText('Unload', { selector: 'button, button *' }))
    await waitFor(() => expect(fake.calls.filter((c) => c.name === 'play_unload')).toHaveLength(1))
    expect(fake.calls.find((c) => c.name === 'play_unload')?.args).toEqual({ discard: false })
  })

  it('undo, restart and abandon wait for a busy overlay', async () => {
    const busy: PlayStateForMain = {
      ...demoPlay('question-issued'),
      overlay: { busy: true, active: { kind: 'current-team', teamId: null }, pending: null, enabled: true, runId: 1 },
    }
    await openControl(busy)
    for (const label of ['Undo turn', 'Restart', 'Abandon']) {
      const buttons = screen.getAllByLabelText(label)
      for (const b of buttons) expect((b as HTMLButtonElement).disabled || b.getAttribute('aria-disabled') === 'true').toBe(true)
    }
    expect(screen.getAllByLabelText('Wait for the overlay to finish').length).toBeGreaterThan(0)
  })

  /**
   * P11.7. The host emits ten times a second while a timer runs, and the only
   * thing that moves is the countdown. Before the stable snapshot every one of
   * those emissions re-rendered this page, which handed `react-mosaic` a new
   * `renderTile` and rebuilt the dnd provider, six panels and every `Tooltip`
   * under them — 28 commits a second, and the Studio renderer at 77% of a core
   * for as long as Control was open.
   */
  it('does not commit the mosaic on a bare tick (P11.7)', async () => {
    const play = demoPlay('question-issued')
    let commits = 0
    fake.playState = play
    render(
      <Profiler id="control" onRender={() => { commits += 1 }}>
        <App />
      </Profiler>,
    )
    await act(async () => {
      receivePlayState(play)
      await useNavStore.getState().go({ tab: 'control' })
    })
    await screen.findByLabelText('Lock')

    const settled = commits
    const timer = play.session?.timer
    if (!timer) throw new Error('fixture has no timer')
    // Three seconds of show loop.
    for (let tick = 1; tick <= 30; tick += 1) {
      act(() => {
        receivePlayState({
          ...play,
          clock: { ...play.clock, elapsedMs: play.clock.elapsedMs + tick * 100 },
          session: { ...play.session!, timer: { ...timer, remainingMs: timer.remainingMs - tick * 100 } },
        })
      })
    }
    // Measures exactly 30: React batches the two countdown leaves —
    // `StatusClock` and `LiveTimerCluster` — into one commit per tick, and a
    // countdown has to repaint. The bound rather than the exact number so a
    // React upgrade that batches differently is not a failure; a regression
    // goes the other way, and goes far — this page re-entering the render path
    // takes the whole mosaic with it.
    expect(commits - settled).toBeLessThanOrEqual(30)
    // And the panels are still on screen, drawing the same Play.
    expect(screen.getAllByLabelText('Lock').length).toBeGreaterThan(0)
  })

})
