import { useState } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { ActionMenu, ConfirmDialog, NameDialog } from '@/molecules'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import type { Domain, DomainGroup } from '@/host/types'

export interface GroupsDialogProps {
  domain: Domain | null
  onClose: () => void
}

/**
 * A domain's groups (P15): in order, with New group · Rename · Move up / Move
 * down · Delete. Organising only — the dialog says so. Every name is typed;
 * deleting a group says how many questions stay, ungrouped.
 */
export function GroupsDialog({ domain, onClose }: GroupsDialogProps) {
  const run = useHostCommand()
  const [naming, setNaming] = useState<{ group: DomainGroup | null } | null>(null)
  const [deleting, setDeleting] = useState<DomainGroup | null>(null)
  const groups = domain?.groups ?? []
  const members = (g: DomainGroup) => domain?.questions.filter((m) => m.groupId === g.id).length ?? 0

  const move = (g: DomainGroup, by: -1 | 1) => {
    if (!domain) return
    const order = groups.map((x) => x.id)
    const at = order.indexOf(g.id)
    const to = at + by
    if (to < 0 || to >= order.length) return
    ;[order[at], order[to]] = [order[to] as string, order[at] as string]
    void run.ok('domain_group_reorder', { domainId: domain.id, order })
  }

  return (
    <>
      <AlertDialog.Backdrop isOpen={domain !== null && naming === null && deleting === null} onOpenChange={(o) => (o ? undefined : onClose())} isDismissable isKeyboardDismissDisabled={false}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{domain ? GROUPS_TAGS.groupsTitle(domain.name) : ''}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="flex flex-col gap-3" data-groups-dialog>
                <Text as="p" variant="studio-body" tone="muted">
                  {GROUPS_TAGS.groupsBody}
                </Text>
                {groups.length === 0 ? (
                  <Text as="p" variant="studio-body">
                    {GROUPS_TAGS.noGroupsYet}
                  </Text>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {groups.map((g, i) => (
                      <li key={g.id} className="flex items-center gap-2">
                        <Text variant="studio-body" className="flex-1" truncate>
                          {g.name}
                        </Text>
                        <Text variant="studio-caption" tone="muted">
                          {members(g)}
                        </Text>
                        <ActionMenu
                          label={`${GROUPS_TAGS.groups}: ${g.name}`}
                          items={[
                            { id: 'rename', label: GROUPS_TAGS.rename },
                            { id: 'up', label: GROUPS_TAGS.moveUp, isDisabled: i === 0 },
                            { id: 'down', label: GROUPS_TAGS.moveDown, isDisabled: i === groups.length - 1 },
                            { id: 'delete', label: GROUPS_TAGS.deleteGroup, isDanger: true },
                          ]}
                          onAction={(a) => {
                            if (a === 'rename') setNaming({ group: g })
                            else if (a === 'delete') setDeleting(g)
                            else move(g, a === 'up' ? -1 : 1)
                          }}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={onClose}>
                {GROUPS_TAGS.close}
              </Button>
              <Button variant="primary" icon="add" onPress={() => setNaming({ group: null })}>
                {GROUPS_TAGS.newGroup}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
      <NameDialog
        isOpen={naming !== null}
        onOpenChange={(o) => (o ? undefined : setNaming(null))}
        title={naming?.group ? GROUPS_TAGS.rename : GROUPS_TAGS.newGroup}
        label={GROUPS_TAGS.groupName}
        initial={naming?.group?.name ?? ''}
        confirmLabel={naming?.group ? GROUPS_TAGS.save : GROUPS_TAGS.create}
        onSubmit={async (name) => {
          if (!domain) return
          if (naming?.group) await command('domain_group_rename', { id: naming.group.id, domainId: domain.id, name })
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
          return run.ok('domain_group_delete', { id: deleting.id, domainId: domain.id })
        }}
      />
    </>
  )
}
