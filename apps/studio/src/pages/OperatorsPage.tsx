import { useCallback, useMemo, useState } from 'react'
import { Button, InitialsAvatar, MeaningChip } from '@/atoms'
import { ActionMenu, ArchiveToggle, PageHeader, SearchField, ViewSwitch, type ArchiveView } from '@/molecules'
import { LibraryList, OperatorDetail, useActivateOperator, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useArchiveScope, useChromeStore, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { fmt, LIST, OPERATOR, TABS } from '@/copy'
import { useCatalogList, useSearch, useSettings } from '@/host/queries'
import { isArchived } from '@/host/types'

export interface OperatorsPageProps {
  currentId?: string | null | undefined
}

export function OperatorsPage({ currentId = null }: OperatorsPageProps) {
  const scope = useArchiveScope('operators')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const { activate, prompt } = useActivateOperator()
  const archive = useArchive()
  const settings = useSettings()
  const activeId = settings.data?.globals.active_operator_id ?? null
  const [text, setText] = useState('')
  const onSearch = useCallback((t: string) => setText(t), [])

  const list = useCatalogList('operator', scope === 'archived' ? 'archived' : 'active')
  const hits = useSearch(text ? { text, kinds: ['operator'], scope: scope === 'archived' ? 'archived' : 'active', limit: 200 } : null)
  const hitIds = useMemo(() => (text && hits.data ? new Set(hits.data.map((h) => h.id)) : null), [text, hits.data])

  const rows = useMemo<RecordView[] | undefined>(
    () =>
      list.data
        ?.filter((o) => !hitIds || hitIds.has(o.id))
        .map((o) => ({
          id: o.id,
          title: o.displayName,
          leading: <InitialsAvatar name={o.displayName} size="sm" tone={o.id === activeId ? 'accent' : 'default'} />,
          chips: (
            <>
              {o.id === activeId ? <MeaningChip meaning="active">{OPERATOR.active}</MeaningChip> : null}
              {o.pinHash ? <MeaningChip meaning="pinned">{OPERATOR.pinned}</MeaningChip> : null}
              {isArchived(o) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
            </>
          ),
          meta: [fmt.count(o.playsRun, OPERATOR.runOne, OPERATOR.runMany), fmt.dateShort(o.lastActiveAt)],
          isArchived: isArchived(o),
          sort: { updated: o.updatedAt, created: o.createdAt },
        })),
    [list.data, hitIds, activeId],
  )

  const makeActive = (id: string) => {
    const target = list.data?.find((o) => o.id === id)
    if (target) activate(target)
  }

  const archivedView = scope === 'archived'
  return (
    <LibraryTabLayout
      header={
        <PageHeader
          title={TABS.operators.label}
          description={TABS.operators.hint}
          primaryAction={
            <Button variant="primary" icon="add" onPress={() => void go({ tab: 'operators', mode: 'new' })}>
              {LIST.new(OPERATOR.one)}
            </Button>
          }
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <SearchField what={OPERATOR.many} onSearch={onSearch} />
              <div className="flex-1" />
              <ViewSwitch value={view.operators} onChange={(v) => setView('operators', v)} />
              <ArchiveToggle value={archivedView ? 'archived' : 'active'} onChange={(v: ArchiveView) => setScope('operators', v)} />
            </div>
          }
        />
      }
      aside={currentId ? <OperatorDetail id={currentId} compact /> : null}
    >
      <LibraryList
        rows={rows}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.operators}
        what={OPERATOR.many}
        emptyKind={text ? 'noResults' : archivedView ? 'archivedEmpty' : 'empty'}
        emptyAction={
          !text && !archivedView ? (
            <Button variant="primary" icon="add" onPress={() => void go({ tab: 'operators', mode: 'new' })}>
              {LIST.new(OPERATOR.one)}
            </Button>
          ) : null
        }
        currentId={currentId}
        onOpen={(id) => void go({ tab: 'operators', id, mode: 'view' })}
        actions={(row) => (
          <ActionMenu
            items={[
              { id: 'open', label: LIST.open, icon: 'open' },
              { id: 'edit', label: LIST.edit, icon: 'edit', isDisabled: row.isArchived },
              { id: 'activate', label: OPERATOR.makeActive, icon: 'check', isDisabled: row.isArchived || row.id === activeId },
              row.isArchived
                ? { id: 'restore', label: LIST.restore, icon: 'restore' }
                : { id: 'archive', label: LIST.archive, icon: 'archive', isDanger: true, isDisabled: row.id === activeId },
            ]}
            onAction={(a) => {
              if (a === 'open') void go({ tab: 'operators', id: row.id, mode: 'view' })
              if (a === 'edit') void go({ tab: 'operators', id: row.id, mode: 'edit' })
              if (a === 'activate') makeActive(row.id)
              if (a === 'archive') archive.archive({ kind: 'operator', ids: [row.id], what: OPERATOR.one })
              if (a === 'restore') void archive.restore({ kind: 'operator', ids: [row.id], what: OPERATOR.one })
            }}
          />
        )}
        onRetry={() => void list.refetch()}
      />
      {archive.dialog}
      {prompt}
    </LibraryTabLayout>
  )
}
