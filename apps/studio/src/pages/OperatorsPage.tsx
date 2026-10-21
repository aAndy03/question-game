import { useMemo } from 'react'
import { Button, InitialsAvatar, MeaningChip } from '@/atoms'
import { ActionMenu, PageHeader } from '@/molecules'
import { LibraryList, ListToolbar, OperatorDetail, useActivateOperator, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useArchiveScope, useChromeStore, useListState, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { fmt, LIST, OPERATOR, TABS, VIEWS } from '@/copy'
import { operatorsSpec, type OperatorItem } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useCatalogList, useListHits, useSettings } from '@/host/queries'
import { isArchived } from '@/host/types'
import { useListView } from '@/host/useListView'

export interface OperatorsPageProps {
  currentId?: string | null | undefined
}

export function OperatorsPage({ currentId = null }: OperatorsPageProps) {
  const scope = useArchiveScope('operators')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  // Close goes back to the list without a step Back would reopen (review).
  const replace = useNavStore((s) => s.replace)
  const { activate, prompt } = useActivateOperator()
  const archive = useArchive()
  const settings = useSettings()
  const activeId = settings.data?.globals.active_operator_id ?? null
  const list = useCatalogList('operator', scope)
  const session = useListState('operators')
  const hits = useListHits('operator', session.search, scope, list.data?.length)

  const items = useMemo<ListItem<OperatorItem, RecordView>[] | undefined>(
    () =>
      list.data?.map((o) => ({
        id: o.id,
        data: { operator: o, active: o.id === activeId },
        view: {
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
        },
      })),
    [list.data, activeId],
  )
  const lv = useListView(operatorsSpec, items, hits)

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
          toolbar={<ListToolbar view={lv} what={OPERATOR.many} layout={view.operators} onLayout={(v) => setView('operators', v)} status={scope} onStatus={(v) => {
                setScope('operators', v)
                lv.resetPage()
              }} />}
        />
      }
      aside={currentId ? <OperatorDetail id={currentId} compact /> : null}
      onCloseAside={() => replace({ tab: 'operators' })}
    >
      <LibraryList
        view={lv}
        total={list.data?.length}
        scope={scope}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.operators}
        what={OPERATOR.many}
        columns={{ title: { sortId: 'name', label: VIEWS.name }, meta: [{ sortId: 'playsRun', label: VIEWS.playsRun }, { sortId: 'lastActive', label: VIEWS.lastActive }] }}
        emptyAction={
          !archivedView ? (
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
