import { useEffect, useMemo, useRef, useState } from 'react'
import { Modal } from '@heroui/react'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { Button, IconButton, MeaningChip, SelectField, Text, TextAreaField } from '@/atoms'
import { GapNotice, ImportRowForm, IncompleteMark, InlineNotice, optionKey, type ImportDraft } from '@/molecules'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { toast } from '@/chrome/toast'
import { useChromeStore, EMPTY_LIST_STATE } from '@/chrome/chrome'
import { CONFIRM, IMPORT, QUESTION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { isHostError } from '@/host/host'
import { importSpec, type ImportItem } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useCatalogList, useImportPreview, useTags } from '@/host/queries'
import { difficultyBand, type ImportOverrides, type ImportReport, type ImportRow, type ImportRowBody } from '@/host/types'
import { PickList, type PickerRow } from './PickList'

export interface ImportQuestionsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The domain selected in the pane, when it is active — the default home for rows that name none. */
  defaultDomainId: string | null
}

/** The select's value for "no domain"; a domain id never looks like this. */
const NO_DOMAIN = '__none__'
const NO_ROWS: readonly ListItem<ImportItem, PickerRow>[] = []

const draftOf = (body: ImportRowBody): ImportDraft => ({
  question: body.question,
  // At least two rows to type into, as the editor opens a new question; blank ones are dropped on Apply.
  options: [...body.options.map((o) => ({ key: optionKey(), text: o.text, correct: o.correct })), ...Array.from({ length: Math.max(0, 2 - body.options.length) }, () => ({ key: optionKey(), text: '', correct: false }))],
  difficulty: body.difficulty,
  domains: body.domains,
  explanation: body.explanation ?? '',
  tags: body.tags,
})
/** A draft as a row of the file: the host reads it like any other row. */
const rowOf = (d: ImportDraft) => ({
  question: d.question,
  options: d.options.filter((o) => o.text.trim()).map((o) => ({ text: o.text, correct: o.correct })),
  ...(d.difficulty !== null ? { difficulty: d.difficulty } : {}),
  domains: d.domains,
  ...(d.explanation.trim() ? { explanation: d.explanation } : {}),
  tags: d.tags,
})
const importable = (r: ImportRow) => r.status === 'complete' || r.status === 'incomplete'

/**
 * Many questions from one JSON file (§2.32, 05_STUDIO_DESIGN.md §17.4), as a
 * workspace for the file (P20): the rows on the list-view model — search,
 * filters (status, what is missing, domain, question tag…), grouped by status
 * with the problems first — each ticked to import or left out, and opened
 * beside the list to edit. The host still reads everything: an edit goes back
 * as a row of the file, a left-out row as its index (`edits`, `skip`), and the
 * host plans the file again — once for the preview (`commit: false`) and once
 * on Import, so the two cannot disagree. The dialog never parses the document.
 */
