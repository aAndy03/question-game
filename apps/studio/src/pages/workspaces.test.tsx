import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EMPTY_PLAY_STATE, type PlayStateForMain } from '@questiongame/contract'
import { App } from '@/App'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { resetUpdateCheck } from '@/host/updates'
import { resetWhatsNew } from '@/host/whatsNew'
import { BETA_WELCOME } from '@/copy/beta'
import { FIRST_RUN } from '@/copy/firstRun'
import { TRANSFER, WORKSPACE } from '@/copy/workspaces'
import type { CatalogItem } from '@/host/types'

/** Beta 2.0 in Studio: naming, the switcher, Manage workspaces. */
let fake: FakeHost
const calls = (name: string) => fake.calls.filter((c) => c.name === name)

const operator: CatalogItem = {
  kind: 'operator',
  item: { id: 'op', displayName: 'Ana', pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null },
}

async function withOperator() {
  fake.seed([operator])
  await fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op' } })
  fake.calls.length = 0
}

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  receivePlayState(null)
  resetUpdateCheck()
  resetWhatsNew()
  fake = createFakeHost()
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe('naming the workspace', () => {
  it('comes after the Beta welcome and before first run, and suggests nothing', async () => {
    fake.channel = 'beta'
    fake.workspaces = fake.workspaces.map((w) => ({ ...w, name: null }))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: BETA_WELCOME.en.empty }))

    expect(await screen.findByText(WORKSPACE.createTitle)).toBeTruthy()
    expect(screen.queryByText(FIRST_RUN.paths.title)).toBeNull()
    const field = screen.getByRole('textbox', { name: new RegExp(WORKSPACE.nameLabel) }) as HTMLInputElement
    expect(field.value).toBe('')
    expect(field.getAttribute('placeholder')).toBeNull()
    const go = screen.getByRole('button', { name: WORKSPACE.continue })
    expect(go.hasAttribute('disabled') || go.getAttribute('aria-disabled') === 'true' || go.hasAttribute('data-disabled')).toBe(true)

    fireEvent.change(field, { target: { value: '  Club 2026 ' } })
    fireEvent.click(screen.getByRole('button', { name: WORKSPACE.continue }))
    expect(await screen.findAllByText(FIRST_RUN.paths.title)).not.toHaveLength(0)
    expect(fake.workspaces[0]?.name).toBe('Club 2026')
  })

  it('asks a library with work in it to name, not create, its workspace', async () => {
    await withOperator()
    fake.workspaces = fake.workspaces.map((w) => ({ ...w, name: null }))
    render(<App />)
    expect(await screen.findByText(WORKSPACE.nameTitle)).toBeTruthy()
  })

  it('shows a refused name on the field and stays', async () => {
    await withOperator()
    fake.workspaces = [
      { ...fake.workspaces[0]!, name: null },
      { id: 'ws-2', name: 'Taken', groupId: null, sortKey: 1, settings: null, createdAt: 1, updatedAt: 1, archivedAt: null },
    ]
    render(<App />)
    const field = await screen.findByRole('textbox', { name: new RegExp(WORKSPACE.nameLabel) })
    fireEvent.change(field, { target: { value: 'taken' } })
    fireEvent.click(screen.getByRole('button', { name: WORKSPACE.continue }))
    expect(await screen.findByText('another workspace has this name')).toBeTruthy()
    expect(screen.getByText(WORKSPACE.nameTitle)).toBeTruthy()
  })
})

describe('the switcher', () => {
  it('names the current workspace and switches through the host', async () => {
    await withOperator()
    await fake.invoke('workspace_create', { name: 'Club' })
    render(<App />)
    const trigger = await screen.findByRole('button', { name: /My library/ })
    fireEvent.click(trigger)
    const menu = await screen.findByRole('menu')
    fireEvent.click(within(menu).getByText('Club'))
    await waitFor(() => expect(calls('workspace_switch')).toHaveLength(1))
    expect(await screen.findByRole('button', { name: /Club/ })).toBeTruthy()
  })

  it('is disabled while a game is loaded', async () => {
    await withOperator()
    const loaded = {
      ...EMPTY_PLAY_STATE,
      playId: 'p',
      status: 'loaded',
      operator: { recipeId: 'g', legalTokenTargets: [], defaultNextTeamId: null, consecutiveCorrect: 0, isRehearsal: false, canUndo: false, canRedo: false, eventCount: 0, disabled: [] },
    } as unknown as PlayStateForMain
    // Both halves: the store, and the fake's own `get_state` the bridge asks on mount.
    fake.playState = loaded
    receivePlayState(loaded)
    render(<App />)
    await screen.findAllByRole('button', { name: /My library/ })
    const trigger = document.querySelector('[data-workspace-switcher] button') as HTMLElement
    expect(trigger.hasAttribute('disabled') || trigger.getAttribute('aria-disabled') === 'true' || trigger.hasAttribute('data-disabled')).toBe(true)
  })
})

