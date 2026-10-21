import { beforeEach, describe, expect, it } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { FIRST_WORKSPACE_ID, useChromeStore } from '@/chrome/chrome'
import { createFakeHost } from './fake'
import { keys, receiveWorkspaces } from './queries'
import type { CatalogItem, TransferReport, Workspace, Workspaces } from './types'

const list = (current: string): Workspaces => ({ current, workspaces: [], groups: [] })

describe('a workspace switch in Studio', () => {
  it('drops every workspace-scoped query and keeps the rest', async () => {
    const client = new QueryClient()
    client.setQueryData(keys.workspaces, list('ws-1'))
    client.setQueryData(keys.catalog.list('team', 'active'), [{ id: 'alpha' }])
    client.setQueryData(keys.recipes.list('active'), [{ id: 'game' }])
    client.setQueryData(keys.settings, { globals: {} })
    client.setQueryData(keys.monitors, [{ key: 'primary' }])

    receiveWorkspaces(client, list('ws-1'))
    expect(client.getQueryData(keys.catalog.list('team', 'active'))).toEqual([{ id: 'alpha' }])

    receiveWorkspaces(client, list('ws-2'))
    expect(client.getQueryData(keys.catalog.list('team', 'active'))).toBeUndefined()
    expect(client.getQueryData(keys.recipes.list('active'))).toBeUndefined()
    expect(client.getQueryData(keys.settings)).toBeUndefined()
    expect(client.getQueryData(keys.monitors)).toEqual([{ key: 'primary' }])
    expect(client.getQueryData<Workspaces>(keys.workspaces)?.current).toBe('ws-2')
  })
})

describe('list views per workspace', () => {
  beforeEach(() => {
    useChromeStore.setState({ operatorId: 'op', workspaceId: FIRST_WORKSPACE_ID, prefs: {}, archiveScope: {}, listState: {} })
  })

  it('keep their own sort, and a 1.x document is the first workspace’s', () => {
    const store = useChromeStore.getState()
    store.setListPrefs('teams', { sort: { id: 'name', desc: true } })
    expect(useChromeStore.getState().prefs.op?.lists?.teams?.sort?.desc).toBe(true)

    store.setWorkspace('ws-2')
    useChromeStore.getState().setListPrefs('teams', { sort: { id: 'updated', desc: false } })
    const prefs = useChromeStore.getState().prefs.op
    expect(prefs?.workspaceLists?.['ws-2']?.teams?.sort?.id).toBe('updated')
    expect(prefs?.lists?.teams?.sort?.id, 'the first workspace keeps its own').toBe('name')
  })

  it('start a fresh session view in another workspace', () => {
    useChromeStore.getState().setListState('library', { search: 'capital', page: 3 })
    useChromeStore.getState().setWorkspace('ws-2')
    expect(useChromeStore.getState().listState).toEqual({})
    useChromeStore.getState().setListState('library', { search: 'x' })
    useChromeStore.getState().setWorkspace('ws-2')
    expect(useChromeStore.getState().listState.library?.search, 'the same workspace again changes nothing').toBe('x')
  })
})

describe('the fake host scopes like the host', () => {
  const team = (id: string): CatalogItem => ({
    kind: 'team',
    item: { id, origin: 'operator', name: id, shortCode: 'TM', color: 'var(--ink)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null },
  })

  it('shows a workspace its own rows only', async () => {
    const fake = createFakeHost()
    await fake.invoke('catalog_upsert', { item: team('mine') })
    const other = await fake.invoke<Workspace>('workspace_create', { name: 'Club' })
    await fake.invoke('workspace_switch', { id: other.id })
    await fake.invoke('catalog_upsert', { item: team('theirs') })
    const rows = await fake.invoke<CatalogItem[]>('catalog_list', { kind: 'team', scope: 'all' })
    expect(rows.map((r) => r.item.id)).toEqual(['theirs'])
    await expect(fake.invoke('catalog_get', { kind: 'team', id: 'mine' })).rejects.toMatchObject({ code: 'catalog' })
  })

  it('refuses a name that is empty or taken, ignoring case', async () => {
    const fake = createFakeHost()
    await expect(fake.invoke('workspace_create', { name: '   ' })).rejects.toMatchObject({ code: 'catalog' })
    await expect(fake.invoke('workspace_create', { name: 'my LIBRARY' })).rejects.toMatchObject({ code: 'catalog' })
  })

  it('copies a team into another workspace, and a preview writes nothing', async () => {
    const fake = createFakeHost()
    await fake.invoke('catalog_upsert', { item: team('alpha') })
    const other = await fake.invoke<Workspace>('workspace_create', { name: 'Club' })
    const preview = await fake.invoke<TransferReport>('transfer_preview', { op: 'copy', selection: { teams: ['alpha'] }, target: other.id })
    expect(preview.created).toHaveLength(1)
    expect(fake.library.size).toBe(1)
    await fake.invoke('catalog_copy_to', { selection: { teams: ['alpha'] }, target: other.id })
    await fake.invoke('workspace_switch', { id: other.id })
    const rows = await fake.invoke<CatalogItem[]>('catalog_list', { kind: 'team', scope: 'all' })
    expect(rows).toHaveLength(1)
    expect(rows[0]?.item.id).not.toBe('alpha')
  })

  it('refuses a switch while a Play is open', async () => {
    const fake = createFakeHost()
    const other = await fake.invoke<Workspace>('workspace_create', { name: 'Club' })
    fake.playState = { status: 'playing' } as never
    await expect(fake.invoke('workspace_switch', { id: other.id })).rejects.toMatchObject({ code: 'match' })
  })
})

describe('the fake host keeps operators global', () => {
  it('lists them in every workspace', async () => {
    const fake = createFakeHost()
    await fake.invoke('catalog_upsert', { item: { kind: 'operator', item: { id: 'op', displayName: 'Ana', pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null } } })
    const other = await fake.invoke<Workspace>('workspace_create', { name: 'Club' })
    await fake.invoke('workspace_switch', { id: other.id })
    const rows = await fake.invoke<CatalogItem[]>('catalog_list', { kind: 'operator', scope: 'all' })
    expect(rows).toHaveLength(1)
  })
})
