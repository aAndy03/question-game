import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'

/** Every page renders against the fake host, with and without a library. */
const ROUTES: Route[] = [
  { tab: 'teams' },
  { tab: 'teams', id: 'team-alpha', mode: 'view' },
  { tab: 'teams', id: 'team-alpha', mode: 'edit' },
  { tab: 'teams', mode: 'new' },
  { tab: 'library' },
  { tab: 'library', domainId: 'dom-history' },
  { tab: 'library', questionId: 'q-h1', mode: 'view' },
  { tab: 'library', questionId: 'q-h1', mode: 'edit' },
  { tab: 'library', mode: 'new' },
  { tab: 'games' },
  { tab: 'games', id: 'recipe-demo' },
  { tab: 'games', id: 'recipe-demo', section: 'board' },
  { tab: 'games', id: 'recipe-demo', section: 'rules' },
  { tab: 'games', id: 'recipe-demo', section: 'plays' },
  { tab: 'operators' },
  { tab: 'operators', id: 'op-andy', mode: 'view' },
  { tab: 'operators', mode: 'new' },
  { tab: 'control' },
  { tab: 'screens' },
  { tab: 'statistics' },
  { tab: 'settings' },
]

describe('pages', () => {
  beforeEach(() => {
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    receivePlayState(null)
  })
  afterEach(() => setHostTransport(null))

  for (const seeded of [true, false]) {
    for (const route of ROUTES) {
      it(`${JSON.stringify(route)} renders ${seeded ? 'with' : 'without'} a library`, async () => {
        const fake = createFakeHost()
        // "Without a library" still has an operator: no operator at all is
        // first run (§12.1), which renders the wizard instead of the shell.
        if (seeded) fake.seed(demoLibrary(), [demoRecipe()])
        else fake.seed(demoLibrary().filter((row) => row.kind === 'operator'))
        setHostTransport(fake)
        render(<App />)
        await act(async () => {
          await useNavStore.getState().go(route)
        })
        // The shell is always there; the page mounted without throwing.
        expect(await screen.findByLabelText('Sections')).toBeTruthy()
      })
    }
  }

  it('renders first run instead of the shell while no operator exists (§12.1)', async () => {
    const fake = createFakeHost()
    setHostTransport(fake)
    render(<App />)
    expect(await screen.findByLabelText('Setup steps')).toBeTruthy()
    expect(screen.queryByLabelText('Sections')).toBeNull()
  })

  it('opens the Settings inner tab the route names', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'shortcuts' })
    })
    expect(await screen.findByText('Keyboard shortcuts', { selector: '[role="tab"]' })).toBeTruthy()
    expect(document.querySelector('[data-shortcuts-editor]')).not.toBeNull()
  })

  it('blocks Screens while a Play is open, with a two-action notice', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await screen.findByLabelText('Sections')
    act(() => {
      receivePlayState({
        ...EMPTY_PLAY_STATE,
        playId: 'p1',
        status: 'playing',
        operator: {
          recipeId: 'recipe-demo',
          legalTokenTargets: [],
          defaultNextTeamId: null,
          consecutiveCorrect: 0,
          isRehearsal: false,
          canUndo: false,
          canRedo: false,
          eventCount: 1,
          showGiveToken: false,
          overrideAfterLock: 'refuse_until_reveal',
          disabled: [],
        },
      })
    })
    await act(async () => {
      await useNavStore.getState().go({ tab: 'screens' })
    })
    expect(useNavStore.getState().route.tab).not.toBe('screens')
    const notice = useNoticeStore.getState().notices[0]
    expect(notice?.code).toBe('screens.blocked')
    expect(notice?.actions.length).toBe(2)
  })
})
