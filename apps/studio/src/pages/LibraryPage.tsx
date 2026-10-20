import { useEffect, useMemo, useState } from 'react'
import { Button, MeaningChip, Text } from '@/atoms'
import { ActionMenu, IncompleteMark, PageHeader } from '@/molecules'
import { DomainPane, ImportQuestionsDialog, LibraryList, ListToolbar, QuestionDetail, useArchive, useTransfer, type RecordView } from '@/organisms'
import { SplitLayout } from '@/templates'
import { useArchiveScope, useChromeStore, useListState, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { DOMAIN, fmt, IMPORT, LIST, QUESTION, TABS, VIEWS } from '@/copy'
import { TRANSFER } from '@/copy/workspaces'
import { activeMemberIds, questionGaps } from '@/host/question'
import { questionsSpec, type QuestionItem } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useCatalogList, useListHits } from '@/host/queries'
import { answerMode, difficultyBand, isArchived } from '@/host/types'
import { useListView } from '@/host/useListView'
import { useHostCommand } from '@/host/commands'

export interface LibraryPageProps {
  domainId: string | null
  /** The question open in the aside. */
  currentId?: string | null | undefined
}

/**
 * Domains + Questions (spec §12): the domain pane on the left with its own
 * archive scope, the question list on the right filtered by the selected
 * domain, with *its* own archive scope — and the list view's filters, sort,
 * headers and pages (stable 1.1). The Completeness filter replaced the old
 * All | Incomplete tabs (§2.32): under *All questions* it is still the way to
 * find a question in no domain.
 */
