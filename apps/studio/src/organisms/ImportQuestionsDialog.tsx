import { useEffect, useRef, useState } from 'react'
import { Modal } from '@heroui/react'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { Button, Icon, SelectField, Text, TextAreaField } from '@/atoms'
import { InlineNotice } from '@/molecules'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { toast } from '@/chrome/toast'
import { CONFIRM, IMPORT, QUESTION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { isHostError } from '@/host/host'
import { useCatalogList, useImportPreview } from '@/host/queries'
import type { ImportReport, ImportRow } from '@/host/types'

export interface ImportQuestionsDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** The domain selected in the pane, when it is active — the default home for rows that name none. */
  defaultDomainId: string | null
}

/** The select's value for "no domain"; a domain id never looks like this. */
const NO_DOMAIN = '__none__'

/**
 * Many questions from one JSON file (§2.32, 05_STUDIO_DESIGN.md §17.4).
 *
 * The host plans the file twice: once for this preview (`commit: false`,
 * writes nothing) and once on Import (`commit: true`, one transaction). The
 * dialog never parses the document itself — a second reader would be a second
 * opinion about what the file says. The file is read here only as text
 * (`File.text()`), so there is no plugin and no path.
 */
export function ImportQuestionsDialog({ isOpen, onOpenChange, defaultDomainId }: ImportQuestionsDialogProps) {
  const [text, setText] = useState('')
  const [domainId, setDomainId] = useState<string | null>(defaultDomainId)
  const [pending, setPending] = useState(false)
  const [debounced] = useDebouncedValue(text, { wait: 250 })
  const file = useRef<HTMLInputElement | null>(null)
  const domains = useCatalogList('domain', 'active')
  const preview = useImportPreview(debounced, domainId)
  const run = useHostCommand()
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)

  useEffect(() => {
    if (isOpen) setDomainId(defaultDomainId)
  }, [isOpen, defaultDomainId])

  const hasText = debounced.trim().length > 0
  const report: ImportReport | undefined = hasText && !preview.isError ? preview.data : undefined
  const importable = report ? report.counts.complete + report.counts.incomplete : 0
  // The host's `import:` prefix is a routing path (`targetPathOf`), not a word
  // the operator needs to read.
  const refusal =
    hasText && preview.isError
      ? (isHostError(preview.error) ? preview.error.message : String(preview.error)).replace(/^import:\s*/, '')
      : null
  const settled = text === debounced && !preview.isFetching

  const close = () => {
    setText('')
    onOpenChange(false)
  }

  const commit = async () => {
    setPending(true)
    const done = await run<ImportReport>('catalog_import_questions', { text, commit: true, defaultDomainId: domainId }, { targetPath: 'import' })
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
      setText(IMPORT.template)
    }
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => (open ? onOpenChange(true) : close())}>
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{IMPORT.title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-4">
            <Text as="p" variant="studio-caption" tone="muted">
              {IMPORT.hint}
            </Text>
            {noticesAt(notices, 'import').map((n) => (
              <InlineNotice key={n.id} notice={n} onAction={() => dismiss(n.id)} onDismiss={() => dismiss(n.id)} compact />
            ))}
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={file}
                type="file"
                accept="application/json,.json"
                className="hidden"
                aria-label={IMPORT.choose}
                onChange={(e) => {
                  const picked = e.target.files?.[0]
                  e.target.value = ''
                  if (picked) void picked.text().then(setText)
                }}
              />
              <Button variant="secondary" icon="import" onPress={() => file.current?.click()}>
                {IMPORT.choose}
              </Button>
              <Button variant="ghost" icon="copy" onPress={() => void copyTemplate()}>
                {IMPORT.copyTemplate}
              </Button>
            </div>
            <TextAreaField label={IMPORT.paste} value={text} onChange={setText} rows={8} description={IMPORT.pasteHint} />
            <SelectField
              label={IMPORT.defaultDomain}
              value={domainId ?? NO_DOMAIN}
              onChange={(v) => setDomainId(v === NO_DOMAIN ? null : v)}
              options={[
                { value: NO_DOMAIN, label: IMPORT.noDomain },
                ...(domains.data ?? []).map((d) => ({ value: d.id, label: d.name, description: d.code })),
              ]}
            />
            {refusal ? (
              <Text as="p" variant="studio-body" tone="danger">
                {refusal}
              </Text>
            ) : report ? (
              <ImportPreview report={report} />
            ) : (
              <Text as="p" variant="studio-caption" tone="muted">
                {IMPORT.empty}
              </Text>
            )}
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={close} isDisabled={pending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="primary" onPress={() => void commit()} isPending={pending} isDisabled={importable === 0 || !settled}>
              {IMPORT.submit(importable)}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}

/** The report, as the operator reads it before anything is written. */
function ImportPreview({ report }: { report: ImportReport }) {
  return (
    <div className="flex flex-col gap-2">
      <Text as="p" variant="studio-label">
        {IMPORT.summary(report.counts, report.newDomains.length)}
      </Text>
      {report.newDomains.length > 0 ? (
        <Text as="p" variant="studio-caption" tone="muted">
          {IMPORT.newDomains(report.newDomains.map((d) => d.name))}
        </Text>
      ) : null}
      <ol className="flex max-h-72 flex-col gap-1 overflow-y-auto rounded-[var(--radius)] border border-[var(--border)] p-2">
        {report.rows.map((row) => (
          <PreviewRow key={row.index} row={row} />
        ))}
      </ol>
    </div>
  )
}

function PreviewRow({ row }: { row: ImportRow }) {
  const tone = row.status === 'complete' ? 'success' : row.status === 'rejected' ? 'danger' : row.status === 'incomplete' ? 'warning' : 'muted'
  const status = row.status === 'rejected' && row.reason ? IMPORT.reason[row.reason] : IMPORT.status[row.status]
  return (
    <li className="flex flex-col gap-0.5 px-1 py-1" data-status={row.status}>
      <div className="flex items-baseline gap-2">
        <Text variant="studio-mono" tone="muted" className="w-8 shrink-0 text-right" tabular>
          {row.index}
        </Text>
        <Text variant="studio-body" truncate className="min-w-0 flex-1">
          {row.stem || '—'}
        </Text>
        {row.status === 'incomplete' ? <Icon name="warn" size="sm" style={{ color: 'var(--warning)' }} /> : null}
        <Text variant="studio-caption" tone={tone} className="shrink-0">
          {status}
        </Text>
      </div>
      {/* The gaps get their own line, so a long list never squeezes the question out of its row. */}
      {row.status === 'incomplete' ? (
        <Text as="div" variant="studio-caption" tone="muted" className="pl-10">
          {row.gaps.map((g) => QUESTION.gap[g]).join(' · ')}
        </Text>
      ) : null}
      {/* No domain is already a gap on the line above. */}
      {row.landing.length > 0 ? (
        <Text as="div" variant="studio-caption" tone="muted" className="pl-10">
          {IMPORT.landsIn(row.landing)}
        </Text>
      ) : null}
      {row.tags.length > 0 ? (
        <Text as="div" variant="studio-caption" tone="muted" className="pl-10">
          {IMPORT.tags(row.tags)}
        </Text>
      ) : null}
      {row.duplicateOf !== null || row.duplicateRow !== null ? (
        <Text as="div" variant="studio-caption" tone="muted" className="pl-10">
          {row.duplicateRow !== null ? IMPORT.duplicateRow(row.duplicateRow) : IMPORT.duplicateOf(row.duplicateOf ?? '')}
        </Text>
      ) : null}
      {row.ignored.map((i) => (
        <Text key={i.field} as="div" variant="studio-caption" tone="muted" className="pl-10">
          {IMPORT.ignored(i)}
        </Text>
      ))}
    </li>
  )
}
