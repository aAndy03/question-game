import { useState } from 'react'
import { Button, MeaningChip, Panel, SelectField, Text } from '@/atoms'
import { ActionMenu, ConfirmDialog, NameDialog, PageHeader, type ActionItem, type ConfirmFrame } from '@/molecules'
import { groupedWorkspaces, isGameLoaded, useSwitchWorkspace, workspaceName } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { toast } from '@/chrome/toast'
import { SETTINGS } from '@/copy/settings'
import { WORKSPACE } from '@/copy/workspaces'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { usePlayState } from '@/host/playState'
import { useCatalogItem, useSettings, useWorkspaces } from '@/host/queries'
import type { DeletePreview, DeleteReport, Workspace, WorkspaceGroup } from '@/host/types'

type Dialog =
  | { readonly kind: 'new' }
  | { readonly kind: 'rename'; readonly workspace: Workspace }
  | { readonly kind: 'duplicate'; readonly workspace: Workspace }
  | { readonly kind: 'group'; readonly workspace: Workspace }
  | { readonly kind: 'newGroup' }
  | { readonly kind: 'renameGroup'; readonly group: WorkspaceGroup }
  | { readonly kind: 'deleteGroup'; readonly group: WorkspaceGroup }
  | { readonly kind: 'delete'; readonly workspace: Workspace; readonly counts: DeletePreview }

/**
 * *Manage workspaces* (Beta 2.0, 05_STUDIO_DESIGN.md §21): every workspace by
 * group, archived ones included, with Open · Rename · Move to group ·
 * Duplicate · Archive/Restore · Delete permanently, and the groups' own
 * Rename · Move up/down · Delete. Every name is typed by the operator.
 */
