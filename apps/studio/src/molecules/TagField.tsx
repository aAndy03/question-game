import { useState, type FocusEvent } from 'react'
import { Chip, IconButton, Text, TextField } from '@/atoms'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import type { TagWords } from '@/copy'

/** A question's tags, as the field has always said them (P15). */
export const QUESTION_TAG_WORDS: TagWords = {
  label: GROUPS_TAGS.tagsLabel,
  hint: GROUPS_TAGS.tagsHint,
  listLabel: GROUPS_TAGS.tagsOnQuestion,
  offered: GROUPS_TAGS.tagsOffered,
  offeredCount: GROUPS_TAGS.offeredCount,
  remove: GROUPS_TAGS.tagRemove,
  removed: GROUPS_TAGS.tagRemoved,
  full: GROUPS_TAGS.tagsFull,
  tooLong: GROUPS_TAGS.tagTooLong,
}

export interface TagFieldProps {
  value: readonly string[]
  onChange: (tags: string[]) => void
  /** Tags already used in view — the only ones ever offered. */
  known: readonly string[]
  error?: string | null | undefined
  /** Whose tags (P20): a question's by default, or a game's (`GAME_TAG_WORDS`). */
  words?: TagWords | undefined
  /** The longest entry and the most entries: a tag's 40 and 20 by default. */
  limits?: { readonly length: number; readonly count: number } | undefined
}

const fold = (t: string) => t.trim().toLowerCase()

/**
 * A question's tags (P15) — or a game's (P20, `words`): chips, each with its remove button, and a field
 * that adds what is typed on Enter or a comma. As the operator types, tags
 * they have already used are offered; nothing else is ever suggested, and a
 * new tag is simply what they type. A tag they have used under another case
 * is taken as it is already spelled.
 *
 * Leaving the field adds what is in it — unless focus goes to an offered tag
 * (which adds itself) or to a control marked `data-keep-draft` (Cancel).
 */
export function TagField({ value, onChange, known, error, words = QUESTION_TAG_WORDS, limits = { length: 40, count: 20 } }: TagFieldProps) {
  const [text, setText] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const [said, setSaid] = useState('')

  /** Adds each tag in turn; returns false when one is refused. */
  const addAll = (raws: readonly string[]): boolean => {
    let next = [...value]
    for (const raw of raws) {
      const tag = raw.trim()
      if (!tag) continue
      if ([...tag].length > limits.length) {
        if (next.length !== value.length) onChange(next)
        setLocal(words.tooLong)
        return false
      }
      if (next.some((t) => fold(t) === fold(tag))) continue
      if (next.length >= limits.count) {
        if (next.length !== value.length) onChange(next)
        setLocal(words.full)
        return false
      }
      next = [...next, known.find((k) => fold(k) === fold(tag)) ?? tag]
    }
    if (next.length !== value.length) onChange(next)
    setLocal(null)
    return true
  }
  const add = (raw: string) => {
    if (addAll([raw])) setText('')
  }
  const remove = (tag: string) => {
    onChange(value.filter((x) => x !== tag))
    setSaid(words.removed(tag))
  }

  const offered = text.trim()
    ? known.filter((k) => fold(k).startsWith(fold(text)) && !value.some((t) => fold(t) === fold(k))).slice(0, 8)
    : []

  const leave = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget instanceof Element ? e.relatedTarget : null
    if (to && (e.currentTarget.parentElement?.contains(to) || to.closest('[data-keep-draft]'))) return
    add(text)
  }

  return (
    <div className="flex flex-col gap-2" data-tag-field>
      <div
        onBlur={leave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
            remove(value[value.length - 1] as string)
          }
        }}
      >
        <TextField
          label={words.label}
          description={words.hint}
          value={text}
          onChange={(v) => {
            setLocal(null)
            if (!v.includes(',')) return setText(v)
            // A pasted "a, b, c" is three tags; what follows the last comma stays typed.
            const parts = v.split(',')
            const rest = parts.pop() ?? ''
            setText(addAll(parts) ? rest : v.replace(/,/g, ''))
          }}
          error={local ?? error}
          maxLength={limits.length + 1}
        />
      </div>
      {offered.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={words.offered}>
          {offered.map((k) => (
            <button
              key={k}
              type="button"
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--surface-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              // Keep focus in the field, so leaving it does not add the half-typed text first.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => add(k)}
            >
              <Text variant="studio-caption">{k}</Text>
            </button>
          ))}
        </div>
      ) : null}
      {/* The chips under the field (P20): the label reads first, as every field's does. */}
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={words.listLabel}>
          {value.map((t) => (
            <li key={t} className="flex items-center gap-0.5">
              <Chip tone="default" size="sm">
                {t}
              </Chip>
              <IconButton icon="close" label={words.remove(t)} size="sm" onPress={() => remove(t)} />
            </li>
          ))}
        </ul>
      ) : null}
      <span className="sr-only" role="status" aria-live="polite">
        {offered.length > 0 ? words.offeredCount(offered.length) : said}
      </span>
    </div>
  )
}
