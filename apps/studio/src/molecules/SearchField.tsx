import { useEffect, useState } from 'react'
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
}

/**
 * The search box on every list toolbar. Search filters the current list
 * (spec §12); the query composition (kinds, scope) is the list's business.
 */
export function SearchField({ what, onSearch, autoFocus, className }: SearchFieldProps) {
  const [text, setText] = useState('')
  const [debounced] = useDebouncedValue(text, { wait: 200 })

  useEffect(() => {
    onSearch(debounced.trim())
  }, [debounced, onSearch])

  return (
    <HeroSearchField
      value={text}
      onChange={setText}
      onClear={() => {
        setText('')
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