export function WorkspacesPage() {
  const workspaces = useWorkspaces()
  const run = useHostCommand()
  const switchWorkspace = useSwitchWorkspace()
  const play = usePlayState()
  const settings = useSettings()
  const activeId = settings.data?.globals.active_operator_id ?? null
  const active = useCatalogItem('operator', activeId)
  const pinned = Boolean(active.data?.pinHash)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [dialog, setDialog] = useState<Dialog | null>(null)
  const [groupPick, setGroupPick] = useState<string>('')
  const [frames, setFrames] = useState<ConfirmFrame[]>([])
  const [pending, setPending] = useState(false)
  const data = workspaces.data
  const loaded = isGameLoaded(play)
  const pinPath = activeId ? `operator.${activeId}.pin` : ''
  const pinError = pinPath ? (noticesAt(notices, pinPath)[0]?.detail.message ?? null) : null

  if (!data) return null
  const groups = [...data.groups].sort((a, b) => a.sortKey - b.sortKey)
  const sections = groupedWorkspaces(data.workspaces, data.groups, true)
  // A group with no workspace yet still shows, so it can be filled or deleted.
  for (const g of groups) if (!sections.some((s) => s.group?.id === g.id)) sections.splice(groups.indexOf(g), 0, { group: g, workspaces: [] })

  const close = () => {
    setDialog(null)
    setFrames([])
    notices.filter((n) => n.targetPath === pinPath).forEach((n) => dismiss(n.id))
  }

  const reorder = (group: WorkspaceGroup, by: -1 | 1) => {
    const order = groups.map((g) => g.id)
    const at = order.indexOf(group.id)
    const to = at + by
    if (to < 0 || to >= order.length) return
    ;[order[at], order[to]] = [order[to] as string, order[at] as string]
    void run.ok('workspace_group_reorder', { order })
  }

  const rowActions = (w: Workspace): ActionItem[] => {
    const isCurrent = w.id === data.current
    const archived = w.archivedAt !== null
    return [
      { id: 'open', label: WORKSPACE.open, isDisabled: isCurrent || archived || loaded },
      { id: 'rename', label: WORKSPACE.rename },
      { id: 'group', label: WORKSPACE.moveToGroup },
      { id: 'duplicate', label: WORKSPACE.duplicate },
      archived ? { id: 'restore', label: WORKSPACE.restore } : { id: 'archive', label: WORKSPACE.archive, isDisabled: isCurrent },
      { id: 'delete', label: WORKSPACE.deletePermanently, isDanger: true, isDisabled: !archived || loaded },
    ]
  }

  const onRow = async (w: Workspace, action: string) => {
    switch (action) {
      case 'open':
        await switchWorkspace(w.id)
        return
      case 'rename':
      case 'duplicate':
        setDialog({ kind: action, workspace: w })
        return
      case 'group':
        setGroupPick(w.groupId ?? '')
        setDialog({ kind: 'group', workspace: w })
        return
      case 'archive':
      case 'restore':
        await run.ok(action === 'archive' ? 'workspace_archive' : 'workspace_restore', { id: w.id })
        return
      case 'delete': {
        const counts = await run<DeletePreview>('workspace_delete_preview', { id: w.id })
        if (counts) setDialog({ kind: 'delete', workspace: w, counts })
        return
      }
    }
  }

  const deleteNow = async (pin: string | null) => {
    if (dialog?.kind !== 'delete') return
    setPending(true)
    const report = await run<DeleteReport>('workspace_delete', { id: dialog.workspace.id, pin }, { targetPath: pinPath || null })
    setPending(false)
    if (report === null) return
    toast.success(WORKSPACE.deleted(workspaceName(dialog.workspace)))
    close()
  }

  return (
    <LibraryTabLayout
      header={
        <PageHeader
          title={WORKSPACE.pageTitle}
          description={WORKSPACE.pageDescription}
          primaryAction={
            <Button variant="primary" icon="add" onPress={() => setDialog({ kind: 'new' })}>
              {WORKSPACE.newWorkspace}
            </Button>
          }
          secondaryActions={
            <Button variant="secondary" icon="folder" onPress={() => setDialog({ kind: 'newGroup' })}>
              {WORKSPACE.newGroup}
            </Button>
          }
        />
      }
    >
      <div className="flex min-h-0 flex-col gap-6 overflow-y-auto" data-workspaces-page>
        {sections.map((section) => (
          <section key={section.group?.id ?? 'ungrouped'} className="flex flex-col gap-2" aria-label={section.group?.name ?? WORKSPACE.ungrouped}>
            <div className="flex items-center gap-2">
              <Text as="h2" variant="studio-label" tone="muted" className="flex-1">
                {section.group?.name ?? WORKSPACE.ungrouped}
              </Text>
              {section.group ? (
                <ActionMenu
                  label={`${WORKSPACE.actions}: ${section.group.name}`}
                  items={[
                    { id: 'rename', label: WORKSPACE.renameGroup },
                    { id: 'up', label: WORKSPACE.moveUp, isDisabled: groups[0]?.id === section.group.id },
                    { id: 'down', label: WORKSPACE.moveDown, isDisabled: groups[groups.length - 1]?.id === section.group.id },
                    { id: 'delete', label: WORKSPACE.deleteGroup, isDanger: true },
                  ]}
                  onAction={(id) => {
                    const group = section.group as WorkspaceGroup
                    if (id === 'rename') setDialog({ kind: 'renameGroup', group })
                    else if (id === 'delete') setDialog({ kind: 'deleteGroup', group })
                    else reorder(group, id === 'up' ? -1 : 1)
                  }}
                />
              ) : null}
            </div>
            {section.workspaces.map((w) => (
              <Panel key={w.id} className="flex items-center gap-3" data-workspace-row={w.id}>
                <Text variant="studio-body" className="flex-1" truncate>
                  {workspaceName(w)}
                </Text>
                {w.id === data.current ? <MeaningChip meaning="active">{WORKSPACE.current}</MeaningChip> : null}
                {w.archivedAt !== null ? <MeaningChip meaning="archived">{WORKSPACE.archived}</MeaningChip> : null}
                <ActionMenu label={`${WORKSPACE.actions}: ${workspaceName(w)}`} items={rowActions(w)} onAction={(id) => void onRow(w, id)} />
              </Panel>
            ))}
          </section>
        ))}
      </div>

      <NameDialog
        isOpen={dialog?.kind === 'new' || dialog?.kind === 'rename' || dialog?.kind === 'duplicate'}
        onOpenChange={(o) => (o ? undefined : close())}
        title={dialog?.kind === 'rename' ? WORKSPACE.renameTitle : dialog?.kind === 'duplicate' ? WORKSPACE.duplicateTitle : WORKSPACE.newTitle}
        body={dialog?.kind === 'duplicate' ? WORKSPACE.duplicateBody : undefined}
        label={WORKSPACE.nameLabel}
        initial={dialog?.kind === 'rename' ? (dialog.workspace.name ?? '') : ''}
        confirmLabel={dialog?.kind === 'rename' ? WORKSPACE.save : WORKSPACE.create}
        onSubmit={async (name) => {
          if (dialog?.kind === 'rename') await command('workspace_rename', { id: dialog.workspace.id, name })
          else if (dialog?.kind === 'duplicate') await command('workspace_duplicate', { id: dialog.workspace.id, name })
          else await command('workspace_create', { name })
        }}
      />
      <NameDialog
        isOpen={dialog?.kind === 'newGroup' || dialog?.kind === 'renameGroup'}
        onOpenChange={(o) => (o ? undefined : close())}
        title={dialog?.kind === 'renameGroup' ? WORKSPACE.renameGroupTitle : WORKSPACE.newGroupTitle}
        label={WORKSPACE.groupNameLabel}
        initial={dialog?.kind === 'renameGroup' ? dialog.group.name : ''}
        confirmLabel={dialog?.kind === 'renameGroup' ? WORKSPACE.save : WORKSPACE.create}
        onSubmit={async (name) => {
          if (dialog?.kind === 'renameGroup') await command('workspace_group_rename', { id: dialog.group.id, name })
          else await command('workspace_group_create', { name })
        }}
      />
      <ConfirmDialog
        isOpen={dialog?.kind === 'group'}
        onOpenChange={(o) => (o ? undefined : close())}
        severity="default"
        title={WORKSPACE.moveTitle}
        body={
          <SelectField
            label={WORKSPACE.groupLabel}
            value={groupPick}
            onChange={setGroupPick}
            options={[{ value: '', label: WORKSPACE.noGroup }, ...groups.map((g) => ({ value: g.id, label: g.name }))]}
          />
        }
        confirmLabel={WORKSPACE.save}
        onConfirm={async () => {
          if (dialog?.kind !== 'group') return true
          const groupId = groupPick || null
          const sortKey = data.workspaces.filter((w) => w.groupId === groupId).length
          return run.ok('workspace_set_group', { id: dialog.workspace.id, groupId, sortKey })
        }}
      />
      <ConfirmDialog
        isOpen={dialog?.kind === 'deleteGroup'}
        onOpenChange={(o) => (o ? undefined : close())}
        title={WORKSPACE.deleteGroupTitle}
        body={WORKSPACE.deleteGroupBody}
        confirmLabel={WORKSPACE.deleteGroup}
        onConfirm={async () => {
          if (dialog?.kind === 'deleteGroup') return run.ok('workspace_group_delete', { id: dialog.group.id })
        }}
      />
      <ConfirmDialog
        isOpen={dialog?.kind === 'delete'}
        onOpenChange={(o) => (o ? undefined : close())}
        title={WORKSPACE.deleteTitle}
        body={
          dialog?.kind === 'delete'
            ? WORKSPACE.deleteBody(workspaceName(dialog.workspace), dialog.counts.rows, dialog.counts.games, dialog.counts.plays)
            : undefined
        }
        confirmLabel={WORKSPACE.deleteConfirm}
        arm
        armedLabel={WORKSPACE.deleteArmed}
        isPending={pending}
        onConfirm={async () => {
          if (pinned) {
            setFrames([{ variant: 'pin', title: SETTINGS.pin.promptTitle, body: SETTINGS.data.pinFrame, confirmLabel: WORKSPACE.deleteConfirm }])
            return
          }
          await deleteNow(null)
        }}
        frames={frames}
        onCancelFrame={() => setFrames((f) => f.slice(0, -1))}
        onConfirmPin={(pin) => deleteNow(pin)}
        pinError={pinError}
      />
    </LibraryTabLayout>
  )
}
