import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { EMPTY_PLAY_STATE } from '@questiongame/contract'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import * as COPY from '@/copy'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { SETTINGS } from '@/copy/settings'
import { TRANSFER, WORKSPACE } from '@/copy/workspaces'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { CatalogItem, Team } from '@/host/types'

/** beta.5 in Studio: copies in the panels, Duplicate here, Manage workspaces as a list, words, the switcher, Repair. */
let fake: FakeHost

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [] })
  useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
  receivePlayState(null)
  fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
})
afterEach(() => {
  setHostTransport(null)
  cleanup()
})

async function at(route: Route) {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go(route)
  })
}

describe('a row names its copies (beta.5)', () => {
  it('the team panel lists the copy, and Stop following ends it', async () => {
    const alpha = fake.library.get('team:team-alpha')
    if (alpha?.kind !== 'team') throw new Error('alpha')
    const copy: CatalogItem = { kind: 'team', item: { ...(alpha.item as Team), id: 'team-alpha-2', familyId: 4 } }
    fake.seed([copy])
    fake.families.set('team:team-alpha', 4)
    fake.families.set('team:team-alpha-2', 4)
    await at({ tab: 'teams', id: 'team-alpha', mode: 'view' } as Route)
    expect(await screen.findByText(TRANSFER.copiesTitle(1), {}, { timeout: 5000 })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: TRANSFER.unfollow }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_unfollow')).toBe(true))
    await waitFor(() => expect(screen.queryByText(TRANSFER.copiesTitle(1))).toBeNull())
  })

  it('a row never copied shows no copies at all', async () => {
    await at({ tab: 'teams', id: 'team-bravo', mode: 'view' } as Route)
    await screen.findAllByText('Bravo', {}, { timeout: 5000 })
    expect(document.querySelector('[data-copies]')).toBeNull()
  })

  it('the question panel shows its tags and its domain group', async () => {
    const h1 = fake.library.get('question:q-h1')
    if (h1?.kind !== 'question') throw new Error('q-h1')
    fake.library.set('question:q-h1', { kind: 'question', item: { ...h1.item, tags: ['Rome', 'Roads'] } })
    fake.domainGroups.set('dom-history', [{ id: 'grp-ancient', domainId: 'dom-history', name: 'Ancient', sortKey: 0 }])
    const d = fake.library.get('domain:dom-history')
    if (d?.kind === 'domain') fake.library.set('domain:dom-history', { kind: 'domain', item: { ...d.item, questions: d.item.questions.map((m) => (m.questionId === 'q-h1' ? { ...m, groupId: 'grp-ancient' } : m)) } })
    await at({ tab: 'library', questionId: 'q-h1', mode: 'view' } as Route)
    expect(await screen.findByText('History · Ancient', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.getAllByText('Rome').length).toBeGreaterThan(0)
  })
})

describe('Duplicate here (beta.5)', () => {
  it('a team from its row: "(copy)", then numbered', async () => {
    await at({ tab: 'teams' } as Route)
    for (let i = 0; i < 2; i++) {
      const menus = await screen.findAllByRole('button', { name: COPY.LIST.open }, { timeout: 5000 })
      fireEvent.click(menus[0] as HTMLElement)
      fireEvent.click(await screen.findByRole('menuitem', { name: COPY.LIST.duplicate }))
      await waitFor(() => expect(fake.calls.filter((c) => c.name === 'catalog_duplicate')).toHaveLength(i + 1))
    }
    const names = [...fake.library.values()].filter((r) => r.kind === 'team').map((r) => (r.item as Team).name)
    expect(names).toContain('Alpha (copy)')
    expect(names).toContain('Alpha (copy 2)')
  })
})

describe('Manage workspaces as a list (beta.5)', () => {
  it('searches, and Status shows the archived', async () => {
    const first = fake.workspaces[0]
    if (!first) throw new Error('workspace')
    fake.workspaces = [first, { ...first, id: 'ws-2', name: 'Friday club', sortKey: 1 }, { ...first, id: 'ws-3', name: 'Old season', sortKey: 2, archivedAt: 5 }]
    await at({ tab: 'workspaces' } as Route)
    expect(await screen.findByText('Friday club', {}, { timeout: 5000 })).toBeTruthy()
    expect(screen.queryByText('Old season')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'friday' } })
    const page = document.querySelector('[data-workspaces-page]') as HTMLElement
    await waitFor(() => expect(within(page).queryByText(first.name ?? '')).toBeNull(), { timeout: 2000 })
    expect(within(page).getByText('Friday club')).toBeTruthy()
  })
})

describe('every group says whose (beta.5)', () => {
  it('no copy string reads a bare "New group", "No group", "Delete group" or "Group name"', () => {
    const strings: string[] = []
    const walk = (v: unknown) => {
      if (typeof v === 'string') strings.push(v)
      else if (v && typeof v === 'object') Object.values(v).forEach(walk)
    }
    walk(COPY)
    walk(GROUPS_TAGS)
    walk(WORKSPACE)
    for (const bare of ['New group', 'No group', 'Delete group', 'Group name', 'Rename group']) expect(strings).not.toContain(bare)
    expect(GROUPS_TAGS.newGroup).not.toBe(WORKSPACE.newGroup)
    expect(GROUPS_TAGS.tag).toBe('Question tag')
    expect(COPY.VIEWS.tag).toBe('Game tag')
    expect(SETTINGS.data.wipeBody).toContain('this workspace')
  })
})

describe('the disabled switcher (beta.5)', () => {
  it('can be reached by keyboard and says why', async () => {
    await at({ tab: 'teams' } as Route)
    act(() => receivePlayState({ ...EMPTY_PLAY_STATE, playId: 'p1', status: 'loaded', operator: { recipeId: 'recipe-demo', legalTokenTargets: [], defaultNextTeamId: null, consecutiveCorrect: 0, isRehearsal: false, canUndo: false, canRedo: false, eventCount: 0, showGiveToken: false, overrideAfterLock: 'refuse_until_reveal', disabled: [] } } as never))
    const reason = await screen.findByLabelText(new RegExp(WORKSPACE.loaded), {}, { timeout: 5000 })
    expect(reason.getAttribute('tabindex')).toBe('0')
  })
})

describe('Repair (beta.5)', () => {
  it('asks first, naming the count, then repairs', async () => {
    await at({ tab: 'teams' } as Route)
    act(() => {
      useNoticeStore.getState().push({ code: 'health.library_refs', severity: 'warn', targetPath: null, actions: ['repair_library'], detail: { count: '3' } })
      useNoticeStore.getState().setCollectorOpen(true)
    })
    const panel = await screen.findByRole('dialog', {}, { timeout: 5000 })
    fireEvent.click(await within(panel).findByRole('button', { name: 'Repair…' }))
    expect(await within(panel).findByText(COPY.SHELL.repairTitle('3'))).toBeTruthy()
    expect(fake.calls.some((c) => c.name === 'library_repair')).toBe(false)
    fireEvent.click(within(panel).getByRole('button', { name: 'Remove them' }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'library_repair')).toBe(true))
  })
})
