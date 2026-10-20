import { useEffect, useRef, useState } from 'react'
import { SearchField as HeroSearchField } from '@heroui/react'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { LIST } from '@/copy'

export interface SearchFieldProps {
  /** What is being searched, for the placeholder: "teams", "questions". */
  what: string
  /** Fires with the debounced text (200ms), and immediately with `''` on clear. */
  onSearch: (text: string) => void
  autoFocus?: boolean | undefined
  className?: string | undefined
  /** The text to start from — a search kept for the session (stable 1.1). */
  initial?: string | undefined
}

/**
 * The search box on every list toolbar. Search filters the current list
 * (spec §12); the query composition (kinds, scope) is the list's business.
 */
export function SearchField({ what, onSearch, autoFocus, className, initial = '' }: SearchFieldProps) {
  const [text, setText] = useState(initial)
  // The text last reported (or last set from outside). Each new text is
  // reported once; and a search cleared elsewhere — the list's *Clear search* —
  // empties the box instead of being undone by the old text (review).
  const last = useRef(initial.trim())
  const report = useRef(onSearch)
  report.current = onSearch
  const [debounced] = useDebouncedValue(text, { wait: 200 })

  useEffect(() => {
    const t = debounced.trim()
    if (t === last.current) return
    last.current = t
    report.current(t)
  }, [debounced])

  useEffect(() => {
    const t = initial.trim()
    if (t === last.current) return
    last.current = t
    setText(initial)
  }, [initial])

  return (
    <HeroSearchField
      value={text}
      onChange={setText}
      onClear={() => {
        setText('')
        last.current = ''
        onSearch('')
      }}
      aria-label={LIST.search}
      autoFocus={Boolean(autoFocus)}
      className={className ?? 'w-72'}
    >
      <HeroSearchField.Group>
        <HeroSearchField.SearchIcon />
        <HeroSearchField.Input placeholder={LIST.searchPlaceholder(what)} />
        <HeroSearchField.ClearButton />
      </HeroSearchField.Group>
    </HeroSearchField>
  )
}