export function ImportQuestionsDialog({ isOpen, onOpenChange, defaultDomainId }: ImportQuestionsDialogProps) {
  const [text, setText] = useState('')
  const [fileName, setFileName] = useState<string | null>(null)
  const [showText, setShowText] = useState(false)
  const [domainId, setDomainId] = useState<string | null>(defaultDomainId)
  const [edits, setEdits] = useState<ReadonlyMap<number, ImportDraft>>(new Map())
  const [skip, setSkip] = useState<ReadonlySet<number>>(new Set())
  const [openRow, setOpenRow] = useState<number | null>(null)
  const [pending, setPending] = useState(false)
  const [debounced] = useDebouncedValue(text, { wait: 250 })
  const file = useRef<HTMLInputElement | null>(null)
  const domains = useCatalogList('domain', 'active')
  const tags = useTags()
  const setListState = useChromeStore((s) => s.setListState)
  const overrides = useMemo<ImportOverrides>(
    () => ({ edits: [...edits].map(([index, d]) => ({ index, row: rowOf(d) })), skip: [...skip] }),
    [edits, skip],
  )
  const preview = useImportPreview(debounced, domainId, overrides)
  const run = useHostCommand()
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)

  useEffect(() => {
    if (isOpen) setDomainId(defaultDomainId)
  }, [isOpen, defaultDomainId])

  /** A new file: the edits, skips and open row belonged to the old one's indexes. */
  const replaceText = (next: string, name: string | null) => {
    setText(next)
    setFileName(name)
    setEdits(new Map())
    setSkip(new Set())
    setOpenRow(null)
    setListState('importQuestions', EMPTY_LIST_STATE)
  }

  const hasText = debounced.trim().length > 0
  const report: ImportReport | undefined = hasText && !preview.isError ? preview.data : undefined
  const willImport = report ? report.counts.complete + report.counts.incomplete : 0
  // The host's `import:` prefix is a routing path (`targetPathOf`), not a word the operator needs to read.
  const refusal = hasText && preview.isError ? (isHostError(preview.error) ? preview.error.message : String(preview.error)).replace(/^import:\s*/, '') : null
  const settled = text === debounced && !preview.isFetching

  const newNames = useMemo(() => new Set((report?.newDomains ?? []).map((d) => d.name.toLowerCase())), [report])
  const items = useMemo<readonly ListItem<ImportItem, PickerRow>[]>(() => {
    if (!report) return NO_ROWS
    return report.rows.map((row) => {
      const difficulty = row.body?.difficulty ?? null
      const band = difficulty === null ? null : difficultyBand(difficulty)
      const subtitle =
        row.status === 'duplicate'
          ? row.duplicateRow !== null
            ? IMPORT.duplicateRow(row.duplicateRow)
            : IMPORT.duplicateOf(row.duplicateOf ?? '')
          : row.status === 'rejected'
            ? row.reason
              ? IMPORT.reason[row.reason]
              : IMPORT.status.rejected
            : row.landing.length > 0
              ? IMPORT.landsIn(row.landing)
              : undefined
      const view: PickerRow = {
        title: row.stem || QUESTION.noStem,
        subtitle,
        leading: (
          <Text variant="studio-mono" tone="muted" className="w-10 text-right" tabular>
            {row.index}
          </Text>
        ),
        chips: (
          <>
            {row.edited ? <MeaningChip meaning="edited">{IMPORT.edited}</MeaningChip> : null}
            {row.skipped ? <MeaningChip meaning="leftOut">{IMPORT.leftOut}</MeaningChip> : null}
            {row.tags.slice(0, 2).map((t) => (
              <MeaningChip key={t} meaning="tag">
                {t}
              </MeaningChip>
            ))}
            <IncompleteMark gaps={row.gaps} />
            {importable(row) ? band ? <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${difficulty}`}</MeaningChip> : <MeaningChip meaning="unset">{QUESTION.difficultyUnset}</MeaningChip> : null}
          </>
        ),
      }
      return { id: String(row.index), data: { row, creates: row.domains.some((d) => newNames.has(d.toLowerCase())) }, view }
    })
  }, [report, newNames])
  const spec = useMemo(
    () =>
      importSpec({
        tags: [...new Set((report?.rows ?? []).flatMap((r) => r.tags))],
        domains: [...new Set((report?.rows ?? []).flatMap((r) => r.domains))].sort((a, b) => a.localeCompare(b)),
      }),
    [report],
  )
  // Ticked: every row that will be imported. A tick off is a skip; on, an include.
  const chosen = useMemo(() => (report?.rows ?? []).filter((r) => importable(r) && !r.skipped).map((r) => String(r.index)), [report])
  const onChosen = (update: (now: readonly string[]) => readonly string[]) => {
    const next = new Set(update(chosen))
    const out = new Set<number>()
    for (const r of report?.rows ?? []) if (importable(r) && !next.has(String(r.index))) out.add(r.index)
    setSkip(out)
  }

  const close = () => {
    replaceText('', null)
    setShowText(false)
    onOpenChange(false)
  }
  const commit = async () => {
    setPending(true)
    const done = await run<ImportReport>(
      'catalog_import_questions',
      { text, commit: true, defaultDomainId: domainId, overrides },
      { targetPath: 'import' },
    )
    setPending(false)
    if (done) {
      toast.success(IMPORT.done(done.counts))
      close()
    }
  }
  const copyTemplate = async () => {
    try {
      await navigator.clipboard.writeText(IMPORT.template)
      toast.success(IMPORT.templateCopied)
    } catch {
      // No clipboard in this webview: the template goes where it can be copied by hand.
      replaceText(IMPORT.template, null)
      setShowText(true)
    }
  }
  const filterStatus = (status: ImportRow['status']) =>
    useChromeStore.getState().setListState('importQuestions', { filters: { status: [status] }, page: 1 })

  const current = report?.rows.find((r) => r.index === openRow) ?? null
  const source = (
    <>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label={IMPORT.choose}
        onChange={(e) => {
          const picked = e.target.files?.[0]
          e.target.value = ''
          if (picked) void picked.text().then((t) => replaceText(t, picked.name))
        }}
      />
      <Button variant="secondary" icon="import" onPress={() => file.current?.click()}>
        {hasText ? IMPORT.changeFile : IMPORT.choose}
      </Button>
      <Button variant="ghost" icon="copy" onPress={() => void copyTemplate()}>
        {IMPORT.copyTemplate}
      </Button>
    </>
  )
  const domainSelect = (
    <SelectField
      label={IMPORT.defaultDomain}
      value={domainId ?? NO_DOMAIN}
      onChange={(v) => setDomainId(v === NO_DOMAIN ? null : v)}
      options={[{ value: NO_DOMAIN, label: IMPORT.noDomain }, ...(domains.data ?? []).map((d) => ({ value: d.id, label: d.name, description: d.code }))]}
      className="w-72"
    />
  )
  const textBox = <TextAreaField label={IMPORT.paste} value={text} onChange={(t) => replaceText(t, fileName)} rows={hasText ? 6 : 10} description={IMPORT.pasteHint} />

  return (
    // A loaded file is not lost to a stray click outside or Esc: only Cancel drops it (P20).
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())} isDismissable={!hasText} isKeyboardDismissDisabled={hasText}>
      <Modal.Container size="lg">
        <Modal.Dialog className={['w-full max-w-[min(80rem,calc(100vw-4rem))]', hasText ? 'h-[min(56rem,calc(100vh-4rem))]' : ''].join(' ')}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{IMPORT.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="@container/import flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
            {noticesAt(notices, 'import').map((n) => (
              <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
            ))}
            {!hasText ? (
              <div className="flex flex-col gap-4">
                <Text as="p" variant="studio-body" tone="muted">
                  {IMPORT.hint}
                </Text>
                <div className="flex flex-wrap items-center gap-2">{source}</div>
                {textBox}
                <Text as="p" variant="studio-caption" tone="muted">
                  {IMPORT.fields}
                </Text>
                {domainSelect}
              </div>
            ) : (
              <>
                {/* The source in one line: the file, its rows, where rows with no domain go. */}
                <div className="flex shrink-0 flex-wrap items-end gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <Text variant="studio-subheading" truncate>
                      {IMPORT.fileRows(fileName, report?.rows.length ?? 0)}
                    </Text>
                    <div className="flex flex-wrap items-center gap-2">
                      {source}
                      <Button variant="ghost" icon="edit" onPress={() => setShowText((v) => !v)}>
                        {showText ? IMPORT.hideText : IMPORT.editText}
                      </Button>
                    </div>
                  </div>
                  <div className="flex-1" />
                  {domainSelect}
                </div>
                {showText ? <div className="shrink-0">{textBox}</div> : null}
                {refusal ? (
                  <Text as="p" variant="studio-body" tone="danger">
                    {refusal}
                  </Text>
                ) : report ? (
                  <div className="relative flex min-h-0 flex-1 gap-4">
                    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                      <PickList
                        spec={spec}
                        items={items}
                        chosen={chosen}
                        onChosen={onChosen}
                        disabledReason={(id) => {
                          const r = report.rows.find((x) => String(x.index) === id)
                          if (!r || importable(r)) return null
                          return r.status === 'duplicate' ? (r.duplicateRow !== null ? IMPORT.duplicateRow(r.duplicateRow) : IMPORT.duplicateOf(r.duplicateOf ?? '')) : r.reason ? IMPORT.reason[r.reason] : IMPORT.status.rejected
                        }}
                        count={IMPORT.toImport(willImport, report.rows.length)}
                        onOpen={(id) => setOpenRow((now) => (now === Number(id) ? null : Number(id)))}
                        currentId={openRow === null ? null : String(openRow)}
                        searchText={(i) => [i.data.row.stem, ...(i.data.row.body?.options.map((o) => o.text) ?? []), ...i.data.row.tags, ...i.data.row.domains].join(' ')}
                        above={
                          <div className="flex shrink-0 flex-wrap items-center gap-2" data-import-summary>
                            <Text variant="studio-caption" tone="muted">
                              {IMPORT.summary(report.counts, report.newDomains.length)}
                            </Text>
                            {(['duplicate', 'rejected', 'incomplete'] as const)
                              .filter((s) => report.counts[s] > 0)
                              .map((s) => (
                                <Button key={s} size="sm" variant="tertiary" onPress={() => filterStatus(s)}>
                                  {IMPORT.count(report.counts[s], s)}
                                </Button>
                              ))}
                            {report.newDomains.length > 0 ? (
                              <Text variant="studio-caption" tone="muted">
                                {IMPORT.newDomains(report.newDomains.map((d) => d.name))}
                              </Text>
                            ) : null}
                          </div>
                        }
                      />
                    </div>
                    {current ? (
                      <RowPane
                        key={`${current.index}:${debounced.length}`}
                        row={current}
                        draft={edits.get(current.index) ?? (current.body ? draftOf(current.body) : null)}
                        isEdited={edits.has(current.index)}
                        knownTags={(tags.data ?? []).map((t) => t.tag)}
                        knownDomains={[...(domains.data ?? []).map((d) => d.name), ...report.newDomains.map((d) => d.name)]}
                        onApply={(d, next) => {
                          setEdits((now) => new Map(now).set(current.index, d))
                          if (next) {
                            const after = report.rows.find((r) => r.index > current.index && r.body !== null)
                            setOpenRow(after?.index ?? null)
                          }
                        }}
                        onRevert={() =>
                          setEdits((now) => {
                            const m = new Map(now)
                            m.delete(current.index)
                            return m
                          })
                        }
                        onSkip={(out) =>
                          setSkip((now) => {
                            const s = new Set(now)
                            if (out) s.add(current.index)
                            else s.delete(current.index)
                            return s
                          })
                        }
                        onClose={() => setOpenRow(null)}
                      />
                    ) : null}
                  </div>
                ) : (
                  <Text as="p" variant="studio-caption" tone="muted">
                    {IMPORT.empty}
                  </Text>
                )}
              </>
            )}
          </Modal.Body>
          <Modal.Footer>
            {report ? (
              <Text variant="studio-caption" tone="muted" className="mr-auto">
                {IMPORT.toImport(willImport, report.rows.length)}
              </Text>
            ) : null}
            <Button variant="tertiary" onPress={close} isDisabled={pending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="primary" onPress={() => void commit()} isPending={pending} isDisabled={willImport === 0 || !settled}>
              {IMPORT.submit(willImport)}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

/**
 * One row, opened beside the list (P20): what is wrong with it, then its
 * fields. *Apply* is explicit — a row does not jump groups while it is typed
 * in — and judged on press (fields commit on blur).
 */
function RowPane({
  row,
  draft: initial,
  isEdited,
  knownTags,
  knownDomains,
  onApply,
  onRevert,
  onSkip,
  onClose,
}: {
  row: ImportRow
  draft: ImportDraft | null
  isEdited: boolean
  knownTags: readonly string[]
  knownDomains: readonly string[]
  onApply: (draft: ImportDraft, next: boolean) => void
  onRevert: () => void
  onSkip: (out: boolean) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ImportDraft | null>(initial)
  return (
    <aside
      aria-label={IMPORT.rowTitle(row.index)}
      className="absolute inset-y-0 right-0 z-20 flex w-[min(26rem,100%)] flex-col gap-3 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-xl @5xl/import:static @5xl/import:w-[26rem] @5xl/import:shrink-0 @5xl/import:rounded-none @5xl/import:border-0 @5xl/import:border-l @5xl/import:border-[var(--separator)] @5xl/import:bg-transparent @5xl/import:pl-4 @5xl/import:shadow-none"
      data-import-row
    >
      <div className="flex items-center justify-between gap-2">
        <Text as="h3" variant="studio-heading">
          {IMPORT.rowTitle(row.index)}
        </Text>
        <IconButton icon="close" label={IMPORT.closeRow} size="sm" onPress={onClose} />
      </div>
      <GapNotice gaps={row.gaps} />
      {row.ignored.length > 0 ? (
        <div className="flex flex-col gap-0.5">
          <Text variant="studio-label">{IMPORT.ignoredTitle}</Text>
          {row.ignored.map((i) => (
            <Text key={i.field} as="div" variant="studio-caption" tone="muted">
              {IMPORT.ignored(i)}
            </Text>
          ))}
        </div>
      ) : null}
      {draft ? <ImportRowForm value={draft} onChange={setDraft} knownTags={knownTags} knownDomains={knownDomains} /> : null}
      <div className="flex flex-wrap gap-2">
        {draft ? (
          <>
            <Button size="sm" variant="primary" onPress={() => onApply(draft, false)}>
              {IMPORT.apply}
            </Button>
            <Button size="sm" variant="secondary" onPress={() => onApply(draft, true)}>
              {IMPORT.applyNext}
            </Button>
          </>
        ) : null}
        {isEdited ? (
          <Button size="sm" variant="ghost" icon="undo" onPress={onRevert}>
            {IMPORT.revert}
          </Button>
        ) : null}
        {importable(row) ? (
          <Button size="sm" variant="tertiary" onPress={() => onSkip(!row.skipped)}>
            {row.skipped ? IMPORT.includeRow : IMPORT.skipRow}
          </Button>
        ) : null}
      </div>
    </aside>
  )
}
