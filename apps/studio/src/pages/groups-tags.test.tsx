import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { toast } from '@/chrome/toast'
import type { BulkEdit, CatalogItem, Domain, Question } from '@/host/types'

/** Beta P15 in Studio: groups, tags, Manage tags and the bulk Edit menu. */
let fake: FakeHost
const calls = (name: string) => fake.calls.filter((c) => c.name === name)

const question = (id: string, tags: string[] = []): CatalogItem => ({
  kind: 'question',
  item: {
    id, origin: 'operator', stem: `Question ${id}`, mediaAssetId: null, difficulty: 10, explanation: null, tags,
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

// A generous wait: under the full suite's load the list can take a while to draw.
const select = async (stem: string) => fireEvent.click(await screen.findByRole('checkbox', { name: `Select ${stem}` }, { timeout: 5000 }))
async function editMenu(item: string) {
  fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.edit }, { timeout: 5000 }))
  fireEvent.click(await screen.findByRole('menuitem', { name: item }, { timeout: 5000 }))
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

  it('E18 E19 Tag… previews the counts before it writes', async () => {
    await open({ tab: 'library' })
    await select('Question q1')
    await select('Question q2')
    await select('Question q3')
    const dialog = await editMenu(GROUPS_TAGS.bulkTag)
    fireEvent.change(within(dialog).getByRole('textbox', { name: new RegExp(GROUPS_TAGS.pickTag) }), { target: { value: 'christmas' } })
    expect(await within(dialog).findByText(GROUPS_TAGS.applyTo(2))).toBeTruthy()
    // q1 already carries it; nothing says "shared" any more.
    expect(within(dialog).queryByText(/shared/i)).toBeNull()
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
    fake.seed([question('qs', ['Christmas'])])
    await open({ tab: 'library' })
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.manageButton }))
    const dialog = await screen.findByRole('alertdialog')
    expect(await within(dialog).findByText(GROUPS_TAGS.carried(2))).toBeTruthy()
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

const disabled = (el: HTMLElement) => el.hasAttribute('disabled') || el.getAttribute('data-disabled') === 'true'

