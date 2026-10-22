import type { ReactNode } from 'react'
import { Text } from '@/atoms'

export interface Member {
  readonly id: string
  readonly title: string
  /** A difficulty chip, an *Archived* chip. */
  readonly chips?: ReactNode
}

export interface MemberListProps {
  members: readonly Member[]
  /** Shown before the list's end when there are more than `limit`. */
  limit?: number | undefined
  /** The line that stands for the rest: *and 230 more — Show in list*. */
  more?: ((hidden: number) => ReactNode) | undefined
  onOpen?: ((id: string) => void) | undefined
  label: string
}

/**
 * What a tag, a domain group, a folder holds (P20): Board-style lines — the
 * text, its chips at the end — the first `limit` of them, then one line for
 * the rest. A line opens the member when `onOpen` is given.
 */
export function MemberList({ members, limit = 100, more, onOpen, label }: MemberListProps) {
  const shown = members.slice(0, limit)
  const hidden = members.length - shown.length
  return (
    <ul aria-label={label} className="flex flex-col gap-0.5">
      {shown.map((m) => (
        <li key={m.id}>
          <button
            type="button"
            disabled={!onOpen}
            onClick={() => onOpen?.(m.id)}
            className="flex h-9 w-full items-center gap-3 rounded px-1.5 text-left outline-none enabled:hover:bg-[var(--surface-secondary)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]"
          >
            <Text variant="studio-body" truncate className="min-w-0 flex-1">
              {m.title}
            </Text>
            {m.chips}
          </button>
        </li>
      ))}
      {hidden > 0 && more ? <li className="px-1.5 py-1">{more(hidden)}</li> : null}
    </ul>
  )
}
