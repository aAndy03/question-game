import { Button, InitialsAvatar, MeaningChip, Panel, Skeleton, Text } from '@/atoms'
import { EmptyState, MetaList, NavCrumbs, PageHeader, StatCard } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { LIST, OPERATOR, SHELL, TABS, fmt } from '@/copy'
import { useCatalogItem, useSettings } from '@/host/queries'
import { isArchived } from '@/host/types'
import { useActivateOperator } from './useActivateOperator'
import { useArchive } from './useArchive'

export interface OperatorDetailProps {
  id: string
  compact?: boolean | undefined
}

/** Read view with Make active (host truth: `operator.active`). */
export function OperatorDetail({ id, compact }: OperatorDetailProps) {
  const op = useCatalogItem('operator', id)
  const settings = useSettings()
  const go = useNavStore((s) => s.go)
  const { activate, prompt } = useActivateOperator()
  const archive = useArchive()

  if (op.isLoading) return <Skeleton shape="card" count={2} />
  if (!op.data) return <EmptyState kind="error" what={OPERATOR.many} detail={op.error?.message} compact />
  const o = op.data
  const archived = isArchived(o)
  const active = settings.data?.globals.active_operator_id === o.id

  const makeActive = () => activate(o)

  const actions = (
    <>
      {active ? null : (
        <Button variant="secondary" icon="check" onPress={makeActive} isDisabled={archived} disabledReason={archived ? LIST.archived : null}>
          {OPERATOR.makeActive}
        </Button>
      )}
      {archived ? (
        <Button variant="secondary" icon="restore" onPress={() => void archive.restore({ kind: 'operator', ids: [o.id], what: OPERATOR.one })}>
          {LIST.restore}
        </Button>
      ) : (
        <Button
          variant="ghost"
          icon="archive"
          onPress={() => archive.archive({ kind: 'operator', ids: [o.id], what: OPERATOR.one })}
          isDisabled={active}
          disabledReason={active ? OPERATOR.active : null}
        >
          {LIST.archive}
        </Button>
      )}
    </>
  )

  const status = (
    <span className="flex items-center gap-1.5">
      {active ? <MeaningChip meaning="active">{OPERATOR.active}</MeaningChip> : null}
      {o.pinHash ? <MeaningChip meaning="pinned">{OPERATOR.pinned}</MeaningChip> : null}
      {archived ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
    </span>
  )

  return (
    <div className="flex flex-col gap-6">
      {compact ? (
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <InitialsAvatar name={o.displayName} size="lg" tone={active ? 'accent' : 'default'} />
            <div className="flex min-w-0 flex-col gap-1">
              <Text variant="studio-heading" truncate>
                {o.displayName}
              </Text>
              {status}
            </div>
          </div>
          <Button size="sm" variant="secondary" icon="edit" onPress={() => void go({ tab: 'operators', id: o.id, mode: 'edit' })} isDisabled={archived}>
            {LIST.edit}
          </Button>
        </div>
      ) : (
        <PageHeader
          title={o.displayName}
          status={status}
          crumbs={<NavCrumbs crumbs={[{ label: TABS.operators.label, onPress: () => void go({ tab: 'operators' }) }, { label: o.displayName }]} />}
          primaryAction={
            <Button variant="primary" icon="edit" onPress={() => void go({ tab: 'operators', id: o.id, mode: 'edit' })} isDisabled={archived}>
              {LIST.edit}
            </Button>
          }
          secondaryActions={actions}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <StatCard value={o.playsRun} label={OPERATOR.playsRun} />
        <StatCard value={fmt.dateShort(o.lastActiveAt)} label={OPERATOR.lastActive} />
      </div>
      <Panel>
        <MetaList
          columns={compact ? 1 : 2}
          items={[
            { label: OPERATOR.pinned, value: o.pinHash ? OPERATOR.pinned : OPERATOR.notPinned },
            { label: LIST.updated, value: fmt.date(o.updatedAt) },
            { label: LIST.created, value: fmt.date(o.createdAt) },
            { label: SHELL.id, value: o.id, mono: true },
          ]}
        />
      </Panel>
      {compact ? <div className="flex flex-wrap justify-end gap-2">{actions}</div> : null}
      {archive.dialog}
      {prompt}
    </div>
  )
}
