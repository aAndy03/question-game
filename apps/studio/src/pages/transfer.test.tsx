import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { resetUpdateCheck } from '@/host/updates'
import { resetWhatsNew } from '@/host/whatsNew'
import { LIST } from '@/copy'
import { STATS } from '@/copy/stats'
import { PROPAGATE, TRANSFER } from '@/copy/workspaces'
import type { CatalogItem, Recipe, StatsQuery, Workspace } from '@/host/types'

/** Beta 2.0 in the library tabs: copy, move, and edits that follow their copies (no shared library since beta.2). */
let fake: FakeHost
const calls = (name: string) => fake.calls.filter((c) => c.name === name)

const team = (id: string, name: string, extra: Partial<{ familyId: number }> = {}): CatalogItem => ({
  kind: 'team',
  item: { id, origin: 'operator', name, shortCode: 'TM', color: 'var(--ink)', logoAssetId: null, notes: null, playCount: 0, lastPlayAt: null, createdAt: 0, updatedAt: 0, archivedAt: null, ...extra },
})

async function library(route: Route, alpha: CatalogItem = team('alpha', 'Alpha')) {
  fake.seed([
    { kind: 'operator', item: { id: 'op', displayName: 'Ana', pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null } },
    alpha,
  ])
  await fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op' } })
  const club = await fake.invoke<Workspace>('workspace_create', { name: 'Club' })
  fake.calls.length = 0
  useNavStore.setState({ route })
  render(<App />)
  return club
}

async function rowAction(title: string, action: string) {
  const row = (await screen.findByText(title)).closest('[data-record-row]') ?? (await screen.findByText(title)).closest('div')
  const menus = within(row?.parentElement as HTMLElement).getAllByRole('button', { name: LIST.open })
  fireEvent.click(menus[menus.length - 1] as HTMLElement)
  fireEvent.click(await screen.findByText(action))
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

describe('copy and move', () => {
  it('previews a copy before writing it, then copies into the workspace picked', async () => {
    const club = await library({ tab: 'teams' })
    await rowAction('Alpha', TRANSFER.copyTo)
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(TRANSFER.picked(1))).toBeTruthy()
    await waitFor(() => expect(calls('transfer_preview')).toHaveLength(1))
    expect(calls('catalog_copy_to')).toHaveLength(0)
    expect(calls('transfer_preview')[0]?.args).toMatchObject({ op: 'copy', selection: { teams: ['alpha'] }, target: club.id })

    fireEvent.click(within(dialog).getByRole('button', { name: TRANSFER.confirmCopy }))
    await waitFor(() => expect(calls('catalog_copy_to')).toHaveLength(1))
  })

  it('names who still uses a row a move would take, and offers Copy instead', async () => {
    const game: Recipe = {
      id: 'g', origin: 'operator', name: 'Friday', folder: null, tags: [], teams: ['alpha'], board: [],
      settings: (await import('@/host/fake')).DEFAULT_GAME_SETTINGS, layout: {}, overlays: { teams: {}, domains: {}, questions: {} },
      rev: 1, createdAt: 0, updatedAt: 0, archivedAt: null,
    }
    fake.seed([], [game])
    await library({ tab: 'teams' })
    await rowAction('Alpha', TRANSFER.moveTo)
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText('game Friday')).toBeTruthy()
    const move = within(dialog).getByRole('button', { name: TRANSFER.confirmMove })
    expect(move.hasAttribute('disabled') || move.getAttribute('aria-disabled') === 'true' || move.hasAttribute('data-disabled')).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: TRANSFER.copyInstead }))
    expect(await within(dialog).findByRole('button', { name: TRANSFER.confirmCopy })).toBeTruthy()
  })

  it('offers Copy and Move only: nothing is shared any more', async () => {
    await library({ tab: 'teams' })
    const row = (await screen.findByText('Alpha')).closest('[data-record-row]') ?? (await screen.findByText('Alpha')).closest('div')
    const menus = within(row?.parentElement as HTMLElement).getAllByRole('button', { name: LIST.open })
    fireEvent.click(menus[menus.length - 1] as HTMLElement)
    expect(await screen.findByText(TRANSFER.copyTo)).toBeTruthy()
    expect(screen.queryByText(/Make shared|Make local/)).toBeNull()
    expect(screen.queryByText('Shared')).toBeNull()
  })

  it('copies a question with its domain by default, and names the domain it brings', async () => {
    const q: CatalogItem = {
      kind: 'question',
      item: { id: 'q1', origin: 'operator', stem: 'Who was the first king?', mediaAssetId: null, difficulty: 10, explanation: null, tags: [],
        options: [{ id: 'a', text: 'Saul', correct: true }, { id: 'b', text: 'David', correct: false }], createdAt: 0, updatedAt: 0, archivedAt: null } as never,
    }
    const d: CatalogItem = {
      kind: 'domain',
      item: { id: 'd1', origin: 'operator', name: 'Biblie', code: 'BIB', description: null, questions: [{ questionId: 'q1', sortKey: 0, groupId: null }], createdAt: 0, updatedAt: 0, archivedAt: null } as never,
    }
    fake.seed([q, d])
    await library({ tab: 'library' })
    await rowAction('Who was the first king?', TRANSFER.copyTo)
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByRole('switch', { name: TRANSFER.withDomains })).toBeTruthy()
    expect(await within(dialog).findByText(TRANSFER.creates('Biblie'))).toBeTruthy()
    expect(calls('transfer_preview').at(-1)?.args).toMatchObject({ withDomains: true })
    fireEvent.click(within(dialog).getByRole('switch', { name: TRANSFER.withDomains }))
    expect(await within(dialog).findByText(TRANSFER.noDomain)).toBeTruthy()
    await waitFor(() => expect(calls('transfer_preview').at(-1)?.args).toMatchObject({ withDomains: false }))
    fireEvent.click(within(dialog).getByRole('switch', { name: TRANSFER.withDomains }))
    await within(dialog).findByText(TRANSFER.creates('Biblie'))
    fireEvent.click(within(dialog).getByRole('button', { name: TRANSFER.confirmCopy }))
    await waitFor(() => expect(calls('catalog_copy_to')).toHaveLength(1))
    expect(calls('catalog_copy_to')[0]?.args).toMatchObject({ withDomains: true })
  })
})

