import { useEffect, useMemo, useState } from 'react'
import { Button, MeaningChip, Text } from '@/atoms'
import { ActionMenu, IncompleteMark, PageHeader } from '@/molecules'
import { DomainPane, ImportQuestionsDialog, LibraryList, ListToolbar, QuestionDetail, useArchive, useTransfer, useBulkEdit, GroupsDialog, ManageTagsDialog, useGroupEditing, type RecordView } from '@/organisms'
import { DetailAside, SplitLayout } from '@/templates'
import { useArchiveScope, useChromeStore, useListState, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { toast } from '@/chrome/toast'
import { DOMAIN, IMPORT, LIST, QUESTION, SHELL, TABS, VIEWS, fmt } from '@/copy'
import { TRANSFER } from '@/copy/workspaces'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { activeMemberIds, questionGaps } from '@/host/question'
import { questionsSpec, type QuestionItem } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useCatalogList, useListHits, useTags } from '@/host/queries'
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
  // *Duplicate* here (beta.5): the same text, in the same domains and domain groups.
  const duplicate = async (ids: readonly string[]) => {
    if (await run.ok('catalog_duplicate', { kind: 'question', ids })) toast.success(SHELL.duplicated(ids.length, QUESTION.one, QUESTION.many))
  }
  const bulkEdit = useBulkEdit()
  const [groupsOpen, setGroupsOpen] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const run = useHostCommand()
  const [importing, setImporting] = useState(false)

  const questions = useCatalogList('question', scope)
  const tagList = useTags()
  const domains = useCatalogList('domain', 'all')
  const domain = domains.data?.find((d) => d.id === domainId) ?? null
  const groupEditing = useGroupEditing(domain && domain.archivedAt === null ? domain : null)
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
                {(q.tags ?? []).slice(0, 3).map((t) => (
                  <MeaningChip key={t} meaning="tag">{t}</MeaningChip>
                ))}
                {(q.tags?.length ?? 0) > 3 ? <MeaningChip meaning="tag">{`+${(q.tags?.length ?? 0) - 3}`}</MeaningChip> : null}
                {isArchived(q) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
              </>
            ),
            meta: [domain ? '' : fmt.count(inDomains, DOMAIN.one, DOMAIN.many), fmt.dateShort(q.updatedAt)].filter(Boolean),
            isArchived: isArchived(q),
          }
          const member = domain?.questions.find((m) => m.questionId === q.id)
          const group = member?.groupId ? (domain?.groups ?? []).find((g) => g.id === member.groupId) : undefined
          return { id: q.id, data: { question: q, gaps, domains: domainsOf.get(q.id) ?? [], group: group ? { id: group.id, name: group.name } : null }, view: record }
        }),
    [scoped, inActiveDomain, domainsOf, domain],
  )
  const spec = useMemo(
    () =>
      questionsSpec({
        allQuestions: domainId === null,
        domains: activeDomains.map((d) => ({ id: d.id, name: d.name })),
        groups: (domain?.groups ?? []).map((g) => ({ id: g.id, name: g.name })),
        tags: (tagList.data ?? []).map((t) => t.tag),
      }),
    [domainId, activeDomains, domain?.groups, tagList.data],
  )
  const lv = useListView(spec, items, hits)
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
  // The Groups dialog belongs to the domain it opened on: it closes when that domain goes.
  if (groupsOpen && !(domain && domain.archivedAt === null)) setGroupsOpen(false)
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
            <>
            {domain && domain.archivedAt === null ? (
              <Button variant="secondary" icon="folder" onPress={() => setGroupsOpen(true)}>
                {GROUPS_TAGS.groupsButton}
              </Button>
            ) : null}
            <Button variant="secondary" icon="tag" onPress={() => setTagsOpen(true)}>
              {GROUPS_TAGS.manageButton}
            </Button>
            <Button variant="secondary" icon="import" onPress={() => setImporting(true)}>
              {IMPORT.open}
            </Button>
            </>
          }
        />
      }
      primary={<DomainPane selectedId={domainId} onSelect={(id) => replace({ tab: 'library', ...(id ? { domainId: id } : {}) })} />}
      secondary={
        <div className="relative flex min-h-0 flex-1 gap-6">
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
                    { id: 'duplicate', label: LIST.duplicate, icon: 'duplicate' },
                    { id: 'copy', label: TRANSFER.copyTo, icon: 'copy' },
                    { id: 'move', label: TRANSFER.moveTo, icon: 'transfer' },
                    ...(questions.data?.find((q) => q.id === row.id)?.familyId != null ? [{ id: 'unfollow', label: TRANSFER.unfollow, icon: 'unlink' as const }] : []),
                    row.isArchived
                      ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                      : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true },
                  ]}
                  onAction={(a) => {
                    if (a === 'copy' || a === 'move') transfer.open(a, { questions: [row.id] })
                    if (a === 'duplicate') void duplicate([row.id])
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
                  const picked = (questions.data ?? []).filter((q) => ids.includes(q.id))
                  return (
                    <>
                      {archivedView ? null : bulkEdit.menu(ids, { domain: domain && domain.archivedAt === null ? domain : null, questions: picked })}
                      <Button size="sm" variant="secondary" icon="duplicate" onPress={() => void duplicate(ids)}>
                        {LIST.duplicate}
                      </Button>
                      {transfer.menu({ questions: ids })}
                    </>
                  )
                },
                isPending: archive.isPending,
              }}
              onRetry={() => void questions.refetch()}
              headerActions={(key) => {
                // A domain group's header: Rename and Delete, as in the Groups dialog.
                const g = key.startsWith('g:') && domain && domain.archivedAt === null ? (domain.groups ?? []).find((x) => `g:${x.id}` === key) : undefined
                if (!g) return null
                return (
                  <ActionMenu
                    label={`${GROUPS_TAGS.group}: ${g.name}`}
                    items={[
                      { id: 'rename', label: GROUPS_TAGS.rename },
                      { id: 'delete', label: GROUPS_TAGS.deleteGroup, isDanger: true },
                    ]}
                    onAction={(a) => (a === 'rename' ? groupEditing.rename(g) : groupEditing.remove(g))}
                  />
                )
              }}
            />
          </div>
          {currentId ? (
            <DetailAside onClose={() => replace({ tab: 'library', ...(domainId ? { domainId } : {}) })}>
              <QuestionDetail id={currentId} domainId={domainId ?? undefined} compact />
            </DetailAside>
          ) : null}
          {archive.dialog}
          {transfer.dialog}
          {bulkEdit.dialog}
          <GroupsDialog domain={groupsOpen ? domain : null} onClose={() => setGroupsOpen(false)} />
          {groupEditing.dialogs}
          <ManageTagsDialog isOpen={tagsOpen} onClose={() => setTagsOpen(false)} />
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