describe('the P15 review', () => {
  it('Apply on a value changed under the click asks again, then writes it and says what changed', async () => {
    const spy = vi.spyOn(toast, 'success')
    await open({ tab: 'library' })
    await select('Question q2')
    const dialog = await editMenu(GROUPS_TAGS.bulkTag)
    const field = within(dialog).getByRole('textbox', { name: new RegExp(GROUPS_TAGS.pickTag) })
    fireEvent.change(field, { target: { value: 'A' } })
    expect(await within(dialog).findByText(GROUPS_TAGS.applyTo(1))).toBeTruthy()
    const apply = within(dialog).getByRole('button', { name: GROUPS_TAGS.apply })
    fireEvent.change(field, { target: { value: 'B' } })
    // B's preview is not in yet: Apply stays on and asks for it before the write.
    expect(disabled(apply)).toBe(false)
    fake.calls.length = 0
    fireEvent.click(apply)
    await waitFor(() => expect((fake.library.get('question:q2')?.item as Question).tags).toEqual(['B']))
    const asked = calls('catalog_bulk_edit').map((c) => [c.args?.['preview'], (c.args?.['edit'] as { tag: string }).tag])
    expect(asked.slice(0, 2)).toEqual([[true, 'B'], [false, 'B']])
    await waitFor(() => expect(spy).toHaveBeenCalledWith(GROUPS_TAGS.done(1)))
    spy.mockRestore()
  })

  it('bulk Tag… offers the tags already used, and asks once typing pauses', async () => {
    await open({ tab: 'library' })
    await select('Question q2')
    const dialog = await editMenu(GROUPS_TAGS.bulkTag)
    const field = within(dialog).getByRole('textbox', { name: new RegExp(GROUPS_TAGS.pickTag) })
    await waitFor(() => expect(calls('tag_list').length).toBeGreaterThan(0))
    fake.calls.length = 0
    for (const v of ['c', 'ch', 'chr']) fireEvent.change(field, { target: { value: v } })
    fireEvent.click(await within(dialog).findByRole('button', { name: 'Christmas' }))
    expect((field as HTMLInputElement).value).toBe('Christmas')
    await waitFor(() => expect(calls('catalog_bulk_edit').length).toBeGreaterThan(0))
    expect(calls('catalog_bulk_edit').map((c) => (c.args?.['edit'] as { tag: string }).tag)).toEqual(['Christmas'])
  })

  it('Group… says apart which are in that group and which are not in this domain', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    await select('Question q1')
    await select('Question q2')
    const dialog = await editMenu(GROUPS_TAGS.bulkGroup)
    // Both are in History and in no group already: two unchanged, none outside.
    expect(await within(dialog).findByText(GROUPS_TAGS.already(2, GROUPS_TAGS.alreadyGrouped))).toBeTruthy()
    expect(within(dialog).queryByText(GROUPS_TAGS.notInDomain(2))).toBeNull()
  })

  it('a domain group header offers Rename and Delete', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    const g = await fake.invoke<{ id: string }>('domain_group_create', { domainId: 'd1', name: 'Wars' })
    const d1 = fake.library.get('domain:d1')?.item as Domain
    await fake.invoke('catalog_upsert', { item: { kind: 'domain', item: { ...d1, questions: d1.questions.map((m) => (m.questionId === 'q1' ? { ...m, groupId: g.id } : m)) } } })
    fireEvent.click(await screen.findByRole('button', { name: `${GROUPS_TAGS.group}: Wars` }, { timeout: 5000 }))
    fireEvent.click(await screen.findByText(GROUPS_TAGS.rename))
    const field = await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.groupName) })
    fireEvent.change(field, { target: { value: 'Battles' } })
    fireEvent.click(screen.getByRole('button', { name: GROUPS_TAGS.save }))
    await waitFor(() => expect(fake.domainGroups.get('d1')?.map((x) => x.name)).toEqual(['Battles']))
  })

  it('the Groups dialog stays open under its New group', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.groupsButton }))
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.newGroup }))
    await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.groupName) })
    expect(document.querySelector('[data-groups-dialog]')).not.toBeNull()
  })

  it('a merge says what it merged into and how many changed', async () => {
    const spy = vi.spyOn(toast, 'success')
    fake.seed([question('q4', ['Xmas'])])
    await open({ tab: 'library' })
    fireEvent.click(await screen.findByRole('button', { name: GROUPS_TAGS.manageButton }))
    const dialog = await screen.findByRole('alertdialog')
    fireEvent.click(await within(dialog).findByRole('button', { name: `${GROUPS_TAGS.tag}: Xmas` }))
    fireEvent.click(await screen.findByText(GROUPS_TAGS.rename))
    const field = await screen.findByRole('textbox', { name: new RegExp(GROUPS_TAGS.renameTo) })
    fireEvent.change(field, { target: { value: 'christmas' } })
    fireEvent.click(screen.getByRole('button', { name: GROUPS_TAGS.save }))
    await waitFor(() => expect(spy).toHaveBeenCalledWith(GROUPS_TAGS.mergeNote('Christmas', 1)))
    spy.mockRestore()
  })

  it('the archived scope offers no Edit…', async () => {
    const qa = question('qa')
    fake.seed([{ ...qa, item: { ...(qa.item as Question), archivedAt: 1 } } as CatalogItem])
    await open({ tab: 'library' })
    useChromeStore.setState({ archiveScope: { library: 'archived' } })
    await select('Question qa')
    expect(screen.queryByRole('button', { name: GROUPS_TAGS.edit })).toBeNull()
  })

  it('a domain taken off in the editor forgets its group', async () => {
    await open({ tab: 'library', domainId: 'd1' })
    const g = await fake.invoke<{ id: string }>('domain_group_create', { domainId: 'd1', name: 'Wars' })
    useNavStore.setState({ route: { tab: 'library', questionId: 'q2', mode: 'edit', domainId: 'd1' } })
    await screen.findByText(GROUPS_TAGS.groupIn('History'))
    const native = () => document.querySelector('[data-group-picker="d1"] select') as HTMLSelectElement | null
    fireEvent.change(native() as HTMLSelectElement, { target: { value: g.id } })
    await waitFor(() => expect(native()?.value).toBe(g.id))
    fireEvent.click(screen.getByRole('checkbox', { name: /History/ }))
    await waitFor(() => expect(native()).toBeNull())
    fireEvent.click(screen.getByRole('checkbox', { name: /History/ }))
    await waitFor(() => expect(native()).not.toBeNull())
    expect(native()?.value).not.toBe(g.id)
  })
})
