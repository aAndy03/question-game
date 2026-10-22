import { useMemo, useState, type ReactNode } from 'react'
import { Button, IconButton, MeaningChip, SelectField, Text } from '@/atoms'
import { ConfirmDialog, EmptyState, ManagerDialog, MemberList, NameDialog, PaneList } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { LIST, QUESTION } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { useCatalogList } from '@/host/queries'
import { difficultyBand, isArchived, type Domain, type DomainGroup, type Question } from '@/host/types'

export interface GroupEditing {
  rename(group: DomainGroup | null): void
  remove(group: DomainGroup): void
  /** The name and confirm dialogs, stacked over whatever opened them. */
  dialogs: ReactNode
}

/**
 * Rename · New domain group · Delete for one domain — the manager's and a
 * group header's menu share them, so the two say the same thing.
 */
export function useGroupEditing(domain: Domain | null): GroupEditing {
  const run = useHostCommand()
  const [naming, setNaming] = useState<{ group: DomainGroup | null } | null>(null)
  const [deleting, setDeleting] = useState<DomainGroup | null>(null)
  const members = (g: DomainGroup) => domain?.questions.filter((m) => m.groupId === g.id).length ?? 0
  const dialogs = (
    <>
      <NameDialog
        isOpen={naming !== null}
        onOpenChange={(o) => (o ? undefined : setNaming(null))}
        title={naming?.group ? GROUPS_TAGS.rename : GROUPS_TAGS.newGroup}
        label={GROUPS_TAGS.groupName}
        initial={naming?.group?.name ?? ''}
        confirmLabel={naming?.group ? GROUPS_TAGS.save : GROUPS_TAGS.create}
        onSubmit={async (name) => {
          if (!domain) return
          if (naming?.group) await command('domain_group_rename', { id: naming.group.id, name })
          else await command('domain_group_create', { domainId: domain.id, name })
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => (o ? undefined : setDeleting(null))}
        title={deleting ? GROUPS_TAGS.deleteGroupTitle(deleting.name) : ''}
        body={deleting ? GROUPS_TAGS.deleteGroupBody(members(deleting)) : undefined}
        confirmLabel={GROUPS_TAGS.deleteGroup}
        onConfirm={async () => {
          if (!deleting || !domain) return true
          return run.ok('domain_group_delete', { id: deleting.id })
        }}
      />
    </>
  )
  return { rename: (group) => setNaming({ group }), remove: setDeleting, dialogs }
}

export interface DomainGroupsManagerProps {
  /** The open domain; `null` closes the manager. */
  domain: Domain | null
  onClose: () => void
  /** Filter the Questions list to this group (`~none`: no group) and close. */
  onShowInList: (groupId: string) => void
}

const NONE = '~none'

/**
 * A domain's groups (P20; *Groups* in P15): the groups in order with how many
 * questions each holds, *No domain group* last, and the chosen one's questions
 * beside them. Rename · Move up · Move down · Merge into… (one write:
 * `domain_group_delete { into }`) · Show in list · Delete. Organising only —
 * boards and Plays do not read groups, and the dialog says so.
 */
export function DomainGroupsManager({ domain, onClose, onShowInList }: DomainGroupsManagerProps) {
  const run = useHostCommand()
  const go = useNavStore((s) => s.go)
  const editing = useGroupEditing(domain)
  const questions = useCatalogList('question', 'all')
  const [picked, setPicked] = useState<string | null>(null)
  const [merging, setMerging] = useState(false)
  const [target, setTarget] = useState<string | null>(null)

  const groups = domain?.groups ?? []
  const byId = useMemo(() => new Map((questions.data ?? []).map((q) => [q.id, q])), [questions.data])
  const membersOf = (id: string): Question[] =>
    (domain?.questions ?? []).filter((m) => (m.groupId ?? NONE) === id).flatMap((m) => (byId.has(m.questionId) ? [byId.get(m.questionId) as Question] : []))
  const entries = [
    ...groups.map((g) => ({ id: g.id, label: g.name, count: membersOf(g.id).length })),
    { id: NONE, label: GROUPS_TAGS.noGroup, count: membersOf(NONE).length, muted: true },
  ]
  const currentId = entries.some((e) => e.id === picked) ? (picked as string) : (entries[0]?.id ?? NONE)
  const group = groups.find((g) => g.id === currentId) ?? null
  const index = group ? groups.indexOf(group) : -1
  const members = membersOf(currentId)

  const move = (g: DomainGroup, by: -1 | 1) => {
    if (!domain) return
    const order = groups.map((x) => x.id)
    const at = order.indexOf(g.id)
    const to = at + by
    if (to < 0 || to >= order.length) return
    ;[order[at], order[to]] = [order[to] as string, order[at] as string]
    void run.ok('domain_group_reorder', { domainId: domain.id, order })
  }
  const chips = (q: Question) => {
    const band = q.difficulty === null ? null : difficultyBand(q.difficulty)
    return (
      <>
        {isArchived(q) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null}
        {band ? <MeaningChip meaning={band}>{`${QUESTION.band[band]} · ${q.difficulty}`}</MeaningChip> : <MeaningChip meaning="unset">{QUESTION.difficultyUnset}</MeaningChip>}
      </>
    )
  }

  const detail =
    groups.length === 0 && members.length === 0 ? (
      <EmptyState kind="empty" what={GROUPS_TAGS.domainGroupsWhat} detail={GROUPS_TAGS.groupsBody} compact />
    ) : (
      <>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text as="h3" variant="studio-heading" truncate>
              {group ? group.name : GROUPS_TAGS.noGroup}
            </Text>
            <Text variant="studio-caption" tone="muted">
              {GROUPS_TAGS.memberCount(members.length)}
            </Text>
          </div>
          {group ? (
            <div className="flex shrink-0 gap-1">
              <IconButton icon="up" label={GROUPS_TAGS.moveUp} size="sm" onPress={() => move(group, -1)} isDisabled={index <= 0} />
              <IconButton icon="down" label={GROUPS_TAGS.moveDown} size="sm" onPress={() => move(group, 1)} isDisabled={index === groups.length - 1} />
            </div>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {group ? (
            <>
              <Button size="sm" variant="secondary" icon="edit" onPress={() => editing.rename(group)}>
                {GROUPS_TAGS.rename}
              </Button>
              <Button size="sm" variant="secondary" icon="duplicate" onPress={() => setMerging(true)} isDisabled={groups.length < 2}>
                {GROUPS_TAGS.mergeInto}
              </Button>
            </>
          ) : null}
          <Button size="sm" variant="secondary" icon="filter" onPress={() => onShowInList(currentId)} isDisabled={members.length === 0}>
            {GROUPS_TAGS.showInList}
          </Button>
          {group ? (
            <Button size="sm" variant="tertiary" icon="trash" onPress={() => editing.remove(group)}>
              {GROUPS_TAGS.deleteGroup}
            </Button>
          ) : null}
        </div>
        {members.length === 0 ? (
          <Text variant="studio-caption" tone="muted">
            {GROUPS_TAGS.noneInGroup}
          </Text>
        ) : (
          <MemberList
            label={group ? group.name : GROUPS_TAGS.noGroup}
            members={members.map((q) => ({ id: q.id, title: q.stem || QUESTION.noStem, chips: chips(q) }))}
            more={(n) => (
              <Button size="sm" variant="ghost" onPress={() => onShowInList(currentId)}>
                {GROUPS_TAGS.moreMembers(n)}
              </Button>
            )}
            onOpen={(id) => {
              onClose()
              void go({ tab: 'library', questionId: id, mode: 'view', ...(domain ? { domainId: domain.id } : {}) })
            }}
          />
        )}
      </>
    )

  return (
    <>
      <ManagerDialog
        isOpen={domain !== null}
        onClose={onClose}
        title={domain ? GROUPS_TAGS.groupsTitle(domain.name) : ''}
        description={GROUPS_TAGS.groupsBody}
        hook="data-groups-dialog"
        list={<PaneList what={GROUPS_TAGS.domainGroupsWhat} entries={entries} selectedId={currentId} onSelect={setPicked} />}
        detail={detail}
        footer={
          <>
            <Button variant="tertiary" onPress={onClose}>
              {GROUPS_TAGS.close}
            </Button>
            <Button variant="primary" icon="add" onPress={() => editing.rename(null)}>
              {GROUPS_TAGS.newGroup}
            </Button>
          </>
        }
      />
      {editing.dialogs}
      <ConfirmDialog
        isOpen={merging}
        onOpenChange={(o) => {
          setMerging(o)
          if (!o) setTarget(null)
        }}
        severity="default"
        title={group ? GROUPS_TAGS.mergeGroupTitle(group.name) : ''}
        body={
          group ? (
            <div className="flex flex-col gap-3">
              <SelectField label={GROUPS_TAGS.mergeTarget} value={target} onChange={setTarget} options={groups.filter((g) => g.id !== group.id).map((g) => ({ value: g.id, label: g.name }))} />
              <Text variant="studio-caption" tone="muted">
                {GROUPS_TAGS.mergeGroupBody(members.length)}
              </Text>
            </div>
          ) : undefined
        }
        confirmLabel={GROUPS_TAGS.merge}
        onConfirm={async () => {
          // Judged on press: the select may commit on the blur this press caused.
          if (!group || !target) return false
          const ok = await run.ok('domain_group_delete', { id: group.id, into: target })
          if (ok) {
            setPicked(target)
            setTarget(null)
          }
          return ok
        }}
      />
    </>
  )
}
