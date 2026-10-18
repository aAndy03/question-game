import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, FAKE_PATHS, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { FIELD, HOTKEYS, OPERATOR } from '@/copy'
import { SETTINGS, SETTINGS_GROUPS } from '@/copy/settings'
import { FIRST_RUN } from '@/copy/firstRun'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'

/**
 * P10 (05_STUDIO_DESIGN.md §12) on the Studio side: the Settings tab, the
 * shortcut table, the gated data actions, the pin, and first run. Everything
 * here goes through the fake host, so a refusal is the host's own.
 */

const OPEN_PLAY = {
  ...EMPTY_PLAY_STATE,
  playId: 'p1',
  status: 'playing' as const,
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
    overrideAfterLock: 'refuse_until_reveal' as const,
    disabled: [],
  },
}

function mount(seeded = true): FakeHost {
  const fake = createFakeHost()
  if (seeded) fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
  return fake
}

const commandNames = (fake: FakeHost) => fake.calls.map((c) => c.name)

/** HeroUI paints a disabled control with the attribute *and* the ARIA state. */
const isDisabled = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true' || el.hasAttribute('data-disabled')

const reset = () => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [] })
  receivePlayState(null)
}

describe('Settings', () => {
  beforeEach(reset)
  afterEach(() => setHostTransport(null))

  // The whole Settings tab, every group, under a full `npm test` with every
  // project's workers competing: 4.7 s of the 5 s default on 2026-09-08. The
  // budget is set to what the test needs, not to what a quiet machine allows.
  it('renders every settings group from the one table', { timeout: 20_000 }, async () => {
    mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    for (const group of SETTINGS_GROUPS) {
      // By section: a group's title can also be a row's label inside it
      // ("Timer"), and a switch now carries its label as `aria-label`.
      expect(await screen.findByLabelText(group.title, { selector: 'section' }), group.id).toBeTruthy()
    }
  })

  it('Data lists the data folder, the log and the performance log (P12.1)', async () => {
    mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    expect(await screen.findByText(FAKE_PATHS.logFile, undefined, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(FAKE_PATHS.perfDir)).toBeTruthy()
    expect(screen.getByText(SETTINGS.paths.logFile)).toBeTruthy()
    expect(screen.getByText(SETTINGS.paths.perfDir)).toBeTruthy()
    expect(screen.getByText(FAKE_PATHS.backups)).toBeTruthy()
    expect(screen.getByText(SETTINGS.paths.backups)).toBeTruthy()
  })

  it('About shows the version, the GPL and the GSAP permission (P12.3)', async () => {
    mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'about' })
    })
    expect(await screen.findByText(SETTINGS.about.version('1.0.1', 'dev'))).toBeTruthy()
    expect(screen.getByText(SETTINGS.about.gplSummary)).toBeTruthy()
    expect(screen.getByText(SETTINGS.about.gsapPermission)).toBeTruthy()
    await waitFor(() => expect(screen.getAllByText(SETTINGS.about.notGenerated).length).toBe(2))
  })

  it('offers no in-app uninstall where the installer put no uninstaller (P12.2)', async () => {
    mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    await screen.findByText(FAKE_PATHS.logFile, undefined, { timeout: 5000 })
    expect(screen.queryByRole('button', { name: SETTINGS.data.uninstallApp })).toBeNull()
  })

  it('Uninstall… arms, confirms and starts the uninstaller (P12.2)', async () => {
    const fake = mount()
    fake.paths = { ...fake.paths, uninstaller: 'C:\\Users\\operator\\AppData\\Local\\questiongame\\uninstall.exe' }
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    await screen.findByText(FAKE_PATHS.logFile, undefined, { timeout: 5000 })
    fireEvent.click(await screen.findByRole('button', { name: SETTINGS.data.uninstallApp }))
    fireEvent.click(await screen.findByRole('button', { name: SETTINGS.data.uninstallAppArm }))
    fireEvent.click(await screen.findByRole('button', { name: SETTINGS.data.uninstallAppArmed }))
    await waitFor(() => expect(fake.uninstallerStarted).toBe(true))
  })

  it('Uninstall… is disabled with a reason while a Play is open (P12.2)', async () => {
    const fake = mount()
    fake.paths = { ...fake.paths, uninstaller: 'C:\\questiongame\\uninstall.exe' }
    // Before render: the bridge's `get_state` answers on mount.
    fake.playState = OPEN_PLAY
    receivePlayState(OPEN_PLAY)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    await screen.findByText(FAKE_PATHS.logFile, undefined, { timeout: 5000 })
    await waitFor(() => expect(isDisabled(screen.getByRole('button', { name: SETTINGS.data.uninstallApp }))).toBe(true))
  })

  /**
   * Every switch in Studio is a `SwitchField`, and a `SwitchField` that
   * renders no `Switch.Content` is decorative markup: HeroUI v3's `Switch`
   * root is React Aria's `SwitchField`, which has no input and no ARIA of its
   * own. This asserts the thing the operator actually needs — that a switch
   * can be operated and that the host hears about it — rather than that one
   * is on screen.
   */
  it('a settings switch is an operable control and reaches the host', async () => {
    const fake = mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    const label = SETTINGS.rows['judging.partial_credit'].label
    const control = await screen.findByRole('switch', { name: label })
    const before = (control as HTMLInputElement).checked
    await act(async () => {
      fireEvent.click(control)
    })
    await waitFor(() => expect(commandNames(fake)).toContain('settings_set_global'))
    await waitFor(() => expect((screen.getByRole('switch', { name: label }) as HTMLInputElement).checked).toBe(!before))
  })

  it("shows the host's reason on a key frozen by an open Play", async () => {
    const fake = mount()
    // Two halves of one truth: the host freezes (`settings_get.disabled`) and
    // Studio reads a Play as open (`play-state`).
    fake.playState = OPEN_PLAY
    receivePlayState(OPEN_PLAY)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    // The reason is the host's word, rendered; nothing here recomputes it.
    const frozen = await screen.findAllByText(FIELD.frozen)
    expect(frozen.length).toBeGreaterThan(0)
  })

  it('disables both data actions with a reason while a Play is open', async () => {
    const fake = mount()
    fake.playState = OPEN_PLAY
    receivePlayState(OPEN_PLAY)
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    const wipe = await screen.findByRole('button', { name: SETTINGS.data.wipePlays })
    const uninstall = await screen.findByRole('button', { name: SETTINGS.data.uninstall })
    expect(isDisabled(wipe)).toBe(true)
    expect(isDisabled(uninstall)).toBe(true)
  })
})

