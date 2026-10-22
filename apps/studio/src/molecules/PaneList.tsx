import { useState } from 'react'
import { Text } from '@/atoms'
import { SearchField } from './SearchField'

export interface PaneEntry {
  readonly id: string
  readonly label: string
  readonly count: number
  /** A muted entry: *No domain group*, an archived row. */
  readonly muted?: boolean | undefined
}

export interface PaneListProps {
  entries: readonly PaneEntry[]
  selectedId: string | null
  onSelect: (id: string) => void
  /** The plural noun for the search field and the list's name. */
  what: string
  /** Shown above the entries, e.g. an A–Z / Most used switch. */
  top?: React.ReactNode
}

const SEARCH_FROM = 8
const fold = (s: string) => s.trim().toLowerCase()

/**
 * A manager's entries (P20): a listbox of names with their counts, the chosen
 * one marked — the Domains pane's look. Long lists get a search field; a
 * short one does not, so three tags are just three rows.
 */
export function PaneList({ entries, selectedId, onSelect, what, top }: PaneListProps) {
  const [search, setSearch] = useState('')
  const shown = search.trim() ? entries.filter((e) => fold(e.label).includes(fold(search))) : entries
  return (
    <div className="flex min-h-0 flex-col gap-2">
      {entries.length > SEARCH_FROM ? <SearchField what={what} onSearch={setSearch} initial="" className="w-full" /> : null}
      {top}
      <ul role="listbox" aria-label={what} className="flex flex-col gap-0.5">
        {shown.map((e) => {
          const on = e.id === selectedId
          return (
            <li
              key={e.id}
              role="option"
              aria-selected={on}
              tabIndex={0}
              onClick={() => onSelect(e.id)}
              onKeyDown={(k) => {
                if (k.key === 'Enter' || k.key === ' ') {
                  k.preventDefault()
                  onSelect(e.id)
                }
              }}
              className={[
                'flex h-9 cursor-pointer items-center gap-2 rounded-[calc(var(--radius)/1.5)] px-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
                on ? 'bg-[var(--accent)]/12 text-[var(--accent)]' : 'hover:bg-[var(--surface-secondary)]',
              ].join(' ')}
            >
              <Text variant="studio-body" tone={e.muted && !on ? 'muted' : 'inherit'} truncate className="min-w-0 flex-1">
                {e.label}
              </Text>
              <Text variant="studio-mono" tone="muted" tabular>
                {e.count}
              </Text>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