export function LibraryPage({ domainId, currentId = null }: LibraryPageProps) {
  const scope = useArchiveScope('library')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const replace = useNavStore((s) => s.replace)
  const archive = useArchive()
  const transfer = useTransfer()
  const run = useHostCommand()
  const [importing, setImporting] = useState(false)

  const questions = useCatalogList('question', scope)
  const domains = useCatalogList('domain', 'all')
  const domain = domains.data?.find((d) => d.id === domainId) ?? null
  const memberIds = useMemo(() => (domain ? new Set(domain.questions.map((m) => m.questionId)) : null), [domain])
  const inActiveDomain = useMemo(() => activeMemberIds(domains.data ?? []), [domains.data])
  const activeDomains = useMemo(() => (domains.data ?? []).filter((d) => d.archivedAt === null), [domains.data])
  /** Each question's active domains, once — the list view groups and filters by them. */
  const domainsOf = useMemo(() => {
    const out = new Map<string, { id: string; name: string }[]>()
    for (const d of activeDomains) for (const m of d.questions) {
      const list = out.get(m.questionId) ?? []
      list.push({ id: d.id, name: d.name })
      out.set(m.questionId, list)
    }
    return out
  }, [activeDomains])
  /** The domain pane's pick scopes the list before anything else does. */
  const scoped = useMemo(() => questions.data?.filter((q) => !memberIds || memberIds.has(q.id)), [questions.data, memberIds])
  const session = useListState('library')
  const hits = useListHits('question', session.search, scope, questions.data?.length)

  const items = useMemo<ListItem<QuestionItem, RecordView>[] | undefined>(
    () =>
      scoped?.map((q) => {
          const gaps = questionGaps(q, inActiveDomain.has(q.id))
          const band = q.difficulty === null ? null : difficultyBand(q.difficulty)
          const mode = answerMode(q)
          // Active domains, as the list groups and sorts them — and one lookup, not a scan per question.
          const inDomains = domainsOf.get(q.id)?.length ?? 0
          const record: RecordView = {
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
                {q.shared ? <MeaningChip meaning="shared">{TRANSFER.whereShared}</MeaningChip> : null}
                {isArchived(q) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
              </>
            ),
            meta: [domain ? '' : fmt.count(inDomains, DOMAIN.one, DOMAIN.many), fmt.dateShort(q.updatedAt)].filter(Boolean),
            isArchived: isArchived(q),
          }
          return { id: q.id, data: { question: q, gaps, domains: domainsOf.get(q.id) ?? [] }, view: record }
        }),
    [scoped, inActiveDomain, domainsOf, domain],
  )
  const spec = useMemo(
    () => questionsSpec({ allQuestions: domainId === null, domains: activeDomains.map((d) => ({ id: d.id, name: d.name })) }),
    [domainId, activeDomains],
  )
  const lv = useListView(spec, items, hits)
  const sharedQ = (id: string) => questions.data?.find((q) => q.id === id)?.shared === true
  const incompleteCount = useMemo(() => (items ?? []).filter((i) => i.data.gaps.length > 0).length, [items])
  // Picking a domain in the pane is the domain scope: the Domain filter is not
  // offered there, so its values go rather than linger as a hidden chip.
  const { setFilter, resetPage } = lv
  const domainFilterOn = Array.isArray(session.filters.domain) && session.filters.domain.length > 0
  useEffect(() => {
    if (domainId !== null && domainFilterOn) setFilter('domain', null)
  }, [domainId, domainFilterOn, setFilter])
  // Another domain is another list: start at its top.
  const [shownDomain, setShownDomain] = useState(domainId)
  if (shownDomain !== domainId) {
    setShownDomain(domainId)
    resetPage()
  }

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
            <ListToolbar
              view={lv}
              what={QUESTION.many}
              layout={view.library}
              onLayout={(v) => setView('library', v)}
              status={scope}
              onStatus={(v) => {
                setScope('library', v)
                lv.resetPage()
              }}
              filterHint={incompleteCount > 0 ? VIEWS.incompleteHint(incompleteCount) : undefined}
              lead={
                <Text variant="studio-heading" className="mr-2">
                  {domain ? domain.name : DOMAIN.all}
                </Text>
              }
            />
            <LibraryList
              view={lv}
              total={scoped?.length}
              scope={scope}
              isLoading={questions.isLoading}
              error={questions.error ? String(questions.error) : null}
              layout={view.library}
              what={QUESTION.many}
              allCompleteWhen={{ id: 'completeness', value: 'incomplete' }}
              columns={{
                title: { sortId: 'text', label: VIEWS.text },
                lead: 'w-14',
                meta: domain ? [{ sortId: 'changed', label: VIEWS.changed }] : [{ sortId: 'domains', label: VIEWS.domains }, { sortId: 'changed', label: VIEWS.changed }],
              }}
              emptyAction={
                !archivedView ? (
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
                    { id: 'copy', label: TRANSFER.copyTo, icon: 'copy' },
                    { id: 'move', label: TRANSFER.moveTo, icon: 'transfer', isDisabled: sharedQ(row.id) },
                    sharedQ(row.id) ? { id: 'make_local', label: TRANSFER.makeLocal, icon: 'shared' } : { id: 'make_shared', label: TRANSFER.makeShared, icon: 'shared' },
                    ...(questions.data?.find((q) => q.id === row.id)?.familyId != null ? [{ id: 'unfollow', label: TRANSFER.unfollow, icon: 'unlink' as const }] : []),
                    row.isArchived
                      ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                      : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true },
                  ]}
                  onAction={(a) => {
                    if (a === 'copy' || a === 'move' || a === 'make_shared' || a === 'make_local') transfer.open(a, { questions: [row.id] })
                    if (a === 'unfollow') void run.ok('catalog_unfollow', { kind: 'question', id: row.id })
                    const at = domainId ? { domainId } : {}
                    if (a === 'open') void go({ tab: 'library', questionId: row.id, mode: 'view', ...at })
                    if (a === 'edit') void go({ tab: 'library', questionId: row.id, mode: 'edit', ...at })
                    if (a === 'archive') archive.archive({ kind: 'question', ids: [row.id], what: QUESTION.one })
                    if (a === 'restore') void archive.restore({ kind: 'question', ids: [row.id], what: QUESTION.one })
                  }}
                />
              )}
              bulk={{
                onArchive: (ids) => archive.archive({ kind: 'question', ids, what: QUESTION.many }),
                onRestore: (ids) => void archive.restore({ kind: 'question', ids, what: QUESTION.many }),
                extra: (ids) => {
                  const flags = new Set(ids.map(sharedQ))
                  return transfer.menu({ questions: ids }, { shared: flags.size === 1 ? [...flags][0] : undefined })
                },
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
          {transfer.dialog}
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