describe('Settings > Keyboard shortcuts', () => {
  beforeEach(reset)
  afterEach(() => setHostTransport(null))

  async function shortcuts() {
    const fake = mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'shortcuts' })
    })
    await screen.findByText(HOTKEYS.labels['reveal_outcome'] as string)
    return fake
  }

  /** Press the row's chord button, then send one keydown. */
  async function record(label: string, key: string, code: string) {
    const field = await screen.findByRole('button', { name: label })
    await act(async () => {
      fireEvent.click(field)
    })
    await act(async () => {
      fireEvent.keyDown(field, { key, code })
    })
  }

  it('a recorded chord is one settings_set_shortcut', async () => {
    const fake = await shortcuts()
    await record(HOTKEYS.labels['reveal_outcome'] as string, 'y', 'KeyY')
    await waitFor(() => expect(commandNames(fake).filter((n) => n === 'settings_set_shortcut')).toHaveLength(1))
    expect(fake.calls.find((c) => c.name === 'settings_set_shortcut')?.args).toMatchObject({ command: 'reveal_outcome', chord: 'y' })
  })

  it('a chord already bound is a two-action notice, and Reassign issues both writes', async () => {
    const fake = await shortcuts()
    // `s` is Reveal question's default: binding it here is a conflict.
    await record(HOTKEYS.labels['reveal_outcome'] as string, 's', 'KeyS')
    expect(commandNames(fake)).not.toContain('settings_set_shortcut')
    expect(await screen.findByRole('button', { name: 'Keep' })).toBeTruthy()
    const reassign = await screen.findByRole('button', { name: 'Reassign' })
    await act(async () => {
      fireEvent.click(reassign)
    })
    await waitFor(() => expect(commandNames(fake).filter((n) => n === 'settings_set_shortcut')).toHaveLength(2))
    expect(fake.calls.filter((c) => c.name === 'settings_set_shortcut').map((c) => c.args)).toEqual([
      { command: 'reveal_stem', chord: null },
      { command: 'reveal_outcome', chord: 's' },
    ])
  })
})

