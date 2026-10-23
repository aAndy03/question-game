import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { SHARE } from '@/copy'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { Domain, Question } from '@/host/types'
import { ImportQuestionsDialog, useShareQuestions } from '@/organisms'

/**
 * beta.8: *Share* on Domains & Questions. The picked questions — a row, or the
 * selection, in the list's order — are copied as the complete text *Import
 * questions…* reads, and that dialog takes it back in: into another library as
 * the same questions in the same domains, into this one as nothing new.
 */
let fake: FakeHost
let writeText: ReturnType<typeof vi.fn>

const questions = () => [...fake.library.values()].filter((r) => r.kind === 'question').map((r) => r.item as Question)
const domains = () => [...fake.library.values()].filter((r) => r.kind === 'domain').map((r) => r.item as Domain)
const copied = () => JSON.parse(writeText.mock.calls.at(-1)![0] as string) as { format: string; version: number; questions: Record<string, unknown>[] }

beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [] })
  useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
  receivePlayState(null)
  fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
  writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => {
  setHostTransport(null)
  cleanup()
})

async function onLibrary() {
  render(<App />)
  await act(async () => {
    await useNavStore.getState().go({ tab: 'library' })
  })
  await screen.findAllByRole('checkbox', { name: /^Select / })
}

describe('Share on Domains & Questions (beta.8)', () => {
  it('copies the selection, complete, in the order the list shows it', async () => {
    await onLibrary()
    const boxes = screen.getAllByRole('checkbox', { name: /^Select (?!all)/ })
    // Ticked bottom first: the text still follows the list.
    fireEvent.click(boxes[2]!)
    fireEvent.click(boxes[0]!)
    const strip = document.querySelector<HTMLElement>('[data-bulk-strip]')!
    fireEvent.click(within(strip).getByRole('button', { name: SHARE.action }))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())

    const doc = copied()
    expect(doc.format).toBe('questiongame.questions')
    expect(doc.version).toBe(1)
    expect(doc.questions).toHaveLength(2)
    const shown = boxes.map((b) => b.getAttribute('aria-label')!.replace(/^Select /, ''))
    expect(doc.questions.map((q) => q['question'])).toEqual([shown[0], shown[2]])

    // Every field the import reads, as the library holds it.
    for (const row of doc.questions) {
      const q = questions().find((x) => x.stem === row['question'])!
      const options = row['options'] as (string | { text: string; correct: boolean })[]
      expect(options.map((o) => (typeof o === 'string' ? [o, false] : [o.text, o.correct]))).toEqual(q.options.map((o) => [o.text, o.correct]))
      expect(row['difficulty'] ?? null).toBe(q.difficulty)
      const homes = domains().filter((d) => d.archivedAt === null && d.questions.some((m) => m.questionId === q.id)).map((d) => d.name)
      expect(row['domains'] ?? []).toEqual(homes)
      expect(row['tags'] ?? []).toEqual(q.tags ?? [])
    }
    expect(await screen.findByText(SHARE.copied(2))).toBeTruthy()
  })

  it('shares one question from its row menu', async () => {
    await onLibrary()
    const first = screen.getAllByRole('checkbox', { name: /^Select (?!all)/ })[0]!
    const stem = first.getAttribute('aria-label')!.replace(/^Select /, '')
    // The row is a pressable; its menu trigger inside it is named *Open*.
    const row = first.closest<HTMLElement>('[role="button"]')!
    fireEvent.click(within(row).getByRole('button', { name: 'Open' }))
    fireEvent.click(await screen.findByRole('menuitem', { name: SHARE.action }))
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce())
    expect(copied().questions.map((q) => q['question'])).toEqual([stem])
  })

  it('shows the text to copy by hand when the webview has no clipboard', async () => {
    writeText.mockRejectedValueOnce(new Error('no clipboard'))
    await onLibrary()
    fireEvent.click(screen.getAllByRole('checkbox', { name: /^Select (?!all)/ })[0]!)
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-bulk-strip]')!).getByRole('button', { name: SHARE.action }))
    const box = (await screen.findByLabelText(SHARE.byHandLabel, { selector: 'textarea' })) as HTMLTextAreaElement
    expect(JSON.parse(box.value).format).toBe('questiongame.questions')
  })
})

describe('the shared text in Import questions… (beta.8)', () => {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{children}</QueryClientProvider>
  )

  const shareAll = async () => {
    const ids = questions().filter((q) => q.archivedAt === null).map((q) => q.id)
    const { result } = renderHook(() => useShareQuestions(), { wrapper })
    await act(async () => result.current.share(ids))
    return { text: writeText.mock.calls.at(-1)![0] as string, count: ids.length }
  }

  it('brings every question into another library, in the same domains', async () => {
    const { text, count } = await shareAll()
    const source = { questions: questions(), domains: domains() }
    // Another library: empty.
    fake = createFakeHost()
    setHostTransport(fake)
    render(<ImportQuestionsDialog isOpen onOpenChange={() => {}} defaultDomainId={null} />, { wrapper })
    const box = await screen.findByLabelText('Or paste the file', { selector: 'textarea' })
    await act(async () => {
      fireEvent.change(box, { target: { value: text } })
    })
    const go = await screen.findByRole('button', { name: new RegExp(`^Import ${count} questions?$`) })
    await act(async () => {
      fireEvent.click(go)
    })
    await waitFor(() => expect(questions()).toHaveLength(count))
    for (const q of source.questions.filter((x) => x.archivedAt === null)) {
      const arrived = questions().find((x) => x.stem === q.stem)!
      expect(arrived.options.map((o) => [o.text, o.correct])).toEqual(q.options.map((o) => [o.text, o.correct]))
      expect(arrived.difficulty).toBe(q.difficulty)
      const was = source.domains.filter((d) => d.archivedAt === null && d.questions.some((m) => m.questionId === q.id)).map((d) => d.name).sort()
      const now = domains().filter((d) => d.questions.some((m) => m.questionId === arrived.id)).map((d) => d.name).sort()
      expect(now).toEqual(was)
    }
  })

  it('takes nothing new into the library it came from', async () => {
    const { text } = await shareAll()
    const report = await fake.invoke<{ rows: { status: string }[] }>('catalog_import_questions', { text, commit: false })
    expect(report.rows.every((r) => r.status === 'duplicate')).toBe(true)
  })

  it('refuses more than the import takes at once, without asking the host', async () => {
    const { result } = renderHook(() => useShareQuestions(), { wrapper })
    await act(async () => result.current.share(Array.from({ length: 2001 }, (_, i) => `q-${i}`)))
    expect(fake.calls.some((c) => c.name === 'catalog_export_questions')).toBe(false)
    expect(writeText).not.toHaveBeenCalled()
  })
})
