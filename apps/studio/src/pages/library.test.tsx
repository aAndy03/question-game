import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
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
    useChromeStore.setState({ libraryFilter: 'all' })
    receivePlayState(null)
    fake = createFakeHost()
    fake.seed([...demoLibrary(), { kind: 'question', item: open }], [demoRecipe()])
    setHostTransport(fake)
  })
  afterEach(() => {
    setHostTransport(null)
    useChromeStore.setState({ libraryFilter: 'all' })
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

  it('counts incomplete questions on the filter and narrows the list to them', async () => {
    await show()
    expect(screen.getByRole('tab', { name: 'Incomplete · 1' })).toBeTruthy()
    act(() => useChromeStore.getState().setLibraryFilter('incomplete'))
    await waitFor(() => expect(screen.queryByText(completeStem())).toBeNull())
    expect(screen.getByText('Who wrote Luceafărul?')).toBeTruthy()
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
    expect(screen.getByRole('tab', { name: 'Incomplete · 0' })).toBeTruthy()
  })
})