describe('Manage workspaces', () => {
  it('archives another workspace and cannot archive the current one', async () => {
    await withOperator()
    await fake.invoke('workspace_create', { name: 'Club' })
    useNavStore.setState({ route: { tab: 'workspaces' } })
    render(<App />)
    const club = await screen.findByLabelText(`${WORKSPACE.actions}: Club`)
    fireEvent.click(club)
    fireEvent.click(await screen.findByText(WORKSPACE.archive))
    await waitFor(() => expect(calls('workspace_archive')).toHaveLength(1))
    expect(await screen.findByText(WORKSPACE.archived)).toBeTruthy()

    fireEvent.click(screen.getByLabelText(`${WORKSPACE.actions}: My library`))
    const archive = await screen.findByRole('menuitem', { name: WORKSPACE.archive })
    expect(archive.getAttribute('aria-disabled')).toBe('true')
  })
})

describe('review fixes', () => {
  it('never shows first run before the workspace list has said the workspace is unnamed', async () => {
    fake.workspaces = fake.workspaces.map((w) => ({ ...w, name: null }))
    const real = fake.invoke.bind(fake)
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => (release = r))
    setHostTransport({
      invoke: async (name, args) => {
        if (name === 'workspace_list') await gate
        return real(name, args)
      },
      listen: (name, handler) => fake.listen(name, handler),
    })
    render(<App />)
    await waitFor(() => expect(calls('settings_get').length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    expect(screen.queryByText(FIRST_RUN.paths.title)).toBeNull()
    release()
    expect(await screen.findByText(WORKSPACE.createTitle)).toBeTruthy()
  })

  it('leaves an open record for its tab before switching', async () => {
    await withOperator()
    fake.seed([{ kind: 'team', item: { id: 'red', origin: 'operator', name: 'Red', shortCode: 'RED', color: 'var(--ink)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null } }])
    await fake.invoke('workspace_create', { name: 'Club' })
    useNavStore.setState({ route: { tab: 'teams', id: 'red', mode: 'view' } })
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: /My library/ }))
    fireEvent.click(within(await screen.findByRole('menu')).getByText('Club'))
    await waitFor(() => expect(calls('workspace_switch')).toHaveLength(1))
    expect(useNavStore.getState().route).toEqual({ tab: 'teams' })
  })

  it('offers Stop following its copies on a row in a family', async () => {
    await withOperator()
    fake.seed([{ kind: 'team', item: { id: 'red', origin: 'operator', name: 'Red', shortCode: 'RED', color: 'var(--ink)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null, familyId: 3 } }])
    useNavStore.setState({ route: { tab: 'teams' } })
    render(<App />)
    await screen.findByText('Red')
    const menus = screen.getAllByRole('button', { name: 'Open' })
    fireEvent.click(menus[0] as HTMLElement)
    fireEvent.click(await screen.findByText(TRANSFER.unfollow))
    await waitFor(() => expect(calls('catalog_unfollow')).toHaveLength(1))
  })
})

describe('a switch leaves nothing of the old workspace (beta.2)', () => {
  it('clears Back and Forward, and drops notices about the rows it left', async () => {
    await withOperator()
    const other = await fake.invoke<{ id: string }>('workspace_create', { name: 'Club' })
    render(<App />)
    await waitFor(() => expect(calls('workspace_list').length).toBeGreaterThan(0))
    await useNavStore.getState().go({ tab: 'teams' })
    await useNavStore.getState().go({ tab: 'library' })
    expect(useNavStore.getState().back.length).toBeGreaterThan(0)
    useNoticeStore.getState().pushError('catalog', 'board refused', 'recipe.g1.board')
    useNoticeStore.getState().pushError('disk', 'disk nearly full', null)
    await fake.invoke('workspace_switch', { id: other.id })
    await waitFor(() => expect(useNavStore.getState().back).toEqual([]))
    expect(useNavStore.getState().forward).toEqual([])
    const left = useNoticeStore.getState().notices.map((n) => n.detail.message)
    expect(left).toContain('disk nearly full')
    expect(left).not.toContain('board refused')
  })
})
