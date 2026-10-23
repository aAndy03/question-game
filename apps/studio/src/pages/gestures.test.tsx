import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { App } from '@/App'
import { useChromeStore } from '@/chrome/chrome'
import { HOME, useNavStore } from '@/chrome/nav'
import { useNoticeStore } from '@/chrome/notices'
import { createFakeHost } from '@/host/fake'
import { demoLibrary, demoRecipe } from '@/host/devFake'
import { setHostTransport } from '@/host/host'
import { rangeBetween } from '@/host/listView'
import { receivePlayState } from '@/host/playState'

/**
 * beta.8: the selection gestures. Shift+click selects a run from the last row
 * ticked, in the list's order — on a row or its checkbox, in table and grid
 * view and in pickers; Ctrl/⌘+click ticks a row without opening it (only a
 * plain click opens). In the Domains pane, Ctrl/⌘+click and Shift+click pick
 * several domains, shown together.
 */
beforeEach(() => {
  useNavStore.setState({ route: HOME, back: [], forward: [], guard: null })
  useNoticeStore.setState({ notices: [] })
  useChromeStore.setState({ listState: {}, prefs: {}, operatorId: '', archiveScope: {} })
  receivePlayState(null)
  const fake = createFakeHost()
  fake.seed(demoLibrary(), [demoRecipe()])
  setHostTransport(fake)
})
afterEach(() => {
  setHostTransport(null)
  cleanup()
})

const boxes = () => screen.getAllByRole('checkbox', { name: /^Select (?!all)/ }) as HTMLInputElement[]
const ticked = () => boxes().map((b) => b.checked)
const rowOf = (box: HTMLElement) => box.closest<HTMLElement>('[role="button"]')!
const strip = () => document.querySelector<HTMLElement>('[data-bulk-strip]')!

async function onLibrary(layout: 'table' | 'grid' = 'table') {
  render(<App />)
  act(() => useChromeStore.getState().setView('library', layout))
  await act(async () => {
    await useNavStore.getState().go({ tab: 'library' })
  })
  await screen.findAllByRole('checkbox', { name: /^Select (?!all)/ })
}

describe('rangeBetween', () => {
  it('spans both ways, ends included, and falls back to the row alone', () => {
    const order = ['a', 'b', 'c', 'd']
    expect(rangeBetween(order, 'b', 'd')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(order, 'd', 'b')).toEqual(['b', 'c', 'd'])
    expect(rangeBetween(order, null, 'c')).toEqual(['c'])
    expect(rangeBetween(order, 'gone', 'c')).toEqual(['c'])
  })
})

describe('Shift+click and Ctrl+click in library lists (beta.8)', () => {
  it('Shift+click on a row ticks the run from the last ticked row, in table view, without opening', async () => {
    await onLibrary('table')
    fireEvent.click(boxes()[1]!)
    fireEvent.click(rowOf(boxes()[4]!), { shiftKey: true })
    expect(ticked()).toEqual([false, true, true, true, true, false, false])
    expect(useNavStore.getState().route).not.toMatchObject({ questionId: expect.anything() })
  })

  it('Shift+click on a ticked row takes the run off, and works from the checkbox too', async () => {
    await onLibrary('table')
    fireEvent.click(boxes()[0]!)
    fireEvent.click(rowOf(boxes()[5]!), { shiftKey: true })
    expect(within(strip()).getByText('6 selected')).toBeTruthy()
    fireEvent.click(boxes()[2]!)
    // The checkbox, with Shift: from row 3 (just unticked) to row 5, off.
    const five = boxes()[4]!
    fireEvent.pointerDown(five, { shiftKey: true })
    fireEvent.click(five, { shiftKey: true })
    expect(ticked()).toEqual([true, true, false, false, false, true, false])
  })

  it('Ctrl+click on a table row ticks it and never opens it; a plain click opens', async () => {
    await onLibrary('table')
    fireEvent.click(rowOf(boxes()[0]!), { ctrlKey: true })
    fireEvent.click(rowOf(boxes()[1]!), { metaKey: true })
    expect(ticked().slice(0, 3)).toEqual([true, true, false])
    fireEvent.click(rowOf(boxes()[0]!), { ctrlKey: true })
    expect(ticked()[0]).toBe(false)
    expect(useNavStore.getState().route).toEqual({ tab: 'library' })
    fireEvent.click(rowOf(boxes()[2]!))
    await waitFor(() => expect(useNavStore.getState().route).toMatchObject({ tab: 'library', mode: 'view' }))
  })

  it('Ctrl+click on a card ticks it instead of opening it, and Shift+click runs in grid view', async () => {
    await onLibrary('grid')
    fireEvent.click(rowOf(boxes()[0]!), { ctrlKey: true })
    fireEvent.click(rowOf(boxes()[2]!), { metaKey: true })
    expect(ticked().slice(0, 3)).toEqual([true, false, true])
    expect(useNavStore.getState().route).not.toMatchObject({ mode: 'view' })
    fireEvent.click(rowOf(boxes()[5]!), { shiftKey: true })
    expect(ticked()).toEqual([true, false, true, true, true, true, false])
  })
})

