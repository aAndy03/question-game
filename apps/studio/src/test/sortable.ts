import { act, fireEvent } from '@testing-library/react'

/**
 * jsdom lays nothing out, so dnd-kit cannot find the row below. This gives
 * every `SortableList` row a slot by its place in its list, and everything
 * around the rows one tall box so nothing clips them. Returns the restore.
 */
export function stubRowLayout(row = 40): () => void {
  const original = Element.prototype.getBoundingClientRect
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this.closest('[data-sortable-row]')
    if (!el) return { x: 0, y: 0, top: 0, left: 0, width: 800, height: 4000, right: 800, bottom: 4000, toJSON: () => ({}) } as DOMRect
    const index = Array.from(el.parentElement?.children ?? []).indexOf(el)
    const top = index * row
    return { x: 0, y: top, top, left: 0, width: 800, height: row - 4, right: 800, bottom: top + row - 4, toJSON: () => ({}) } as DOMRect
  }
  return () => {
    Element.prototype.getBoundingClientRect = original
  }
}

/** Lift a row by its handle, move it `steps` rows (negative is up), drop it. */
export async function keyboardDrag(handle: HTMLElement, steps: number): Promise<void> {
  handle.focus()
  const press = async (key: string, code: string) => {
    await act(async () => {
      fireEvent.keyDown(handle, { key, code })
    })
  }
  await press(' ', 'Space')
  for (let i = 0; i < Math.abs(steps); i++) await press(steps > 0 ? 'ArrowDown' : 'ArrowUp', steps > 0 ? 'ArrowDown' : 'ArrowUp')
  await press(' ', 'Space')
}
