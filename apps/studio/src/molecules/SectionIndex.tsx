import { useEffect, useState } from 'react'
import { Text } from '@/atoms'
import { SHELL } from '@/copy'

export interface SectionIndexProps {
  /** Each section's element id and its title, in page order. */
  entries: readonly { readonly id: string; readonly title: string }[]
}

/**
 * *On this page* (P20): a long form's sections, beside it on a wide page —
 * the empty right side of Settings used for the one thing a 3,500px column
 * lacks. A press scrolls to the section; the one in view is marked. Nothing
 * here changes a route.
 */
export function SectionIndex({ entries }: SectionIndexProps) {
  const [current, setCurrent] = useState<string | null>(entries[0]?.id ?? null)
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const seen = new Map<string, boolean>()
    const observer = new IntersectionObserver(
      (records) => {
        for (const r of records) seen.set(r.target.id, r.isIntersecting)
        const first = entries.find((e) => seen.get(e.id))
        if (first) setCurrent(first.id)
      },
      { rootMargin: '0px 0px -60% 0px' },
    )
    for (const e of entries) {
      const el = document.getElementById(e.id)
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [entries])

  return (
    <nav aria-label={SHELL.onThisPage} className="sticky top-0 flex flex-col gap-1">
      <Text as="div" variant="studio-caption" tone="muted" className="px-2 pb-1">
        {SHELL.onThisPage}
      </Text>
      {entries.map((e) => (
        <button
          key={e.id}
          type="button"
          aria-current={current === e.id ? 'location' : undefined}
          onClick={() => {
            document.getElementById(e.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            setCurrent(e.id)
          }}
          className={[
            'rounded px-2 py-1 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]',
            current === e.id ? 'text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--foreground)]',
          ].join(' ')}
        >
          {e.title}
        </button>
      ))}
    </nav>
  )
}
