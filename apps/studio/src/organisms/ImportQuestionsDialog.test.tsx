import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { IMPORT } from '@/copy'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ImportQuestionsDialog } from './ImportQuestionsDialog'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { setHostTransport } from '@/host/host'
import { useNoticeStore } from '@/chrome/notices'

/**
 * §2.32: the dialog is a preview that writes nothing, then one write of the
 * same plan. The host (here, the fake's mirror of `import.rs`) reads the file;
 * the dialog only shows what it said.
 */
const FILE = JSON.stringify({
  format: 'questiongame.questions',
  version: 1,
  questions: [
    { question: 'Capitala Australiei?', options: [{ text: 'Canberra', correct: true }, 'Sydney'], difficulty: 50, domains: ['Geografie'] },
    { question: 'Doar textul?' },
    { difficulty: 10 },
  ],
})

const questionsIn = (fake: FakeHost) => [...fake.library.values()].filter((row) => row.kind === 'question')

describe('Import questions (§2.32)', () => {
  let fake: FakeHost

  beforeEach(() => {
    useNoticeStore.setState({ notices: [] })
    fake = createFakeHost()
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    cleanup()
  })

  const draw = (onOpenChange: (open: boolean) => void = () => {}) =>
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportQuestionsDialog isOpen onOpenChange={onOpenChange} defaultDomainId={null} />
      </QueryClientProvider>,
    )

  const paste = async (text: string) => {
    const box = await screen.findByLabelText('Or paste the file', { selector: 'textarea' })
    await act(async () => {
      fireEvent.change(box, { target: { value: text } })
    })
  }

  const submit = (n: number) => screen.findByRole('button', { name: n === 1 ? 'Import 1 question' : `Import ${n} questions` })
  const isDisabled = (el: HTMLElement) => (el as HTMLButtonElement).disabled || el.getAttribute('aria-disabled') === 'true'

  it('previews what the file would do before anything is written', async () => {
    draw()
    await paste(FILE)
    expect(await screen.findByText('1 complete · 1 incomplete · 1 rejected · 1 new domain')).toBeTruthy()
    expect(screen.getByText('New domains: Geografie')).toBeTruthy()
    expect(screen.getByText('Rejected: no question and no options')).toBeTruthy()
    // P20: a row's gaps are its mark's name (and the opened row's notice), not a stacked caption.
    expect(screen.getByRole('img', { name: 'Incomplete — Fewer than two options · No correct answer · No difficulty · In no domain' })).toBeTruthy()
    // beta.3: where each row lands, said once.
    expect(screen.getByText('In Geografie (new)')).toBeTruthy()
    const calls = fake.calls.filter((c) => c.name === 'catalog_import_questions')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.args?.commit === false)).toBe(true)
    expect(questionsIn(fake)).toHaveLength(0)
  })

  it('names the tags and what a duplicate repeats (beta.3)', async () => {
    draw()
    const row = { question: 'Q?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 10, tags: ['Rome', ' rome '] }
    await paste(JSON.stringify([row, row]))
    // P20: question tags are chips on the row.
    expect((await screen.findAllByText('Rome')).length).toBeGreaterThan(0)
    expect(screen.getByText('Repeats row 1 of this file')).toBeTruthy()
  })

  it('writes the plan on Import, and closes', async () => {
    let open = true
    draw((next) => (open = next))
    await paste(FILE)
    const button = await submit(2)
    await waitFor(() => expect(isDisabled(button)).toBe(false))
    await act(async () => {
      fireEvent.click(button)
    })
    await waitFor(() => expect(open).toBe(false))
    expect(questionsIn(fake)).toHaveLength(2)
    expect(fake.calls.some((c) => c.name === 'catalog_import_questions' && c.args?.commit === true)).toBe(true)
  })

  it('says why a file cannot be read, and offers nothing to import', async () => {
    draw()
    await paste('{ nope')
    expect(await screen.findByText(/the file is not valid JSON/)).toBeTruthy()
    expect(isDisabled(await submit(0))).toBe(true)
    expect(questionsIn(fake)).toHaveLength(0)
  })

  it('groups the rows by status with the problems first, and a count filters to its rows (P20)', async () => {
    draw()
    const ok = { question: 'Ok?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 10, domains: ['Geo'] }
    await paste(JSON.stringify([ok, { question: 'Half?' }, ok]))
    const headings = await screen.findAllByRole('heading', { level: 3 })
    const order = headings.map((h) => h.textContent ?? '').filter((t) => /Duplicate|Incomplete|Complete/.test(t))
    expect(order[0]).toMatch(/Duplicate/)
    expect(order.at(-1)).toMatch(/Complete/)
    fireEvent.click(screen.getByRole('button', { name: '1 duplicate' }))
    await waitFor(() => expect(screen.queryByText('Half?')).toBeNull())
    expect(screen.getByText('Repeats row 1 of this file')).toBeTruthy()
  })

  it('a row ticked off is left out: the host is told, it is not written, and the count says so (P20)', async () => {
    draw()
    const a = { question: 'A?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 10 }
    const b = { question: 'B?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 20 }
    await paste(JSON.stringify([a, b]))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'B?' }))
    await waitFor(() => expect(screen.getAllByText('1 of 2 rows will be imported').length).toBeGreaterThan(0))
    const button = await submit(1)
    await waitFor(() => expect(isDisabled(button)).toBe(false))
    await act(async () => {
      fireEvent.click(button)
    })
    await waitFor(() => expect(questionsIn(fake)).toHaveLength(1))
    const write = fake.calls.find((c) => c.name === 'catalog_import_questions' && c.args?.commit === true)
    expect((write?.args?.overrides as { skip: number[] }).skip).toEqual([2])
  })

  it('a duplicate cannot be ticked, and says why (P20)', async () => {
    draw()
    const row = { question: 'Q?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 10 }
    await paste(JSON.stringify([row, row]))
    const boxes = await screen.findAllByRole('checkbox', { name: 'Q?' })
    const disabled = boxes.filter((b) => (b as HTMLInputElement).disabled || b.getAttribute('aria-disabled') === 'true')
    expect(disabled).toHaveLength(1)
  })

  it('a row edited in the dialog is sent back as a row of the file and imported as edited (P20)', async () => {
    draw()
    await paste(JSON.stringify([{ question: 'Draft?' }]))
    fireEvent.click(await screen.findByRole('button', { name: /^Draft?/ }))
    const pane = await screen.findByRole('complementary', { name: 'Row 1' })
    fireEvent.change(within(pane).getByRole('textbox', { name: 'Question' }), { target: { value: 'Final?' } })
    fireEvent.click(within(pane).getByRole('button', { name: 'Apply' }))
    const list = document.querySelector('[data-pick-list]') as HTMLElement
    expect(await within(list).findByText('Final?')).toBeTruthy()
    expect(within(list).getByText('Edited')).toBeTruthy()
    const last = fake.calls.filter((c) => c.name === 'catalog_import_questions').at(-1)
    expect((last?.args?.overrides as { edits: { index: number; row: { question: string } }[] }).edits[0]).toMatchObject({ index: 1, row: { question: 'Final?' } })
  })

  it('a new text drops the edits and skips that belonged to the old one (P20)', async () => {
    draw()
    const a = { question: 'A?', options: [{ text: 'A', correct: true }, 'B'], difficulty: 10 }
    await paste(JSON.stringify([a, { ...a, question: 'B?' }]))
    fireEvent.click(await screen.findByRole('checkbox', { name: 'B?' }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_import_questions' && (c.args?.overrides as { skip: number[] } | undefined)?.skip.length === 1)).toBe(true))
    fireEvent.click(screen.getByRole('button', { name: 'Edit the text' }))
    await paste(JSON.stringify([a]))
    await waitFor(() => {
      const last = fake.calls.filter((c) => c.name === 'catalog_import_questions').at(-1)
      expect((last?.args?.overrides as { skip: number[] }).skip).toEqual([])
    })
  })

  it('the template carries question tags and the fields line names what a file cannot carry (P20)', () => {
    expect(IMPORT.template).toContain('"tags"')
    expect(JSON.parse(IMPORT.template).questions.length).toBeGreaterThan(1)
    expect(IMPORT.fields).toMatch(/domain groups/)
    expect(IMPORT.ignored({ field: 'tags', why: 'out_of_range' })).toMatch(/20 question tags/)
    expect(IMPORT.ignored({ field: 'difficulty', why: 'out_of_range' })).toMatch(/1–100/)
  })
})
