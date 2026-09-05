import { useCallback, useMemo, useState } from 'react'
import { Avatar, Button, MeaningChip } from '@/atoms'
import { ActionMenu, ArchiveToggle, PageHeader, SearchField, ViewSwitch, type ArchiveView } from '@/molecules'
import { LibraryList, TeamDetail, useArchive, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { useChromeStore, usePrefs, useArchiveScope } from '@/chrome/chrome'
import { useNavStore } from '@/chrome/nav'
import { fmt, LIST, TABS, TEAM } from '@/copy'
import { useCatalogList, useSearch } from '@/host/queries'
import { isArchived } from '@/host/types'

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
  const [text, setText] = useState('')
  const onSearch = useCallback((t: string) => setText(t), [])

  const list = useCatalogList('team', scope === 'archived' ? 'archived' : 'active')
  const hits = useSearch(text ? { text, kinds: ['team'], scope: scope === 'archived' ? 'archived' : 'active', limit: 200 } : null)
  const hitIds = useMemo(() => (text && hits.data ? new Set(hits.data.map((h) => h.id)) : null), [text, hits.data])

  const rows = useMemo<RecordView[] | undefined>(
    () =>
      list.data
        ?.filter((t) => !hitIds || hitIds.has(t.id))
        .map((t) => ({
          id: t.id,
          title: t.name,
          subtitle: t.notes ?? undefined,
          leading: <Avatar mark={{ color: t.color, shortCode: t.shortCode, name: t.name }} size="sm" />,
          chips: isArchived(t) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null,
          meta: [fmt.count(t.playCount, TEAM.playOne, TEAM.playMany), fmt.dateShort(t.updatedAt)],
          isArchived: isArchived(t),
          sort: { updated: t.updatedAt, created: t.createdAt },
        })),
    [list.data, hitIds],
  )

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
          toolbar={
            <div className="flex flex-wrap items-center gap-2">
              <SearchField what={TEAM.many} onSearch={onSearch} />
              <div className="flex-1" />
              <ViewSwitch value={view.teams} onChange={(v) => setView('teams', v)} />
              <ArchiveToggle value={archivedView ? 'archived' : 'active'} onChange={(v: ArchiveView) => setScope('teams', v)} />
            </div>
          }
        />
      }
      aside={currentId ? <TeamDetail id={currentId} compact /> : null}
    >
      <LibraryList
        rows={rows}
        isLoading={list.isLoading}
        error={list.error ? String(list.error) : null}
        layout={view.teams}
        what={TEAM.many}
        emptyKind={text ? 'noResults' : archivedView ? 'archivedEmpty' : 'empty'}
        emptyAction={
          !text && !archivedView ? (
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
          mode: archivedView ? 'restore' : 'archive',
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
