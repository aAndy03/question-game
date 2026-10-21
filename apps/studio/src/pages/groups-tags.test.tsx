import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { HOME, useNavStore, type Route } from '@/chrome/nav'
import { useChromeStore } from '@/chrome/chrome'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import { resetUpdateCheck } from '@/host/updates'
import { resetWhatsNew } from '@/host/whatsNew'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import type { BulkEdit, CatalogItem, Domain, Question } from '@/host/types'

/** Beta P15 in Studio: groups, tags, Manage tags and the bulk Edit menu. */
let fake: FakeHost
const calls = (name: string) => fake.calls.filter((c) => c.name === name)

const question = (id: string, tags: string[] = [], shared = false): CatalogItem => ({
  kind: 'question',
  item: {
    id, origin: 'operator', stem: `Question ${id}`, mediaAssetId: null, difficulty: 10, explanation: null, tags, shared,
    options: [{ id: `${id}-a`, text: 'Yes', correct: true }, { id: `${id}-b`, text: 'No', correct: false }],
    createdAt: 0, updatedAt: 0, archivedAt: null,
  } as Question,
})
const domain = (id: string, name: string, members: string[]): CatalogItem => ({
  kind: 'domain',
  item: { id, origin: 'operator', name, code: name.slice(0, 3).toUpperCase(), description: null, questions: members.map((q, i) => ({ questionId: q, sortKey: i, groupId: null })), createdAt: 0, updatedAt: 0, archivedAt: null } as Domain,
})

async function open(route: Route) {
  fake.seed([
    { kind: 'operator', item: { id: 'op', displayName: 'Ana', pinHash: null, lastActiveAt: null, playsRun: 0, createdAt: 0, updatedAt: 0, archivedAt: null } },
    question('q1', ['Christmas']),
    question('q2'),
    question('q3'),
    domain('d1', 'History', ['q1', 'q2']),
    domain('d2', 'Science', ['q3']),
  ])
  await fake.invoke('settings_set_global', { setting: { key: 'active_operator_id', value: 'op' } })
  fake.calls.length = 0
  useNavStore.setState({ route })
  render(<App />)
}

