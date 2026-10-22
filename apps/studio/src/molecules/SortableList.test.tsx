import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { DragHandle, SortableList } from './SortableList'
import { keyboardDrag, stubRowLayout } from '@/test/sortable'

/** P20: drag to reorder — the roster, the Board's domains, a question's options. */
let restore: (() => void) | null = null
beforeEach(() => {
  restore = stubRowLayout()
})
afterEach(() => restore?.())

const list = (props: Partial<Parameters<typeof SortableList>[0]> = {}) => (
  <SortableList
    ids={['a', 'b', 'c']}
    label="Play order"
    onReorder={vi.fn()}
    renderRow={(id, handle) => (
      <div>
        <DragHandle handle={handle} label={`Reorder ${id}`} disabledReason={props.disabledReason} />
        <span>{`${handle.index + 1}. ${id}`}</span>
      </div>
    )}
    {...props}
  />
)

describe('SortableList (P20)', () => {
  it('names the list and gives every row a handle the keyboard reaches', () => {
    render(list())
    expect(screen.getByRole('list', { name: 'Play order' })).toBeTruthy()
    const handles = screen.getAllByRole('button', { name: /^Reorder / })
    expect(handles.map((h) => h.getAttribute('aria-label'))).toEqual(['Reorder a', 'Reorder b', 'Reorder c'])
    for (const h of handles) expect((h as HTMLButtonElement).disabled).toBe(false)
  })

  it('disables every handle while the game is frozen', () => {
    render(list({ disabledReason: 'The game is playing' }))
    for (const h of screen.getAllByRole('button', { name: /^Reorder / })) expect((h as HTMLButtonElement).disabled).toBe(true)
  })

  it('writes the new order once on a keyboard drop, and shows it before the host answers', async () => {
    const onReorder = vi.fn(() => new Promise<boolean>(() => {}))
    render(list({ onReorder }))
    await keyboardDrag(screen.getByRole('button', { name: 'Reorder a' }), 1)
    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1))
    expect(onReorder).toHaveBeenCalledWith(['b', 'a', 'c'])
    expect(screen.getByText('1. b')).toBeTruthy()
  })

  it('moves a row up as well as down', async () => {
    const onReorder = vi.fn()
    render(list({ onReorder }))
    await keyboardDrag(screen.getByRole('button', { name: 'Reorder c' }), -2)
    await waitFor(() => expect(onReorder).toHaveBeenCalledWith(['c', 'a', 'b']))
  })

  it('puts the old order back when the host refuses', async () => {
    const onReorder = vi.fn(async () => false)
    render(list({ onReorder }))
    await keyboardDrag(screen.getByRole('button', { name: 'Reorder a' }), 1)
    await waitFor(() => expect(onReorder).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(screen.getByText('1. a')).toBeTruthy())
  })

  it('takes the host’s next order over its own', async () => {
    const onReorder = vi.fn(() => new Promise<boolean>(() => {}))
    const view = render(list({ onReorder }))
    await keyboardDrag(screen.getByRole('button', { name: 'Reorder a' }), 1)
    await waitFor(() => expect(screen.getByText('1. b')).toBeTruthy())
    view.rerender(list({ onReorder, ids: ['c', 'b', 'a'] }))
    expect(screen.getByText('1. c')).toBeTruthy()
  })

  it('keeps the dropped order through a re-render that rebuilds the same ids', async () => {
    const onReorder = vi.fn(() => new Promise<boolean>(() => {}))
    const view = render(list({ onReorder }))
    await keyboardDrag(screen.getByRole('button', { name: 'Reorder a' }), 1)
    await waitFor(() => expect(screen.getByText('1. b')).toBeTruthy())
    // The Board builds `ids` with `.map` on every render (a pending flag flips, say).
    view.rerender(list({ onReorder, ids: ['a', 'b', 'c'] }))
    expect(screen.getByText('1. b')).toBeTruthy()
  })

  it('cancels on Escape without writing', async () => {
    const onReorder = vi.fn()
    render(list({ onReorder }))
    const handle = screen.getByRole('button', { name: 'Reorder a' })
    handle.focus()
    for (const [key, code] of [[' ', 'Space'], ['ArrowDown', 'ArrowDown'], ['Escape', 'Escape']] as const) {
      await act(async () => {
        fireEvent.keyDown(handle, { key, code })
      })
    }
    expect(onReorder).not.toHaveBeenCalled()
    expect(screen.getByText('1. a')).toBeTruthy()
  })
})