describe('the operator pin', () => {
  beforeEach(reset)
  afterEach(() => setHostTransport(null))

  it('asks for the pin and sends the digits to operator_activate', async () => {
    const fake = mount()
    render(<App />)
    await act(async () => {
      // op-guest is the pinned operator in the demo library.
      await useNavStore.getState().go({ tab: 'operators', id: 'op-guest', mode: 'view' })
    })
    const make = await screen.findByRole('button', { name: OPERATOR.makeActive })
    await act(async () => {
      fireEvent.click(make)
    })
    expect(await screen.findByText(SETTINGS.pin.promptBody('Guest operator'))).toBeTruthy()
    expect(commandNames(fake)).not.toContain('operator_activate')

    const input = document.querySelector('input[type="password"]') as HTMLInputElement
    await act(async () => {
      fireEvent.change(input, { target: { value: '1234' } })
    })
    const unlock = await screen.findByRole('button', { name: SETTINGS.pin.unlock })
    await act(async () => {
      fireEvent.click(unlock)
    })
    await waitFor(() => expect(commandNames(fake)).toContain('operator_activate'))
    // Studio never hashes: the digits go as typed (§2.15).
    expect(fake.calls.find((c) => c.name === 'operator_activate')?.args).toEqual({ id: 'op-guest', pin: '1234' })
  })
})

describe('first run', () => {
  beforeEach(reset)
  afterEach(() => setHostTransport(null))

  it('cannot skip the operator step, and creating one activates it', async () => {
    const fake = mount(false)
    render(<App />)
    await screen.findByLabelText(FIRST_RUN.stepsLabel)
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: FIRST_RUN.next }))
    })

    const skip = await screen.findByRole('button', { name: FIRST_RUN.skip })
    expect(isDisabled(skip)).toBe(true)
    const create = await screen.findByRole('button', { name: FIRST_RUN.operator.create })
    expect(isDisabled(create)).toBe(true)

    const name = await screen.findByLabelText(FIRST_RUN.operator.displayName)
    await act(async () => {
      fireEvent.change(name, { target: { value: 'Andy' } })
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: FIRST_RUN.operator.create }))
    })
    await waitFor(() => expect(commandNames(fake)).toContain('operator_activate'))
    expect(commandNames(fake)).toContain('catalog_upsert')
    // The sample step follows, and the shell is still not up.
    expect(await screen.findByRole('button', { name: FIRST_RUN.sample.load })).toBeTruthy()
  })

  it('seeds both sample games and opens the one picked (§17.5)', { timeout: 20_000 }, async () => {
    const fake = mount(false)
    render(<App />)
    await screen.findByLabelText(FIRST_RUN.stepsLabel)
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: FIRST_RUN.next }))
    })
    await act(async () => {
      fireEvent.change(await screen.findByLabelText(FIRST_RUN.operator.displayName), { target: { value: 'Andy' } })
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: FIRST_RUN.operator.create }))
    })
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: FIRST_RUN.sample.loadRo }))
    })
    await waitFor(() => expect(fake.recipes.has('seed-recipe-demo-ro')).toBe(true))
    expect(fake.recipes.has('seed-recipe-demo')).toBe(true)
    expect(fake.recipes.get('seed-recipe-demo-ro')?.settings.language).toBe('ro')
    expect(fake.recipes.get('seed-recipe-demo')?.settings.language).toBe('en')
  })
})

describe('two sample games (§17.5)', () => {
  beforeEach(reset)
  afterEach(() => setHostTransport(null))

  it('has one Restore row per Demo, and each restores only its own', { timeout: 20_000 }, async () => {
    const fake = mount()
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'settings', inner: 'settings' })
    })
    const ro = await screen.findByRole('button', { name: SETTINGS.library.restore.ro })
    expect(screen.getByRole('button', { name: SETTINGS.library.restore.en })).toBeTruthy()
    await act(async () => {
      fireEvent.click(ro)
    })
    await waitFor(() => expect(fake.recipes.has('seed-recipe-demo-ro')).toBe(true))
    expect(fake.recipes.get('seed-recipe-demo-ro')?.settings.language).toBe('ro')
    expect(fake.recipes.has('seed-recipe-demo')).toBe(false)
    const romanian = [...fake.library.values()].filter((row) => row.item.id.startsWith('seed-ro-'))
    expect(romanian).toHaveLength(22)
  })
})
