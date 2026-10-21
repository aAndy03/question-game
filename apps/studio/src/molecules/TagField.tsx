import { useState } from 'react'
import { Chip, IconButton, Text, TextField } from '@/atoms'
import { GROUPS_TAGS } from '@/copy/groupsTags'

export interface TagFieldProps {
  value: readonly string[]
  onChange: (tags: string[]) => void
  /** Tags already used in view — the only ones ever offered. */
  known: readonly string[]
  error?: string | null | undefined
}

const fold = (t: string) => t.trim().toLowerCase()

/**
 * A question's tags (P15): chips, each with its remove button, and a field
 * that adds what is typed on Enter or a comma. As the operator types, tags
 * they have already used are offered; nothing else is ever suggested, and a
 * new tag is simply what they type. A tag they have used under another case
 * is taken as it is already spelled.
 */
export function TagField({ value, onChange, known, error }: TagFieldProps) {
  const [text, setText] = useState('')
  const [local, setLocal] = useState<string | null>(null)
  const full = value.length >= 20

  const add = (raw: string) => {
    const tag = raw.trim()
    if (!tag) return
    if ([...tag].length > 40) return setLocal(GROUPS_TAGS.tagTooLong)
    if (value.some((t) => fold(t) === fold(tag))) return setText('')
    if (full) return setLocal(GROUPS_TAGS.tagsFull)
    onChange([...value, known.find((k) => fold(k) === fold(tag)) ?? tag])
    setText('')
    setLocal(null)
  }

  const offered = text.trim()
    ? known.filter((k) => fold(k).startsWith(fold(text)) && !value.some((t) => fold(t) === fold(k))).slice(0, 8)
    : []

  return (
    <div className="flex flex-col gap-2" data-tag-field>
      {value.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label={GROUPS_TAGS.tagsLabel}>
          {value.map((t) => (
            <li key={t} className="flex items-center gap-0.5">
              <Chip tone="default" size="sm">
                {t}
              </Chip>
              <IconButton icon="close" label={GROUPS_TAGS.tagRemove(t)} size="sm" onPress={() => onChange(value.filter((x) => x !== t))} />
            </li>
          ))}
        </ul>
      ) : null}
      <div
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            add(text)
          } else if (e.key === 'Backspace' && text === '' && value.length > 0) {
            onChange(value.slice(0, -1))
          }
        }}
      >
        <TextField
          label={GROUPS_TAGS.tagsLabel}
          description={GROUPS_TAGS.tagsHint}
          value={text}
          onChange={(v) => {
            setText(v.replace(/,$/, ''))
            setLocal(null)
          }}
          onBlur={() => add(text)}
          error={local ?? error}
          isDisabled={full && text === ''}
          maxLength={41}
        />
      </div>
      {offered.length > 0 ? (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={GROUPS_TAGS.tags}>
          {offered.map((k) => (
            <button
              key={k}
              type="button"
              className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--surface-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
              onClick={() => add(k)}
            >
              <Text variant="studio-caption">{k}</Text>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
