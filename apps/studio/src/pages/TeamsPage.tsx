import { useMemo } from 'react'
import { Avatar, Button, MeaningChip } from '@/atoms'
import { ActionMenu, PageHeader } from '@/molecules'
import { LibraryList, ListToolbar, TeamDetail, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useArchiveScope, useChromeStore, useListState, usePrefs } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { fmt, LIST, TABS, TEAM, VIEWS } from '@/copy'
import { teamsSpec } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useCatalogList, useListHits } from '@/host/queries'
import { isArchived, type Team } from '@/host/types'
import { useListView } from '@/host/useListView'

export interface TeamsPageProps {
  /** The team open in the aside, when one is. */
  currentId?: string | null | undefined
}

export function TeamsPage({ currentId = null }: TeamsPageProps) {
  const scope = useArchiveScope('teams')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  const go = useNavStore((s) => s.go)
  const archive = useArchive()
  const list = useCatalogList('team', scope)
  const session = useListState('teams')
  const hits = useListHits('team', session.search, scope, list.data?.length)

  const items = useMemo<ListItem<Team, RecordView>[] | undefined>(
    () =>
      list.data?.map((t) => ({
        id: t.id,
        data: t,
        view: {
          id: t.id,
          title: t.name,
          subtitle: t.notes ?? undefined,
          leading: <Avatar mark={{ color: t.color, shortCode: t.shortCode, name: t.name }} size="sm" />,
          chips: isArchived(t) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null,
          meta: [fmt.count(t.playCount, TEAM.playOne, TEAM.playMany), fmt.dateShort(t.updatedAt)],
          isArchived: isArchived(t),
        },
      })),
    [list.data],
  )
  const lv = useListView(teamsSpec, items, hits)

  const archivedView = scope === 'archived'
  return (
    <LibraryTabLayout
      header={
        <PageHeader
          title={TABS.teams.label}
          description={TABS.teams.hint}
          primaryAction={
            <Button variant="primary" icon="add" onPress={() => void go({ tab: 'teams', mode: 'new' })}>
              {LIST.new(TEAM.one)}
            </Button>
          }
          toolbar={<ListToolbar view={lv} what={TEAM.many} layout={view.teams} onLayout={(v) => setView('teams', v)} status={scope} onStatus={(v) => setScope('teams', v)} />}
        />
      }
      aside={currentId ? <TeamDetail id={currentId} compact /> : null}
    >
      <LibraryList
        view={lv}
        total={list.data?.length}
        scope={scope}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.teams}
        what={TEAM.many}
        columns={{ title: { sortId: 'name', label: VIEWS.name }, meta: [{ sortId: 'plays', label: VIEWS.plays }, { sortId: 'changed', label: VIEWS.changed }] }}
        emptyAction={
          !archivedView ? (
            <Button variant="primary" icon="add" onPress={() => void go({ tab: 'teams', mode: 'new' })}>
              {LIST.new(TEAM.one)}
            </Button>
          ) : null
        }
        currentId={currentId}
        onOpen={(id) => void go({ tab: 'teams', id, mode: 'view' })}
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
              if (a === 'open') void go({ tab: 'teams', id: row.id, mode: 'view' })
              if (a === 'edit') void go({ tab: 'teams', id: row.id, mode: 'edit' })
              if (a === 'archive') archive.archive({ kind: 'team', ids: [row.id], what: TEAM.one })
              if (a === 'restore') void archive.restore({ kind: 'team', ids: [row.id], what: TEAM.one })
            }}
          />
        )}
        bulk={{
          onArchive: (ids) => archive.archive({ kind: 'team', ids, what: TEAM.many }),
          onRestore: (ids) => void archive.restore({ kind: 'team', ids, what: TEAM.many }),
          isPending: archive.isPending,
        }}
        onRetry={() => void list.refetch()}
      />
      {archive.dialog}
    </LibraryTabLayout>
  )
}
