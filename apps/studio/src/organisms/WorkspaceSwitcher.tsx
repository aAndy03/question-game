import { useState } from 'react'
import { Dropdown, Header, Label, Separator as MenuSeparator } from '@heroui/react'
import { Button, Icon, InitialsAvatar, Text, Tooltip } from '@/atoms'
import { NameDialog } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { WORKSPACE } from '@/copy/workspaces'
import { command } from '@/host/host'
import { usePlayState } from '@/host/playState'
import { toast } from '@/chrome/toast'
import { isGameLoaded, useSwitchWorkspace } from './useSwitchWorkspace'
import { useWorkspaces } from '@/host/queries'
import type { Workspace, WorkspaceGroup } from '@/host/types'

export interface WorkspaceSwitcherProps {
  /** Rail mode: the workspace's initials, its name in a tooltip. */
  collapsed: boolean
}

export function workspaceName(w: Workspace | undefined): string {
  return w?.name ?? WORKSPACE.unnamed
}

/** Groups in their order, each with its active workspaces; Ungrouped last. */
export function groupedWorkspaces(workspaces: readonly Workspace[], groups: readonly WorkspaceGroup[], includeArchived = false) {
  const shown = workspaces.filter((w) => includeArchived || w.archivedAt === null)
  const byOrder = (a: { sortKey: number; createdAt: number }, b: { sortKey: number; createdAt: number }) =>
    a.sortKey - b.sortKey || a.createdAt - b.createdAt
  const sections = [...groups].sort(byOrder).map((g) => ({ group: g as WorkspaceGroup | null, workspaces: shown.filter((w) => w.groupId === g.id).sort(byOrder) }))
  const known = new Set(groups.map((g) => g.id))
  sections.push({ group: null, workspaces: shown.filter((w) => w.groupId === null || !known.has(w.groupId)).sort(byOrder) })
  return sections.filter((s) => s.workspaces.length > 0)
}

/**
 * The switcher at the top of the sidebar (Beta 2.0): which workspace Studio
 * works in, the others by group, *New workspace…* and *Manage workspaces…*.
 * Disabled, saying why, while a game is loaded in Control — its Play lives in
 * this workspace.
 */
export function WorkspaceSwitcher({ collapsed }: WorkspaceSwitcherProps) {
  const workspaces = useWorkspaces()
  const play = usePlayState()
  const go = useNavStore((s) => s.go)
  const switchWorkspace = useSwitchWorkspace()
  const [creating, setCreating] = useState(false)
  const data = workspaces.data
  if (!data) return null

  const current = data.workspaces.find((w) => w.id === data.current)
  const name = workspaceName(current)
  const loaded = isGameLoaded(play)

  const switchTo = async (id: string) => {
    if (id !== data.current) await switchWorkspace(id)
  }

  const face = collapsed ? (
    <InitialsAvatar name={name} size="sm" tone="accent" />
  ) : (
    <span className="flex min-w-0 flex-1 items-center gap-2">
      <Icon name="workspaces" size="md" />
      <Text variant="studio-label" tone="inherit" truncate className="flex-1 text-left">
        {name}
      </Text>
      <Icon name="chevronDown" size="sm" />
    </span>
  )

  if (loaded) {
    return (
      <div className={collapsed ? 'flex justify-center' : ''} data-workspace-switcher>
        <Tooltip content={WORKSPACE.loaded} placement="right" delay={200}>
          <span className="block w-full">
            <Button variant="ghost" fullWidth={!collapsed} isDisabled className="justify-start">
              {face}
            </Button>
          </span>
        </Tooltip>
      </div>
    )
  }

  const sections = groupedWorkspaces(data.workspaces, data.groups)
  return (
    <div className={collapsed ? 'flex justify-center' : ''} data-workspace-switcher>
      <Dropdown>
        <Button variant="ghost" fullWidth={!collapsed} className="justify-start">
          <span className="sr-only">{`${WORKSPACE.switcher}: `}</span>
          {face}
        </Button>
        <Dropdown.Popover placement={collapsed ? 'right top' : 'bottom start'} className="min-w-[240px]">
          <Dropdown.Menu
            aria-label={WORKSPACE.switcher}
            onAction={(key) => {
              const id = String(key)
              if (id === 'new') setCreating(true)
              else if (id === 'manage') void go({ tab: 'workspaces' })
              else void switchTo(id.replace(/^ws:/, ''))
            }}
          >
            {sections.map((section) => (
              <Dropdown.Section key={section.group?.id ?? 'ungrouped'}>
                {sections.length > 1 || section.group ? <Header>{section.group?.name ?? WORKSPACE.ungrouped}</Header> : null}
                {section.workspaces.map((w) => (
                  <Dropdown.Item key={w.id} id={`ws:${w.id}`} textValue={workspaceName(w)}>
                    <span className="flex w-full items-center gap-2">
                      <Label className="flex-1">{workspaceName(w)}</Label>
                      {w.id === data.current ? <Icon name="check" size="sm" label={WORKSPACE.current} /> : null}
                    </span>
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            ))}
            <MenuSeparator />
            <Dropdown.Section>
              <Dropdown.Item id="new" textValue={WORKSPACE.newWorkspace}>
                <Label>{WORKSPACE.newWorkspace}</Label>
              </Dropdown.Item>
              <Dropdown.Item id="manage" textValue={WORKSPACE.manage}>
                <Label>{WORKSPACE.manage}</Label>
              </Dropdown.Item>
            </Dropdown.Section>
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
      <NameDialog
        isOpen={creating}
        onOpenChange={setCreating}
        title={WORKSPACE.newTitle}
        label={WORKSPACE.nameLabel}
        confirmLabel={WORKSPACE.create}
        onSubmit={async (typed) => {
          const created = await command<Workspace>('workspace_create', { name: typed })
          // Created is created: a switch refused now (a game was loaded
          // meanwhile) must not read as a refused name (review).
          if (!(await switchWorkspace(created.id))) toast.success(WORKSPACE.createdNotOpened(typed.trim()))
        }}
      />
    </div>
  )
}
