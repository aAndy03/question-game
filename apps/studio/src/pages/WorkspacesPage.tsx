import { useMemo, useState } from 'react'
import { Button, MeaningChip, SelectField, Text } from '@/atoms'
import { ActionMenu, ConfirmDialog, NameDialog, PageHeader, type ActionSection, type ConfirmFrame } from '@/molecules'
import { MENU, VIEWS, fmt } from '@/copy'
import { LibraryList, ListToolbar, isGameLoaded, useSwitchWorkspace, workspaceName, type RecordView } from '@/organisms'
import { LibraryTabLayout } from '@/templates'
import { noticesAt, useNoticeStore } from '@/chrome/notices'
import { useArchiveScope, useChromeStore, usePrefs } from '@/chrome/chrome'
import { workspacesSpec } from '@/host/listSpecs'
import type { ListItem } from '@/host/listView'
import { useListView } from '@/host/useListView'
import { toast } from '@/chrome/toast'
import { SETTINGS } from '@/copy/settings'
import { WORKSPACE } from '@/copy/workspaces'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { usePlayState } from '@/host/playState'
import { useCatalogItem, useSettings, useWorkspaceCounts, useWorkspaces } from '@/host/queries'
import type { DeletePreview, DeleteReport, Workspace, WorkspaceGroup } from '@/host/types'

type Dialog =
  | { readonly kind: 'new' }
  | { readonly kind: 'rename'; readonly workspace: Workspace }
  | { readonly kind: 'duplicate'; readonly workspace: Workspace }
  | { readonly kind: 'group'; readonly ids: readonly string[] }
  | { readonly kind: 'newGroup' }
  | { readonly kind: 'renameGroup'; readonly group: WorkspaceGroup }
  | { readonly kind: 'deleteGroup'; readonly group: WorkspaceGroup }
  | { readonly kind: 'delete'; readonly workspace: Workspace; readonly counts: DeletePreview }

