import { useState, type ReactNode } from 'react'
import { DragDropProvider } from '@dnd-kit/react'
import { useSortable } from '@dnd-kit/react/sortable'
import { move } from '@dnd-kit/helpers'
import { Icon, Tooltip } from '@/atoms'

export interface SortableRowHandle {
  readonly index: number
  /** Put it on the drag handle (`DragHandle` does). */
  readonly handleRef: (element: Element | null) => void
  readonly isDragging: boolean
}

export interface SortableListProps {
  /** The order now, as the host has it. */
  ids: readonly string[]
  /** The new order, once, on a drop. `false` (a refusal) puts the old order back. */
  onReorder: (next: readonly string[]) => Promise<boolean> | boolean | void
  /** The list's accessible name. */
  label: string
  /** Every handle disabled, with the reason (a frozen game). */
  disabledReason?: string | null | undefined
  className?: string | undefined
  renderRow: (id: string, handle: SortableRowHandle) => ReactNode
}

/** How a row slides aside: Studio's motion tokens (05_STUDIO_DESIGN.md §2.6). */
const TRANSITION = { duration: 220, easing: 'cubic-bezier(0.2, 0, 0, 1)', idle: true }

/**
 * A list the operator orders by dragging (P20): the roster, the Board's
 * domains, a question's options. A handle per row; the other rows slide aside
 * as one moves (dnd-kit's own animation — the same sortable as Control's
 * ring); the drop writes the new order once. The order shown is optimistic
 * until the next `ids` arrives (the host's change), and a refusal puts the old
 * order back. On the keyboard the handle lifts with Space or Enter, the arrows
 * move, Space drops and Escape cancels.
 */
export function SortableList({ ids, onReorder, label, disabledReason, className, renderRow }: SortableListProps) {
  const [optimistic, setOptimistic] = useState<{ from: readonly string[]; order: readonly string[] } | null>(null)
  // A new order from the host replaces ours: ours was only standing in for it.
  // Compared by content — a caller may build `ids` afresh on every render.
  const order = optimistic && sameOrder(optimistic.from, ids) ? optimistic.order : ids
  return (
    <DragDropProvider
      onDragEnd={(event) => {
        if (event.canceled) return
        const next = move([...order], event) as string[]
        if (sameOrder(next, order)) return
        setOptimistic({ from: ids, order: next })
        void Promise.resolve(onReorder(next)).then((ok) => {
          if (ok === false) setOptimistic(null)
        })
      }}
    >
      <ol aria-label={label} className={className}>
        {order.map((id, index) => (
          <SortableRow key={id} id={id} index={index} disabled={Boolean(disabledReason)} render={(handle) => renderRow(id, handle)} />
        ))}
      </ol>
    </DragDropProvider>
  )
}

const sameOrder = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((id, i) => id === b[i])

function SortableRow({ id, index, disabled, render }: { id: string; index: number; disabled: boolean; render: (handle: SortableRowHandle) => ReactNode }) {
  const { ref, handleRef, isDragging } = useSortable({ id, index, disabled, transition: TRANSITION })
  return (
    <li ref={ref} className={isDragging ? 'relative z-10 opacity-70' : undefined} data-sortable-row={id}>
      {render({ index, handleRef, isDragging })}
    </li>
  )
}

/** The grip a row is dragged by: a button, so the keyboard reaches it. */
export function DragHandle({ handle, label, disabledReason }: { handle: SortableRowHandle; label: string; disabledReason?: string | null | undefined }) {
  const button = (
    <button
      ref={handle.handleRef}
      type="button"
      aria-label={label}
      disabled={Boolean(disabledReason)}
      className="grid h-8 w-6 shrink-0 cursor-grab place-items-center rounded text-[var(--muted)] outline-none hover:text-[var(--foreground)] focus-visible:ring-2 focus-visible:ring-[var(--focus)] active:cursor-grabbing disabled:cursor-not-allowed disabled:opacity-40"
    >
      <Icon name="drag" size="sm" />
    </button>
  )
  return disabledReason ? <Tooltip content={disabledReason}>{button}</Tooltip> : button
}