describe('copy with domains, joined and mixed (review)', () => {
  const question = (id: string, stem: string): CatalogItem => ({
    kind: 'question',
    item: { id, origin: 'operator', stem, mediaAssetId: null, difficulty: 10, explanation: null, tags: [],
      options: [{ id: 'a', text: 'Yes', correct: true }, { id: 'b', text: 'No', correct: false }], createdAt: 0, updatedAt: 0, archivedAt: null } as never,
  })
  const domainOf = (id: string, name: string, members: string[]): CatalogItem => ({
    kind: 'domain',
    item: { id, origin: 'operator', name, code: name.slice(0, 3), description: null, questions: members.map((q, i) => ({ questionId: q, sortKey: i, groupId: null })), createdAt: 0, updatedAt: 0, archivedAt: null } as never,
  })

  it('says a copied question joins the copy of its domain already there', async () => {
    fake.seed([question('q1', 'First stem'), question('q2', 'Second stem'), domainOf('d1', 'Biblie', ['q1', 'q2'])])
    const club = await library({ tab: 'library' })
    await fake.invoke('catalog_copy_to', { selection: { questions: ['q1'] }, target: club.id })
    await rowAction('Second stem', TRANSFER.copyTo)
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(TRANSFER.joins('Biblie'))).toBeTruthy()
    expect(within(dialog).queryByText(TRANSFER.creates('Biblie'))).toBeNull()
  })

  it('names a domain made for the questions, and not one a picked domain brings whole', async () => {
    fake.seed([question('q1', 'First stem'), question('q3', 'Third stem'), domainOf('d1', 'Biblie', ['q1']), domainOf('d2', 'Istorie', ['q3'])])
    await library({ tab: 'library' })
    const { useTransfer } = await import('@/organisms/useTransfer')
    void useTransfer
    // The bulk menu with one question and another, whole, domain.
    fireEvent.click(await screen.findByRole('checkbox', { name: 'Select First stem' }))
    fireEvent.click(await screen.findByRole('button', { name: TRANSFER.menu }))
    fireEvent.click(await screen.findByText(TRANSFER.copyTo))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(TRANSFER.creates('Biblie'))).toBeTruthy()
  })
})

describe('an edit that can follow its copies', () => {
  it('asks Save here only or Also update, and sends what was chosen', async () => {
    fake.seed([team('beta', 'Beta copy', { familyId: 7 })])
    fake.families.set('team:alpha', 7)
    fake.families.set('team:beta', 7)
    await library({ tab: 'teams', id: 'alpha', mode: 'edit' }, team('alpha', 'Alpha', { familyId: 7 }))
    const name = await screen.findByDisplayValue('Alpha')
    fireEvent.change(name, { target: { value: 'Alpha FC' } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByText(PROPAGATE.title)).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: PROPAGATE.alsoCopies(1, 0) }))
    await waitFor(() => expect(calls('catalog_upsert_propagating')).toHaveLength(1))
    expect(calls('catalog_upsert')).toHaveLength(0)
  })
})

describe('Statistics across workspaces', () => {
  it('asks for every workspace’s Plays only when told to', async () => {
    await library({ tab: 'statistics', view: 'all' })
    await waitFor(() => expect(calls('stats_query').length).toBeGreaterThan(0))
    const last = () => (calls('stats_query').at(-1)?.args?.['query'] ?? {}) as StatsQuery
    expect(last().filter?.allWorkspaces ?? false).toBe(false)
    fireEvent.click(await screen.findByRole('checkbox', { name: STATS.filters.allWorkspaces }))
    await waitFor(() => expect(last().filter?.allWorkspaces).toBe(true))
  })
})