/**
 * *Manage workspaces* (Beta 2.0, 05_STUDIO_DESIGN.md §21): every workspace by
 * group, archived ones included, with Open · Rename · Move to group ·
 * Duplicate · Archive/Restore · Delete permanently, and the groups' own
 * Rename · Move up/down · Delete. Every name is typed by the operator.
 *
 * The same list as every library tab (P21.6): grid or table, column headings,
 * and the selection strip — Archive, Restore, Move to workspace group. The
 * current workspace is kept out of a bulk Archive, as the playing game is on
 * Games; Duplicate and Delete permanently stay per row, each needing a name
 * or its own confirm.
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
  const counts = useWorkspaceCounts()
  const scope = useArchiveScope('workspaces')
  const setScope = useChromeStore((s) => s.setArchiveScope)
  const { view } = usePrefs()
  const setView = useChromeStore((s) => s.setView)
  // A prefs document written before P21.6 has no entry for this tab.
  const layout = view.workspaces ?? 'table'
  const [bulkPending, setBulkPending] = useState(false)
  const groups = useMemo(() => [...(data?.groups ?? [])].sort((a, b) => a.sortKey - b.sortKey), [data?.groups])
  const spec = useMemo(() => workspacesSpec(groups), [groups])
  // On the list-view model (beta.5): search, sort, grouped by workspace group, Status.
  const items = useMemo<ListItem<Workspace, RecordView>[] | undefined>(
    () =>
      data?.workspaces
        .filter((w) => (scope === 'all' ? true : scope === 'archived' ? w.archivedAt !== null : w.archivedAt === null))
        .map((w) => ({
          id: w.id,
          data: w,
          view: {
            id: w.id,
            title: workspaceName(w),
            // What it holds (beta.5), once the host has said.
            subtitle: (() => {
              const c = counts.data?.find((x) => x.workspace === w.id)
              return c ? WORKSPACE.counts(c) : undefined
            })(),
            isArchived: w.archivedAt !== null,
            meta: [fmt.dateShort(w.updatedAt)],
            chips: (
              <>
                {w.id === data.current ? <MeaningChip meaning="active">{WORKSPACE.current}</MeaningChip> : null}
                {w.archivedAt !== null ? <MeaningChip meaning="archived">{WORKSPACE.archived}</MeaningChip> : null}
              </>
            ),
          },
        })),
    [data, scope, counts.data],
  )
  const search = useChromeStore((s) => s.listState.workspaces?.search ?? '')
  const hits = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return needle ? new Map((items ?? []).filter((i) => i.view.title.toLowerCase().includes(needle)).map((i) => [i.id, 1])) : null
  }, [items, search])
  const lv = useListView(spec, items, hits)
  const pinPath = activeId ? `operator.${activeId}.pin` : ''
  const pinError = pinPath ? (noticesAt(notices, pinPath)[0]?.detail.message ?? null) : null

  if (!data) return null
  // A group with no workspace yet still shows, so it can be filled or deleted.
  // Empty in this view (review: a group of only archived workspaces had no
  // header under Active, and its menu could not be reached); not while searching.
  const emptyGroups = search.trim() ? [] : groups.filter((g) => !(items ?? []).some((i) => i.data.groupId === g.id))
  const groupMenu = (group: WorkspaceGroup) => (
    <ActionMenu
      label={`${WORKSPACE.actions}: ${group.name}`}
      sections={[
        { id: 'row', title: MENU.workspaceGroup, items: [{ id: 'rename', label: WORKSPACE.renameGroup, icon: 'edit' }] },
        {
          id: 'arrange',
          title: MENU.arrange,
          items: [
            { id: 'up', label: WORKSPACE.moveUp, icon: 'up', isDisabled: groups[0]?.id === group.id },
            { id: 'down', label: WORKSPACE.moveDown, icon: 'down', isDisabled: groups[groups.length - 1]?.id === group.id },
          ],
        },
        { id: 'danger', title: MENU.danger, items: [{ id: 'delete', label: WORKSPACE.deleteGroup, icon: 'trash', isDanger: true }] },
      ]}
      onAction={(id) => {
        if (id === 'rename') setDialog({ kind: 'renameGroup', group })
        else if (id === 'delete') setDialog({ kind: 'deleteGroup', group })
        else reorder(group, id === 'up' ? -1 : 1)
      }}
    />
  )

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

  const rowActions = (w: Workspace): ActionSection[] => {
    const isCurrent = w.id === data.current
    const archived = w.archivedAt !== null
    return [
      {
        id: 'row',
        title: MENU.workspace,
        items: [
          { id: 'open', label: WORKSPACE.open, icon: 'open', isDisabled: isCurrent || archived || loaded },
          { id: 'rename', label: WORKSPACE.rename, icon: 'edit' },
          { id: 'group', label: WORKSPACE.moveToGroup, icon: 'folder' },
        ],
      },
      { id: 'copy', title: MENU.copyMove, items: [{ id: 'duplicate', label: WORKSPACE.duplicate, icon: 'duplicate' }] },
      {
        id: 'status',
        title: MENU.status,
        items: [
          archived
            ? { id: 'restore', label: WORKSPACE.restore, icon: 'restore' }
            : { id: 'archive', label: WORKSPACE.archive, icon: 'archive', disabledReason: isCurrent ? WORKSPACE.isCurrent : null },
        ],
      },
      { id: 'danger', title: MENU.danger, items: [{ id: 'delete', label: WORKSPACE.deletePermanently, icon: 'trash', isDanger: true, isDisabled: !archived || loaded }] },
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
        setDialog({ kind: 'group', ids: [w.id] })
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

  /** One command per workspace, as the row's own; the strip says how many it took. */
  const bulkRun = async (name: 'workspace_archive' | 'workspace_restore', ids: readonly string[]) => {
    setBulkPending(true)
    let done = 0
    for (const id of ids) if (await run.ok(name, { id })) done += 1
    setBulkPending(false)
    if (done > 0) toast.success(name === 'workspace_archive' ? WORKSPACE.archivedMany(done) : WORKSPACE.restoredMany(done))
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
      <div className="flex min-h-0 flex-1 flex-col gap-3" data-workspaces-page>
        <ListToolbar
          view={lv}
          what={WORKSPACE.many}
          layout={layout}
          onLayout={(v) => setView('workspaces', v)}
          status={scope}
          onStatus={(v) => {
            setScope('workspaces', v)
            lv.resetPage()
          }}
        />
        <LibraryList
          view={lv}
          total={data.workspaces.length}
          scope={scope}
          isLoading={false}
          layout={layout}
          what={WORKSPACE.many}
          columns={{ title: { sortId: 'name', label: VIEWS.name }, meta: [{ sortId: 'changed', label: VIEWS.changed }] }}
          bulk={{
            onArchive: (ids) => void bulkRun('workspace_archive', ids.filter((id) => id !== data.current)),
            onRestore: (ids) => void bulkRun('workspace_restore', ids),
            keep: [data.current],
            extra: (ids) => (
              <Button
                size="sm"
                variant="secondary"
                icon="folder"
                onPress={() => {
                  setGroupPick('')
                  setDialog({ kind: 'group', ids })
                }}
              >
                {WORKSPACE.moveToGroup}
              </Button>
            ),
            isPending: bulkPending,
          }}
          actions={(row) => {
            const w = data.workspaces.find((x) => x.id === row.id)
            return w ? <ActionMenu label={`${WORKSPACE.actions}: ${workspaceName(w)}`} sections={rowActions(w)} onAction={(id) => void onRow(w, id)} /> : null
          }}
          headerActions={(key) => {
            const g = key.startsWith('wg:') ? groups.find((x) => `wg:${x.id}` === key) : undefined
            return g ? groupMenu(g) : null
          }}
        />
        {emptyGroups.map((g) => (
          <div key={g.id} className="flex items-center gap-2 px-2" data-empty-group={g.id}>
            <Text variant="studio-caption" tone="muted" className="flex-1">
              {WORKSPACE.emptyGroup(g.name)}
            </Text>
            {groupMenu(g)}
          </div>
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
        title={dialog?.kind === 'group' && dialog.ids.length > 1 ? WORKSPACE.moveManyTitle(dialog.ids.length) : WORKSPACE.moveTitle}
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
          // Each lands at the end of the group, in the order they were picked.
          let sortKey = data.workspaces.filter((w) => w.groupId === groupId && !dialog.ids.includes(w.id)).length
          let ok = true
          for (const id of dialog.ids) ok = (await run.ok('workspace_set_group', { id, groupId, sortKey: sortKey++ })) && ok
          return ok
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
