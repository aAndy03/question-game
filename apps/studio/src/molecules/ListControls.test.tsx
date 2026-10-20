import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { BulkBar } from './BulkBar'
import { ActiveFilters, FilterMenu, GroupHeader, GroupMenu, PageFooter, SortMenu, pageLinks } from './ListControls'

/** Stable 1.1: the list controls draw and report; the hook decides. */

describe('FilterMenu (U-03, U-21)', () => {
  const filters = [
    { id: 'band', label: 'Difficulty', kind: 'multi' as const, options: [{ value: 'easy', label: 'Easy' }, { value: 'hard', label: 'Hard' }] },
    { id: 'answer', label: 'Answer', kind: 'choice' as const, options: [{ value: 'single', label: 'Single' }] },
    { id: 'pin', label: 'Has a PIN', kind: 'toggle' as const },
  ]

  it('shows how many filters are on, and reports a pick', async () => {
    const onChange = vi.fn()
    render(<FilterMenu filters={filters} values={{ band: ['easy'] }} changed="any" onChange={onChange} onChanged={vi.fn()} activeCount={2} hint="3 incomplete" />)
    const button = screen.getByRole('button', { name: 'Filters · 2' })
    fireEvent.click(button)
    const dialog = await screen.findByRole('dialog', { name: 'Filters' })
    expect(within(dialog).getByText('3 incomplete')).toBeTruthy()
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Hard' }))
    expect(onChange).toHaveBeenCalledWith('band', ['easy', 'hard'])
    fireEvent.click(within(dialog).getByRole('checkbox', { name: 'Easy' }))
    expect(onChange).toHaveBeenLastCalledWith('band', null)
    fireEvent.click(within(dialog).getByRole('switch', { name: 'Has a PIN' }))
    expect(onChange).toHaveBeenLastCalledWith('pin', true)
  })

  it('has no count when nothing is on', () => {
    render(<FilterMenu filters={filters} values={{}} changed="any" onChange={vi.fn()} onChanged={vi.fn()} activeCount={0} />)
    expect(screen.getByRole('button', { name: 'Filters' })).toBeTruthy()
  })
})

