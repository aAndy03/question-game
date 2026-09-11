import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
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

/**
 * Saving is one act: write the row, then go to it. The editor used to ask
 * "unsaved changes?" *after* the write, because the nav guard read a dirty
 * flag React had not re-rendered yet — and answering Save re-ran a save
 * against a draft the refetch had meanwhile reset to blank, which is where the
 * empty editor and "a question needs a stem" came from.
 */
describe('the question editor saves once and leaves', () => {
  beforeEach(() => {
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    receivePlayState(null)
  })
  afterEach(() => setHostTransport(null))

  const typeAQuestion = async () => {
    const stem = await screen.findByLabelText('Question', { selector: 'textarea' })
    fireEvent.change(stem, { target: { value: 'What is the capital of Chile?' } })
    const options = screen.getAllByLabelText(/^Option [AB]$/)
    fireEvent.change(options[0] as HTMLElement, { target: { value: 'Santiago' } })
    fireEvent.change(options[1] as HTMLElement, { target: { value: 'Valparaiso' } })
  }

  it('writes a new question, keeps no dialog, and lands on the row it wrote', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', mode: 'new', domainId: 'dom-history' })
    })
    await typeAQuestion()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })

    await waitFor(() => expect(useNavStore.getState().route).toMatchObject({ tab: 'library', mode: 'view' }))
    expect(screen.queryByText('Unsaved changes')).toBeNull()
    // One write, not two: the dialog's own Save used to run the whole body a
    // second time, against a draft that had already been reset.
    expect(fake.calls.filter((c) => c.name === 'catalog_upsert').length).toBe(1)
  })

  it('keeps what was typed when a catalog refresh arrives under the editor', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', mode: 'new', domainId: 'dom-history' })
    })
    await typeAQuestion()

    // The domain list changing under the editor is the ordinary case — the
    // membership write emits `catalog-changed` for every domain it touched.
    await act(async () => {
      fake.emit('catalog-changed', { kind: 'domain', id: 'dom-history', op: 'upserted' })
    })

    const stem = await screen.findByLabelText('Question', { selector: 'textarea' })
    expect((stem as HTMLTextAreaElement).value).toBe('What is the capital of Chile?')
  })

  it('saves a question that is still incomplete, and says what it lacks (§2.32)', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', mode: 'new' })
    })
    const stem = await screen.findByLabelText('Question', { selector: 'textarea' })
    fireEvent.change(stem, { target: { value: 'Only the question so far?' } })

    // The two blank option rows a new question opens with are not options.
    expect(await screen.findByText('Incomplete — a game cannot use this question yet')).toBeTruthy()
    expect(screen.getByText('Fewer than two options · No correct answer · In no domain')).toBeTruthy()

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Save' }))
    })
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_upsert')).toBe(true))
    const saved = [...fake.library.values()].find((row) => row.kind === 'question' && row.item.stem === 'Only the question so far?')
    expect(saved?.kind === 'question' ? saved.item.options : null).toEqual([])
  })

  it('has nothing to say about a complete question', async () => {
    const fake = createFakeHost()
    fake.seed(demoLibrary(), [demoRecipe()])
    setHostTransport(fake)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', mode: 'new', domainId: 'dom-history' })
    })
    await typeAQuestion()
    expect(screen.queryByText('Incomplete — a game cannot use this question yet')).toBeNull()
  })
})
