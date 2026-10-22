import { Button, Text, TextAreaField } from '@/atoms'
import { IMPORT, QUESTION, type TagWords } from '@/copy'
import { DifficultyField } from './DifficultyField'
import { OptionRow } from './OptionRow'
import { SortableList } from './SortableList'
import { TagField } from './TagField'

/** A row of an import file being edited (P20), in the file's own terms. */
export interface ImportDraft {
  readonly question: string
  /** `key` is the form's own, to keep rows stable while they are typed in. */
  readonly options: readonly { readonly key: string; readonly text: string; readonly correct: boolean }[]
  readonly difficulty: number | null
  /** Names or codes, as a file writes them. */
  readonly domains: readonly string[]
  readonly explanation: string
  readonly tags: readonly string[]
}

export interface ImportRowFormProps {
  value: ImportDraft
  onChange: (next: ImportDraft) => void
  /** Question tags already used — the only ones offered. */
  knownTags: readonly string[]
  /** Domain names (and the file's new ones) — offered for the row's domains. */
  knownDomains: readonly string[]
}

const DOMAIN_WORDS: TagWords = {
  label: IMPORT.rowDomains,
  hint: IMPORT.rowDomainsHint,
  listLabel: IMPORT.rowDomains,
  offered: QUESTION.domainsOffered,
  offeredCount: QUESTION.domainsOfferedCount,
  remove: QUESTION.removeDomain,
  removed: QUESTION.removedDomain,
  full: QUESTION.domainsFull,
  tooLong: QUESTION.domainTooLong,
}

/** A key for a new option row: the form's own, never written to the file. */
export const optionKey = () => `o-${crypto.randomUUID().slice(0, 8)}`

/**
 * One row of an import, edited in the dialog (P20): question · options ·
 * difficulty · explanation · question tags · domains — the question editor's
 * fields, without its host writes. Pure: the dialog sends the row back to the
 * host as a row of the file, and the host reads it like any other.
 */
export function ImportRowForm({ value, onChange, knownTags, knownDomains }: ImportRowFormProps) {
  const set = (patch: Partial<ImportDraft>) => onChange({ ...value, ...patch })
  const correct = value.options.filter((o) => o.correct).length
  return (
    <div className="flex flex-col gap-4">
      <TextAreaField label={QUESTION.stem} value={value.question} onChange={(question) => set({ question })} rows={3} />
      <div className="flex flex-col gap-2">
        <Text variant="studio-label">{QUESTION.options}</Text>
        <SortableList
          ids={value.options.map((o) => o.key)}
          label={QUESTION.options}
          onReorder={(next) => set({ options: next.flatMap((key) => value.options.filter((o) => o.key === key)) })}
          className="flex flex-col gap-2"
          renderRow={(key, handle) => {
            const i = value.options.findIndex((o) => o.key === key)
            const o = value.options[i]
            if (!o) return null
            return (
              <OptionRow
                handle={handle}
                index={i}
                text={o.text}
                correct={o.correct}
                onTextChange={(text) => set({ options: value.options.map((x, j) => (j === i ? { ...x, text } : x)) })}
                onCorrectChange={(c) => set({ options: value.options.map((x, j) => (j === i ? { ...x, correct: c } : x)) })}
                onRemove={() => set({ options: value.options.filter((_, j) => j !== i) })}
                isLastCorrect={o.correct && correct === 1}
                isRequired={value.options.length <= 2}
              />
            )
          }}
        />
        <div>
          <Button size="sm" variant="ghost" icon="add" onPress={() => set({ options: [...value.options, { key: optionKey(), text: '', correct: false }] })}>
            {QUESTION.addOption}
          </Button>
        </div>
      </div>
      <DifficultyField value={value.difficulty} onChange={(difficulty) => set({ difficulty })} />
      <TagField value={value.tags} onChange={(tags) => set({ tags })} known={knownTags} />
      <TagField words={DOMAIN_WORDS} limits={{ length: 120, count: 50 }} value={value.domains} onChange={(domains) => set({ domains })} known={knownDomains} />
      <TextAreaField label={QUESTION.explanation} value={value.explanation} onChange={(explanation) => set({ explanation })} rows={2} />
    </div>
  )
}
