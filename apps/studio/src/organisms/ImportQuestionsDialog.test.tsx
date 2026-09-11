import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('Fewer than two options · No correct answer · No difficulty · In no domain')).toBeTruthy()
    const calls = fake.calls.filter((c) => c.name === 'catalog_import_questions')
    expect(calls.length).toBeGreaterThan(0)
    expect(calls.every((c) => c.args?.commit === false)).toBe(true)
    expect(questionsIn(fake)).toHaveLength(0)
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
})
