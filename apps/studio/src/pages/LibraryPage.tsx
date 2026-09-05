import { useCallback, useMemo, useState } from 'react'
import { Button, MeaningChip, Text } from '@/atoms'
import { ActionMenu, ArchiveToggle, PageHeader, SearchField, ViewSwitch, type ArchiveView } from '@/molecules'
import { DomainPane, LibraryList, QuestionDetail, useArchive, type RecordView } from '@/organisms'
import { SplitLayout } from '@/templates'
import { useArchiveScope, useChromeStore, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { DOMAIN, fmt, LIST, QUESTION, TABS } from '@/copy'
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
 * domain, with *its* own archive scope.
 */
export function LibraryPage({ domainId, currentId = null }: LibraryPageProps) {
  const scope = useArchiveScope('library')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const replace = useNavStore((s) => s.replace)
  const archive = useArchive()
  const [text, setText] = useState('')
  const onSearch = useCallback((t: string) => setText(t), [])

  const questions = useCatalogList('question', scope === 'archived' ? 'archived' : 'active')
  const domains = useCatalogList('domain', 'all')
  const domain = domains.data?.find((d) => d.id === domainId) ?? null
  const hits = useSearch(text ? { text, kinds: ['question'], scope: scope === 'archived' ? 'archived' : 'active', limit: 500 } : null)
  const hitIds = useMemo(() => (text && hits.data ? new Set(hits.data.map((h) => h.id)) : null), [text, hits.data])
  const memberIds = useMemo(() => (domain ? new Set(domain.questions.map((m) => m.questionId)) : null), [domain])

  const rows = useMemo<RecordView[] | undefined>(
    () =>
      questions.data
        ?.filter((q) => (!memberIds || memberIds.has(q.id)) && (!hitIds || hitIds.has(q.id)))
        .map((q) => {
          const band = difficultyBand(q.difficulty)
          const mode = answerMode(q)
          const inDomains = (domains.data ?? []).filter((d) => d.questions.some((m) => m.questionId === q.id)).length
          return {
            id: q.id,
            title: q.stem,
            subtitle: q.options.map((o) => o.text).join(' · '),
            leading: (
              <Text variant="studio-mono" tone="muted" className="w-8 text-right" tabular>
                {q.difficulty}
              </Text>
            ),
            chips: (
              <>
                <MeaningChip meaning={band}>{QUESTION.band[band]}</MeaningChip>
                {mode === 'multiple' ? <MeaningChip meaning="multiple">{QUESTION.multiple}</MeaningChip> : null}
                {isArchived(q) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
              </>
            ),
            meta: [domain ? '' : fmt.count(inDomains, DOMAIN.one, DOMAIN.many), fmt.dateShort(q.updatedAt)].filter(Boolean),
            isArchived: isArchived(q),
            sort: { difficulty: q.difficulty, updated: q.updatedAt, created: q.createdAt },
          }
        }),
    [questions.data, memberIds, hitIds, domains.data, domain],
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
              emptyKind={text ? 'noResults' : archivedView ? 'archivedEmpty' : 'empty'}
              emptyAction={
                !text && !archivedView ? (
                  <Button variant="primary" icon="add" onPress={() => void go(newRoute)}>
                    {LIST.new(QUESTION.one)}
                  </Button>
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
        </div>
      }
    />
  )
}