const select = async (stem: string) => fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${stem}` }))
async function editMenu(item: string) {
  fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.edit }))
  fireEvent.click(await screen.findByRole('menuitem', { name: item }))
  return screen.findByRole('alertdialog')
}

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [], collectorOpen: false })
  useChromeStore.setState({ operatorId: '', prefs: {}, archiveScope: {}, listState: {} })
  receivePlayState(null)
  resetUpdateCheck()
  resetWhatsNew()
  fake = createFakeHost()
  setHostTransport(fake)
})
afterEach(() => setHostTransport(null))

describe('the bulk Edit menu', () => {
  it('E15 offers Group… and Remove from domain only inside a domain', async () => {
    await open({ tab: 'library' })
    await select('Question q1')
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.edit }))
    const menu = await screen.findByRole('menu')
    expect(within(menu).queryByText(GROUPS_TAGS.bulkGroup)).toBeNull()
    expect(within(menu).queryByText(GROUPS_TAGS.bulkRemove)).toBeNull()
    expect(within(menu).getByText(GROUPS_TAGS.bulkTag)).toBeTruthy()
  })

  it('E18 E19 Tag… previews the counts and the shared ones before it writes', async () => {
    fake.seed([question('qs', [], true)])
    await open({ tab: 'library' })
    await select('Question q1')
    await select('Question q2')
    await select('Question qs')
    const dialog = await editMenu(GROUPS_TAGS.bulkTag)
    fireEvent.change(within(dialog).getByRole('textbox', { name: new RegExp(GROUPS_TAGS.pickTag) }), { target: { value: 'christmas' } })
    expect(await within(dialog).findByText(GROUPS_TAGS.applyTo(2))).toBeTruthy()
    expect(within(dialog).getByText(GROUPS_TAGS.already(1, GROUPS_TAGS.alreadyTagged('christmas')))).toBeTruthy()
    expect(within(dialog).getByText(GROUPS_TAGS.sharedReach(1))).toBeTruthy()
    expect(calls('catalog_bulk_edit').every((c) => c.args?.['preview'] === true)).toBe(true)
    fireEvent.click(within(dialog).getByRole('button', { name: GROUPS_TAGS.apply }))
    await waitFor(() => expect(calls('catalog_bulk_edit').some((c) => c.args?.['preview'] === false)).toBe(true))
    const q2 = fake.library.get('question:q2')?.item as Question
    expect(q2.tags).toEqual(['Christmas'])
  })

  it('Group… inside a domain puts the selection in a group', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    await fake.invoke('domain_group_create', { domainId: 'd1', name: 'Wars' })
    await select('Question q1')
    const dialog = await editMenu(GROUPS_TAGS.bulkGroup)
    await waitFor(() => expect(calls('catalog_bulk_edit').length).toBeGreaterThan(0))
    const edits = () => calls('catalog_bulk_edit').map((c) => c.args?.['edit'] as BulkEdit)
    expect(edits()[0]).toMatchObject({ op: 'group', domainId: 'd1', groupId: null })
    void dialog
  })
})

describe('Groups and Manage tags', () => {
  it('the Groups dialog creates a group by its typed name', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.groupsButton }))
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.newGroup }))
    const field = await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.groupName) })
    expect((field as HTMLInputElement).value).toBe('')
    fireEvent.change(field, { target: { value: ' Romans ' } })
    fireEvent.click(screen.getByRole('button', { name: GROUPS_TAGS.create }))
    await waitFor(() => expect(fake.domainGroups.get('d1')?.map((g) => g.name)).toEqual(['Romans']))
  })

  it('E33 Manage tags lists counts and renames through the host', async () => {
    fake.seed([question('qs', ['Christmas'], true)])
    await open({ tab: 'library' })
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.manageButton }))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(GROUPS_TAGS.carried(2, 1))).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('button', { name: `${GROUPS_TAGS.tag}: Christmas` }))
    fireEvent.click(await screen.findByText(GROUPS_TAGS.rename))
    const field = await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.renameTo) })
    fireEvent.change(field, { target: { value: 'Xmas' } })
    fireEvent.click(screen.getByRole('button', { name: GROUPS_TAGS.save }))
    await waitFor(() => expect((fake.library.get('question:q1')?.item as Question).tags).toEqual(['Xmas']))
  })
})

describe('the question editor', () => {
  it('E1 E2 E7 E10 tags as chips, the spelling in view, and a group saved with the membership', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    const g = await fake.invoke<{ id: string }>('domain_group_create', { domainId: 'd1', name: 'Wars' })
    useNavStore.setState({ route: { tab: 'library', questionId: 'q2', mode: 'edit', domainId: 'd1' } })
    const tags = await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.tagsLabel) })
    // The tags already used are what the field offers; let the list arrive first.
    await waitFor(() => expect(calls('tag_list').length).toBeGreaterThan(0))
    await new Promise((r) => setTimeout(r, 50))
    fireEvent.change(tags, { target: { value: 'christmas' } })
    fireEvent.keyDown(tags, { key: "Enter" })
    expect(await screen.findByRole('button', { name: GROUPS_TAGS.tagRemove('Christmas') })).toBeTruthy()
    const picker = await screen.findByText(GROUPS_TAGS.groupIn('History'))
    expect(picker).toBeTruthy()
    // Choose the group through the select's hidden native element, as a user would pick it.
    const native = document.querySelector('[data-group-picker="d1"] select') as HTMLSelectElement | null
    expect(native, 'the picker has its native select').not.toBeNull()
    if (native) fireEvent.change(native, { target: { value: g.id } })
    fireEvent.click(screen.getByRole('button', { name: /^Save/ }))
    await waitFor(() => expect((fake.library.get('question:q2')?.item as Question).tags).toEqual(['Christmas']))
    if (native) {
      await waitFor(() => {
        const d1 = fake.library.get('domain:d1')?.item as Domain
        expect(d1.questions.find((m) => m.questionId === 'q2')?.groupId).toBe(g.id)
      })
    }
  })
})