describe('ActiveFilters (U-04, U-06)', () => {
  it('lists each filter with a way to remove it, and clears them all', () => {
    const onRemove = vi.fn()
    const onClearAll = vi.fn()
    const { container } = render(
      <ActiveFilters items={[{ id: 'band', label: 'Difficulty', valueLabel: 'Hard' }, { id: 'pin', label: 'Has a PIN', valueLabel: '' }]} onRemove={onRemove} onClearAll={onClearAll} />,
    )
    expect(screen.getByText('Difficulty: Hard')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Remove Difficulty: Hard' }))
    expect(onRemove).toHaveBeenCalledWith('band')
    fireEvent.click(screen.getByRole('button', { name: 'Clear all' }))
    expect(onClearAll).toHaveBeenCalledOnce()
    expect(container.querySelectorAll('li')).toHaveLength(2)
  })

  it('draws nothing when no filter is on', () => {
    const { container } = render(<ActiveFilters items={[]} onRemove={vi.fn()} onClearAll={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('SortMenu and GroupMenu (U-05, U-07)', () => {
  const sorts = [{ id: 'name', label: 'Name' }, { id: 'plays', label: 'Plays' }]

  it('names the sort in force and reports a field and a direction', async () => {
    const onChange = vi.fn()
    render(<SortMenu sorts={sorts} value={{ id: 'name', desc: false }} onChange={onChange} showMatch={false} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Name' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'Plays' }))
    expect(onChange).toHaveBeenCalledWith({ id: 'plays', desc: false })
  })

  it('offers Best match only while searching', async () => {
    render(<SortMenu sorts={sorts} value={{ id: 'match', desc: true }} onChange={vi.fn()} showMatch />)
    expect(screen.getByRole('button', { name: 'Sort: Best match' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Sort: Best match' }))
    expect(await screen.findByRole('menuitemradio', { name: 'Best match' })).toBeTruthy()
  })

  it('renders no Group menu where a tab offers none', () => {
    const { container } = render(<GroupMenu groups={[]} value={null} onChange={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })

  it('reports None as no grouping', async () => {
    const onChange = vi.fn()
    render(<GroupMenu groups={[{ id: 'domain', label: 'Domain' }]} value="domain" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Group: Domain' }))
    fireEvent.click(await screen.findByRole('menuitemradio', { name: 'None' }))
    expect(onChange).toHaveBeenCalledWith(null)
  })
})

describe('PageFooter (U-14–U-17)', () => {
  it('says where the page is, and stops at both ends', () => {
    const onPage = vi.fn()
    const { rerender } = render(<PageFooter page={1} pageCount={3} text="1–100 of 250 things" pageSize={100} onPage={onPage} onPageSize={vi.fn()} />)
    expect(screen.getByText('1–100 of 250 things')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Previous page' }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
    expect(onPage).toHaveBeenCalledWith(2)
    rerender(<PageFooter page={3} pageCount={3} text="201–250 of 250 things" pageSize={100} onPage={onPage} onPageSize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Next page' }).hasAttribute('disabled')).toBe(true)
    expect(screen.queryByRole('button', { name: 'Page 2' })).toBeNull()
  })

  it('numbers pages past three, with gaps', () => {
    expect(pageLinks(2, 3)).toEqual([])
    expect(pageLinks(1, 4)).toEqual([1, 2, 'gap', 4])
    expect(pageLinks(5, 30)).toEqual([1, 'gap', 4, 5, 6, 'gap', 30])
    expect(pageLinks(30, 30)).toEqual([1, 'gap', 29, 30])
    render(<PageFooter page={5} pageCount={30} text="x" pageSize={100} onPage={vi.fn()} onPageSize={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Page 5' }).getAttribute('aria-current')).toBe('page')
  })

  it('offers 50, 100, 250 and All', () => {
    const onPageSize = vi.fn()
    render(<PageFooter page={1} pageCount={1} text="x" pageSize={100} onPage={vi.fn()} onPageSize={onPageSize} />)
    for (const name of ['50', '100', '250', 'All']) expect(screen.getByRole('radio', { name })).toBeTruthy()
    fireEvent.click(screen.getByRole('radio', { name: 'All' }))
    expect(onPageSize).toHaveBeenCalledWith('all')
    fireEvent.click(screen.getByRole('radio', { name: '50' }))
    expect(onPageSize).toHaveBeenLastCalledWith(50)
  })

  it('draws nothing for an empty list', () => {
    const { container } = render(<PageFooter page={1} pageCount={1} text="" pageSize={100} onPage={vi.fn()} onPageSize={vi.fn()} />)
    expect(container.firstChild).toBeNull()
  })
})

describe('GroupHeader (U-18, U-19)', () => {
  it('says the group, its count, whether it continues, and folds', () => {
    const onToggle = vi.fn()
    render(<GroupHeader label="History" count={48} continued collapsed={false} onToggle={onToggle} />)
    expect(screen.getByRole('heading', { name: /History · 48/ })).toBeTruthy()
    expect(screen.getByText('(continued)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Hide History' }))
    expect(onToggle).toHaveBeenCalledOnce()
  })
})

describe('BulkBar (B-02, B-07–B-10, B-16)', () => {
  it('offers both actions under a mixed selection, each touching its own rows', () => {
    const archive = vi.fn()
    const restore = vi.fn()
    render(<BulkBar count={48} onPage={12} archive={{ count: 30, run: archive }} restore={{ count: 18, run: restore }} onClear={vi.fn()} />)
    expect(screen.getByText('48 selected (12 on this page)')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Archive 30' }))
    expect(archive).toHaveBeenCalledOnce()
    expect(restore).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Restore 18' }))
    expect(restore).toHaveBeenCalledOnce()
  })

  it('hides an action with nothing to touch, and says nothing about pages when all are here', () => {
    render(<BulkBar count={3} onPage={3} archive={{ count: 3, run: vi.fn() }} restore={{ count: 0, run: vi.fn() }} selectAll={{ count: 250, run: vi.fn() }} onClear={vi.fn()} />)
    expect(screen.getByText('3 selected')).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Restore/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'Select all 250' })).toBeTruthy()
  })

  it('disables both while a batch is running', () => {
    render(<BulkBar count={2} onPage={2} archive={{ count: 1, run: vi.fn() }} restore={{ count: 1, run: vi.fn() }} onClear={vi.fn()} isPending />)
    for (const b of screen.getAllByRole('button').filter((x) => /Archive|Restore/.test(x.textContent ?? ''))) {
      expect(b.hasAttribute('disabled') || b.getAttribute('aria-disabled') === 'true' || b.getAttribute('data-pending') !== null).toBe(true)
    }
  })
})