describe('several domains in the Domains pane (beta.8)', () => {
  const domain = (name: string) => screen.getByRole('option', { name: new RegExp(`^${name}`) })

  it('Ctrl+click adds a domain to the one open and shows their questions together', async () => {
    await onLibrary('table')
    fireEvent.click(domain('History'))
    expect(useNavStore.getState().route).toMatchObject({ domainId: 'dom-history' })
    fireEvent.click(domain('Sport'), { ctrlKey: true })
    expect(useNavStore.getState().route).toEqual({ tab: 'library' })
    expect(domain('History').getAttribute('aria-selected')).toBe('true')
    expect(domain('Sport').getAttribute('aria-selected')).toBe('true')
    expect(domain('Technology').getAttribute('aria-selected')).toBe('false')
    // History's four and Sport's one.
    expect(boxes()).toHaveLength(5)

    // Ctrl+click takes one off; a plain click is one domain again.
    fireEvent.click(domain('History'), { ctrlKey: true })
    expect(boxes()).toHaveLength(1)
    fireEvent.click(domain('Technology'))
    expect(useNavStore.getState().route).toMatchObject({ domainId: 'dom-tech' })
    expect(domain('Sport').getAttribute('aria-selected')).toBe('false')
  })

  it('Shift+click adds the run of domains from the last one clicked', async () => {
    await onLibrary('table')
    fireEvent.click(domain('History'))
    fireEvent.click(domain('Sport'), { shiftKey: true })
    for (const name of ['History', 'Technology', 'Sport']) expect(domain(name).getAttribute('aria-selected')).toBe('true')
    expect(boxes()).toHaveLength(7)
  })
})

describe('Shift+click in a picker: the Import questions rows (beta.8)', () => {
  it('unticks the run from the last row unticked, by checkbox or by row', async () => {
    const { ImportQuestionsDialog } = await import('@/organisms')
    const { QueryClient, QueryClientProvider } = await import('@tanstack/react-query')
    const rows = ['One?', 'Two?', 'Three?', 'Four?'].map((q) => ({ question: q, options: [{ text: 'A', correct: true }, 'B'], difficulty: 10 }))
    render(
      <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
        <ImportQuestionsDialog isOpen onOpenChange={() => {}} defaultDomainId={null} />
      </QueryClientProvider>,
    )
    const box = await screen.findByLabelText('Or paste the file', { selector: 'textarea' })
    await act(async () => {
      fireEvent.change(box, { target: { value: JSON.stringify({ format: 'questiongame.questions', version: 1, questions: rows }) } })
    })
    const tick = (q: string) => screen.findByRole('checkbox', { name: q }) as Promise<HTMLInputElement>
    expect((await tick('One?')).checked).toBe(true)
    fireEvent.click(await tick('One?'))
    const three = await tick('Three?')
    fireEvent.pointerDown(three, { shiftKey: true })
    fireEvent.click(three, { shiftKey: true })
    expect([(await tick('One?')).checked, (await tick('Two?')).checked, (await tick('Three?')).checked, (await tick('Four?')).checked]).toEqual([false, false, false, true])
    // Shift on the row itself, away from the checkbox: back on from Three to Four.
    const li = (await tick('Three?')).closest('li')!
    fireEvent.click(within(li).getByText('Three?'), { shiftKey: true })
    await waitFor(async () => expect((await tick('Three?')).checked).toBe(true))
    // Ctrl on a row ticks it and opens nothing (a plain click opens the row beside the list).
    const four = (await tick('Four?')).closest('li')!
    fireEvent.click(within(four).getByText('Four?'), { ctrlKey: true })
    await waitFor(async () => expect((await tick('Four?')).checked).toBe(false))
    expect(document.querySelector('[data-pick-list] li[data-current]')).toBeNull()
  })
})
