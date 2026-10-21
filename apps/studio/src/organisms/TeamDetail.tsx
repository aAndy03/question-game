import { Avatar, Button, MeaningChip, Panel, Skeleton, Text } from '@/atoms'
import { EmptyState, MetaList, NavCrumbs, PageHeader, StatCard } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { LIST, SHELL, TABS, TEAM, fmt } from '@/copy'
import { useCatalogItem } from '@/host/queries'
import { isArchived } from '@/host/types'
import { useArchive } from './useArchive'
import { CopiesBlock } from './CopiesBlock'

export interface TeamDetailProps {
  id: string
  /** Rendered inside the list's aside rather than as a page. */
  compact?: boolean | undefined
}

/** The read view: mark, metadata, plays, archive/restore. */
export function TeamDetail({ id, compact }: TeamDetailProps) {
  const team = useCatalogItem('team', id)
  const go = useNavStore((s) => s.go)
  const archive = useArchive()

  if (team.isLoading) return <Skeleton shape="card" count={2} />
  if (!team.data) return <EmptyState kind="error" what={TEAM.many} detail={team.error?.message} compact />
  const t = team.data
  const archived = isArchived(t)

  const actions = (
    <>
      {archived ? (
        <Button variant="secondary" icon="restore" onPress={() => void archive.restore({ kind: 'team', ids: [t.id], what: TEAM.one })} isPending={archive.isPending}>
          {LIST.restore}
        </Button>
      ) : (
        <Button variant="ghost" icon="archive" onPress={() => archive.archive({ kind: 'team', ids: [t.id], what: TEAM.one })}>
          {LIST.archive}
        </Button>
      )}
    </>
  )

  const header = compact ? (
    <div className="flex items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <Avatar mark={{ color: t.color, shortCode: t.shortCode, name: t.name }} size="lg" />
        <div className="flex min-w-0 flex-col">
          <Text variant="studio-heading" truncate>
            {t.name}
          </Text>
          <Text variant="studio-mono" tone="muted">
            {t.shortCode}
          </Text>
        </div>
      </div>
      <Button size="sm" variant="secondary" icon="edit" onPress={() => void go({ tab: 'teams', id: t.id, mode: 'edit' })} isDisabled={archived}>
        {LIST.edit}
      </Button>
    </div>
  ) : (
    <PageHeader
      title={t.name}
      status={archived ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
      crumbs={<NavCrumbs crumbs={[{ label: TABS.teams.label, onPress: () => void go({ tab: 'teams' }) }, { label: t.name }]} />}
      primaryAction={
        <Button variant="primary" icon="edit" onPress={() => void go({ tab: 'teams', id: t.id, mode: 'edit' })} isDisabled={archived} disabledReason={archived ? LIST.archived : null}>
          {LIST.edit}
        </Button>
      }
      secondaryActions={actions}
    />
  )

  return (
    <div className="flex flex-col gap-6">
      {header}
      {compact ? null : (
        <div className="flex items-center gap-4">
          <Avatar mark={{ color: t.color, shortCode: t.shortCode, name: t.name }} size="lg" />
          <Text variant="studio-mono" tone="muted">
            {t.color}
          </Text>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <StatCard value={t.playCount} label={TEAM.playCount} />
        <StatCard value={fmt.dateShort(t.lastPlayAt)} label={TEAM.lastPlay} />
      </div>
      <Panel>
        <MetaList
          columns={compact ? 1 : 2}
          items={[
            { label: TEAM.shortCode, value: t.shortCode, mono: true },
            { label: TEAM.color, value: t.color, mono: true },
            { label: TEAM.notes, value: t.notes ?? '—' },
            { label: LIST.updated, value: fmt.date(t.updatedAt) },
            { label: LIST.created, value: fmt.date(t.createdAt) },
            { label: SHELL.id, value: t.id, mono: true },
          ]}
        />
      </Panel>
      <CopiesBlock kind="team" id={t.id} />
      {compact ? <div className="flex justify-end">{actions}</div> : null}
      {archive.dialog}
    </div>
  )
}
