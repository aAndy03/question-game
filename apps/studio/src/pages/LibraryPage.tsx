import { useCallback, useMemo, useState } from 'react'
import { Button, MeaningChip, Text } from '@/atoms'
import { ActionMenu, ArchiveToggle, IncompleteMark, PageHeader, QuestionFilter, SearchField, ViewSwitch, type ArchiveView } from '@/molecules'
import { DomainPane, ImportQuestionsDialog, LibraryList, QuestionDetail, useArchive, type RecordView } from '@/organisms'
import { SplitLayout } from '@/templates'
import { useArchiveScope, useChromeStore, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { DOMAIN, fmt, IMPORT, LIST, QUESTION, TABS } from '@/copy'
import { activeMemberIds, questionGaps } from '@/host/question'
import { useCatalogList, useSearch } from '@/host/queries'
import { answerMode, difficultyBand, isArchived } from '@/host/types'

export interface LibraryPageProps {
  domainId: string | null
  /** The question open in the aside. */
  currentId?: string | null | undefined
}

/**
 * Domains + Questions (spec §12): the domain pane on the left with its own
 * archive scope, the question list on the right filtered by the selected
 * domain, with *its* own archive scope — and All | Incomplete (§2.32), which
 * under *All questions* is also the only way to find a question in no domain.
 */
export function LibraryPage({ domainId, currentId = null }: LibraryPageProps) {
  const scope = useArchiveScope('library')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const libraryFilter = useChromeStore((s) => s.libraryFilter)
  const setLibraryFilter = useChromeStore((s) => s.setLibraryFilter)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const replace = useNavStore((s) => s.replace)
  const archive = useArchive()
  const [text, setText] = useState('')
  const [importing, setImporting] = useState(false)
  const onSearch = useCallback((t: string) => setText(t), [])

  const questions = useCatalogList('question', scope === 'archived' ? 'archived' : 'active')
  const domains = useCatalogList('domain', 'all')
  const domain = domains.data?.find((d) => d.id === domainId) ?? null
  const hits = useSearch(text ? { text, kinds: ['question'], scope: scope === 'archived' ? 'archived' : 'active', limit: 500 } : null)
  const hitIds = useMemo(() => (text && hits.data ? new Set(hits.data.map((h) => h.id)) : null), [text, hits.data])
  const memberIds = useMemo(() => (domain ? new Set(domain.questions.map((m) => m.questionId)) : null), [domain])
  const inActiveDomain = useMemo(() => activeMemberIds(domains.data ?? []), [domains.data])
  /** This view before the Incomplete filter: domain and search applied. */
  const scoped = useMemo(
    () => questions.data?.filter((q) => (!memberIds || memberIds.has(q.id)) && (!hitIds || hitIds.has(q.id))),
    [questions.data, memberIds, hitIds],
  )
  const gapsOf = useMemo(
    () => new Map((scoped ?? []).map((q) => [q.id, questionGaps(q, inActiveDomain.has(q.id))])),
    [scoped, inActiveDomain],
  )
  const incompleteCount = useMemo(() => [...gapsOf.values()].filter((g) => g.length > 0).length, [gapsOf])
  const incompleteOnly = libraryFilter === 'incomplete'

  const rows = useMemo<RecordView[] | undefined>(
    () =>
      scoped
        ?.filter((q) => !incompleteOnly || (gapsOf.get(q.id)?.length ?? 0) > 0)
        .map((q) => {
          const gaps = gapsOf.get(q.id) ?? []
          const band = q.difficulty === null ? null : difficultyBand(q.difficulty)
          const mode = answerMode(q)
          const inDomains = (domains.data ?? []).filter((d) => d.questions.some((m) => m.questionId === q.id)).length
          return {
            id: q.id,
            title: q.stem || QUESTION.noStem,
            subtitle: q.options.map((o) => o.text).join(' · '),
            leading: (
              <span className="flex w-14 items-center justify-end gap-1.5">
                <IncompleteMark gaps={gaps} />
                <Text variant="studio-mono" tone="muted" tabular>
                  {q.difficulty ?? '—'}
                </Text>
              </span>
            ),
            chips: (
              <>
                {band ? <MeaningChip meaning={band}>{QUESTION.band[band]}</MeaningChip> : null}
                {mode === 'multiple' ? <MeaningChip meaning="multiple">{QUESTION.multiple}</MeaningChip> : null}
                {isArchived(q) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
              </>
            ),
            meta: [domain ? '' : fmt.count(inDomains, DOMAIN.one, DOMAIN.many), fmt.dateShort(q.updatedAt)].filter(Boolean),
            isArchived: isArchived(q),
            sort: { difficulty: q.difficulty ?? 0, updated: q.updatedAt, created: q.createdAt },
          }
        }),
    [scoped, gapsOf, incompleteOnly, domains.data, domain],
  )

  const archivedView = scope === 'archived'
  const newRoute = { tab: 'library' as const, mode: 'new' as const, ...(domainId ? { domainId } : {}) }

  return (
    <SplitLayout
      header={
        <PageHeader
          title={TABS.library.label}
          description={TABS.library.hint}
          primaryAction={
            <Button variant="primary" icon="add" onPress={() => void go(newRoute)}>
              {LIST.new(QUESTION.one)}
            </Button>
          }
          secondaryActions={
            <Button variant="secondary" icon="import" onPress={() => setImporting(true)}>
              {IMPORT.open}
            </Button>
          }
        />
      }
      primary={<DomainPane selectedId={domainId} onSelect={(id) => replace({ tab: 'library', ...(id ? { domainId: id } : {}) })} />}
      secondary={
        <div className="flex min-h-0 flex-1 gap-6">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Text variant="studio-heading" className="mr-2">
                {domain ? domain.name : DOMAIN.all}
              </Text>
              <SearchField what={QUESTION.many} onSearch={onSearch} className="w-64" />
              <div className="flex-1" />
              <QuestionFilter value={libraryFilter} onChange={setLibraryFilter} incomplete={incompleteCount} />
              <ViewSwitch value={view.library} onChange={(v) => setView('library', v)} />
              <ArchiveToggle value={archivedView ? 'archived' : 'active'} onChange={(v: ArchiveView) => setScope('library', v)} />
            </div>
            <LibraryList
              rows={rows}
              isLoading={questions.isLoading}
              error={questions.error ? String(questions.error) : null}
              layout={view.library}
              what={QUESTION.many}
              sortBy="difficulty"
              emptyKind={text ? 'noResults' : archivedView ? 'archivedEmpty' : incompleteOnly ? 'allComplete' : 'empty'}
              emptyAction={
                !text && !archivedView && !incompleteOnly ? (
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <Button variant="primary" icon="add" onPress={() => void go(newRoute)}>
                      {LIST.new(QUESTION.one)}
                    </Button>
                    <Button variant="secondary" icon="import" onPress={() => setImporting(true)}>
                      {IMPORT.open}
                    </Button>
                  </div>
                ) : null
              }
              currentId={currentId}
              onOpen={(id) => void go({ tab: 'library', questionId: id, mode: 'view', ...(domainId ? { domainId } : {}) })}
              actions={(row) => (
                <ActionMenu
                  items={[
                    { id: 'open', label: LIST.open, icon: 'open' },
                    { id: 'edit', label: LIST.edit, icon: 'edit', isDisabled: row.isArchived },
                    row.isArchived
                      ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                      : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true },
                  ]}
                  onAction={(a) => {
                    const at = domainId ? { domainId } : {}
                    if (a === 'open') void go({ tab: 'library', questionId: row.id, mode: 'view', ...at })
                    if (a === 'edit') void go({ tab: 'library', questionId: row.id, mode: 'edit', ...at })
                    if (a === 'archive') archive.archive({ kind: 'question', ids: [row.id], what: QUESTION.one })
                    if (a === 'restore') void archive.restore({ kind: 'question', ids: [row.id], what: QUESTION.one })
                  }}
                />
              )}
              bulk={{
                mode: archivedView ? 'restore' : 'archive',
                onArchive: (ids) => archive.archive({ kind: 'question', ids, what: QUESTION.many }),
                onRestore: (ids) => void archive.restore({ kind: 'question', ids, what: QUESTION.many }),
                isPending: archive.isPending,
              }}
              onRetry={() => void questions.refetch()}
            />
          </div>
          {currentId ? (
            <aside className="hidden w-[22rem] shrink-0 overflow-y-auto xl:block">
              <QuestionDetail id={currentId} domainId={domainId ?? undefined} compact />
            </aside>
          ) : null}
          {archive.dialog}
          <ImportQuestionsDialog
            isOpen={importing}
            onOpenChange={setImporting}
            defaultDomainId={domain && domain.archivedAt === null ? domain.id : null}
          />
        </div>
      }
    />
  )
}
