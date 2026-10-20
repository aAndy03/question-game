import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost, type FakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { receivePlayState } from '@/host/playState'
import type { CatalogItem, Domain, Question } from '@/host/types'

/**
 * §2.32 on the Library tab: an incomplete question is listed like any other,
 * carries a mark naming what it lacks, is found by the Incomplete filter, and
 * loses the mark the moment the last gap closes — nothing is stored about it.
 * Stable 1.1: the All | Incomplete tabs became the Completeness filter, and the
 * toolbar is the one every library tab shows.
 */

/** One option, no difficulty, in no domain. */
const open: Question = {
  id: 'q-open',
  origin: 'operator',
  stem: 'Who wrote Luceafărul?',
  mediaAssetId: null,
  options: [{ id: 'q-open-a', text: 'Eminescu', correct: true }],
  difficulty: null,
  explanation: null,
  createdAt: 1_000,
  updatedAt: 1_000,
  archivedAt: null,
}

const mark = /^Incomplete — /

describe('Library — incomplete questions (§2.32)', () => {
  let fake: FakeHost

  beforeEach(() => {
    useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
    useNoticeStore.setState({ notices: [] })
    useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
    receivePlayState(null)
    fake = createFakeHost()
    fake.seed([...demoLibrary(), { kind: 'question', item: open }], [demoRecipe()])
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    useChromeStore.setState({ listState: {} })
  })

  const show = async () => {
    render(<App />)
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library' })
    })
    await screen.findByText('Who wrote Luceafărul?')
  }

  /** A demo question that is complete, to prove the filter removes it. */
  const completeStem = () =>
    demoLibrary().flatMap((row) => (row.kind === 'question' ? [row.item.stem] : []))[0] ?? ''

  it('marks only the incomplete row, and the mark names its gaps', async () => {
    await show()
    const marks = screen.getAllByRole('img', { name: mark })
    expect(marks).toHaveLength(1)
    expect(marks[0]?.getAttribute('aria-label')).toBe('Incomplete — Fewer than two options · No difficulty · In no domain')
    expect(screen.getByText(completeStem())).toBeTruthy()
  })

  it('counts incomplete questions in the Filters popover and narrows the list to them (T-05, T-09)', async () => {
    await show()
    expect(screen.queryByRole('tab', { name: /Incomplete/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByText('1 question is incomplete')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('radio', { name: 'Incomplete' }))
    await waitFor(() => expect(screen.queryByText(completeStem())).toBeNull())
    expect(screen.getByText('Who wrote Luceafărul?')).toBeTruthy()
    expect(screen.getByText('Completeness: Incomplete')).toBeTruthy()
  })

  it('puts the toolbar in its order: Search · Filters · Sort · Group · View · Status (U-01)', async () => {
    await show()
    const bar = document.querySelector('[data-list-toolbar]') as HTMLElement
    const order = [
      within(bar).getByRole('searchbox'),
      within(bar).getByRole('button', { name: 'Filters' }),
      within(bar).getByRole('button', { name: /^Sort: / }),
      within(bar).getByRole('button', { name: /^Group: / }),
      within(bar).getByRole('radiogroup', { name: /View/ }),
      within(bar).getByRole('tablist', { name: 'Archive scope' }),
    ]
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1]!.compareDocumentPosition(order[i]!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    }
  })

  it('keeps the filter through open, fix, back — the §17 loop (R-09, P-09)', async () => {
    await show()
    act(() => useChromeStore.getState().setListState('library', { filters: { completeness: 'incomplete' } }))
    await waitFor(() => expect(screen.queryByText(completeStem())).toBeNull())
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', questionId: 'q-open', mode: 'view' })
    })
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library' })
    })
    expect(await screen.findByText('Who wrote Luceafărul?')).toBeTruthy()
    expect(screen.queryByText(completeStem())).toBeNull()
    expect(screen.getByText('Completeness: Incomplete')).toBeTruthy()
  })

  it('offers the Domain filter only under All questions (T-07)', async () => {
    await show()
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(await screen.findByRole('dialog', { name: 'Filters' })).getByText('Domain')).toBeTruthy()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    await act(async () => {
      await useNavStore.getState().go({ tab: 'library', domainId: 'dom-history' })
    })
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Filters' })).toBeNull())
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(await screen.findByRole('dialog', { name: 'Filters' })).queryByText('Domain')).toBeNull()
  })

  it('asks Search for every match, not a capped few (S-01, Review Focus 2)', async () => {
    await show()
    act(() => useChromeStore.getState().setListState('library', { search: 'who' }))
    await waitFor(() => expect(fake.calls.some((c) => c.name === 'catalog_search')).toBe(true))
    const call = fake.calls.find((c) => c.name === 'catalog_search')
    const total = demoLibrary().filter((r) => r.kind === 'question').length + 1
    expect((call?.args as { query: { limit: number } }).query.limit).toBe(total)
  })

  it('drops the mark once the question is finished', async () => {
    await show()
    const history = demoLibrary().find((row): row is Extract<CatalogItem, { kind: 'domain' }> => row.kind === 'domain' && row.item.id === 'dom-history')
    expect(history).toBeTruthy()
    const domain: Domain = { ...history!.item, questions: [...history!.item.questions, { questionId: 'q-open', sortKey: 99 }] }
    await act(async () => {
      await fake.invoke('catalog_upsert_many', {
        items: [
          {
            kind: 'question',
            item: { ...open, difficulty: 40, options: [...open.options, { id: 'q-open-b', text: 'Creangă', correct: false }] },
          },
          { kind: 'domain', item: domain },
        ],
      })
    })
    await waitFor(() => expect(screen.queryAllByRole('img', { name: mark })).toHaveLength(0))
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }))
    expect(within(await screen.findByRole('dialog', { name: 'Filters' })).queryByText(/incomplete$/)).toBeNull()
  })
})
