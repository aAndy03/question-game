import { useMemo, useState } from 'react'
import { Button, MeaningChip, SelectField, Text } from '@/atoms'
import { ConfirmDialog, EmptyState, ManagerDialog, MemberList, NameDialog, PaneList } from '@/molecules'
import { useNavStore } from '@/chrome/nav'
import { toast } from '@/chrome/toast'
import { GAME_LABELS, LIST } from '@/copy'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useHostCommand } from '@/host/commands'
import { useRecipeList } from '@/host/queries'
import { isArchived, type BulkReport, type Recipe, type RecipeEdit } from '@/host/types'

export interface GameLabelsManagerProps {
  isOpen: boolean
  onClose: () => void
  /** Filter the Games list (`folder` or `tag`, the value as the filter holds it) and close. */
  onShowInList: (filter: 'folder' | 'tag', value: string) => void
}

type Entry = { readonly kind: 'folder' | 'tag'; readonly name: string }
const key = (t: string) => t.trim().toLowerCase()

/**
 * Folders and game tags (P20): every folder and every game tag of this
 * workspace's games, with how many games each holds, and the chosen one's
 * games beside them. A folder: Rename… · Empty folder · Show in list. A game
 * tag: Rename… · Merge into… · Show in list · Delete. Every write is one
 * `recipe_bulk_edit` over the games it names, so a rename onto an existing
 * name merges.
 */
export function GameLabelsManager({ isOpen, onClose, onShowInList }: GameLabelsManagerProps) {
  const games = useRecipeList('all')
  const run = useHostCommand()
  const go = useNavStore((s) => s.go)
  const [picked, setPicked] = useState<Entry | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [merging, setMerging] = useState(false)
  const [target, setTarget] = useState<string | null>(null)

  const all = games.data ?? []
  const folders = useMemo(() => countBy(all.flatMap((g) => (g.folder ? [g.folder] : []))), [all])
  const tags = useMemo(() => countBy(all.flatMap((g) => g.tags)), [all])
  const first: Entry | null = folders[0] ? { kind: 'folder', name: folders[0].name } : tags[0] ? { kind: 'tag', name: tags[0].name } : null
  const valid = (e: Entry | null) => e !== null && (e.kind === 'folder' ? folders : tags).some((x) => x.name === e.name)
  const current = valid(picked) ? picked : first
  const holders: Recipe[] = current ? all.filter((g) => (current.kind === 'folder' ? g.folder === current.name : g.tags.some((t) => key(t) === key(current.name)))) : []
  const ids = holders.map((g) => g.id)

  const write = async (edits: readonly RecipeEdit[], over = ids) => {
    const report = await run<BulkReport>('recipe_bulk_edit', { ids: over, edits, preview: false })
    if (report) toast.success(GAME_LABELS.done(report.changed.length))
    return report !== null
  }

  const detail = !current ? (
    <EmptyState kind="empty" what={GAME_LABELS.tagsWhat} detail={GAME_LABELS.none} compact />
  ) : (
    <>
      <div className="flex flex-col gap-0.5">
        <Text variant="studio-caption" tone="muted">
          {current.kind === 'folder' ? GAME_LABELS.folders : GAME_LABELS.gameTags}
        </Text>
        <Text as="h3" variant="studio-heading" truncate>
          {current.name}
        </Text>
        <Text variant="studio-caption" tone="muted">
          {GAME_LABELS.games(holders.length)}
        </Text>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" icon="edit" onPress={() => setRenaming(true)}>
          {GROUPS_TAGS.rename}
        </Button>
        {current.kind === 'tag' ? (
          <Button size="sm" variant="secondary" icon="duplicate" onPress={() => setMerging(true)} isDisabled={tags.length < 2}>
            {GROUPS_TAGS.mergeInto}
          </Button>
        ) : null}
        <Button size="sm" variant="secondary" icon="filter" onPress={() => onShowInList(current.kind, current.name)}>
          {GROUPS_TAGS.showInList}
        </Button>
        <Button size="sm" variant="tertiary" icon="trash" onPress={() => setRemoving(true)}>
          {current.kind === 'folder' ? GAME_LABELS.emptyFolder : GAME_LABELS.deleteTag}
        </Button>
      </div>
      <MemberList
        label={current.name}
        members={holders.map((g) => ({ id: g.id, title: g.name, chips: isArchived(g) ? <MeaningChip meaning="archived">{LIST.archived}</MeaningChip> : null }))}
        onOpen={(id) => {
          onClose()
          void go({ tab: 'games', id })
        }}
      />
    </>
  )

  const pane = (kind: 'folder' | 'tag', list: readonly { name: string; count: number }[]) =>
    list.length === 0 ? null : (
      <div className="flex flex-col gap-1">
        <Text as="h3" variant="studio-label" tone="muted" className="px-2.5">
          {kind === 'folder' ? GAME_LABELS.folders : GAME_LABELS.gameTags}
        </Text>
        <PaneList
          what={kind === 'folder' ? GAME_LABELS.foldersWhat : GAME_LABELS.tagsWhat}
          entries={list.map((x) => ({ id: x.name, label: x.name, count: x.count }))}
          selectedId={current?.kind === kind ? current.name : null}
          onSelect={(name) => setPicked({ kind, name })}
        />
      </div>
    )

  return (
    <>
      <ManagerDialog
        isOpen={isOpen}
        onClose={onClose}
        title={GAME_LABELS.manageTitle}
        description={GAME_LABELS.manageBody}
        hook="data-game-labels-manager"
        list={
          <div className="flex flex-col gap-4">
            {pane('folder', folders)}
            {pane('tag', tags)}
          </div>
        }
        detail={detail}
        footer={
          <Button variant="tertiary" onPress={onClose}>
            {GROUPS_TAGS.close}
          </Button>
        }
      />
      <NameDialog
        isOpen={renaming}
        onOpenChange={setRenaming}
        title={current ? (current.kind === 'folder' ? GAME_LABELS.renameFolder(current.name) : GAME_LABELS.renameTag(current.name)) : ''}
        label={GAME_LABELS.newName}
        initial={current?.name ?? ''}
        confirmLabel={GROUPS_TAGS.save}
        onSubmit={async (to) => {
          if (!current) return
          const edits: RecipeEdit[] = current.kind === 'folder' ? [{ op: 'set_folder', folder: to }] : [{ op: 'untag', tag: current.name }, { op: 'tag', tag: to }]
          const ok = await write(edits)
          if (!ok) throw new Error(GAME_LABELS.newName)
          setPicked({ kind: current.kind, name: to.trim() })
        }}
      />
      <ConfirmDialog
        isOpen={removing}
        onOpenChange={setRemoving}
        title={current ? (current.kind === 'folder' ? GAME_LABELS.emptyFolderTitle(current.name) : GAME_LABELS.deleteTagTitle(current.name)) : ''}
        body={current ? (current.kind === 'folder' ? GAME_LABELS.emptyFolderBody(holders.length) : GAME_LABELS.deleteTagBody(holders.length)) : undefined}
        confirmLabel={current?.kind === 'folder' ? GAME_LABELS.emptyFolder : GAME_LABELS.deleteTag}
        onConfirm={async () => {
          if (!current) return true
          const ok = await write(current.kind === 'folder' ? [{ op: 'set_folder', folder: null }] : [{ op: 'untag', tag: current.name }])
          if (ok) setPicked(null)
          return ok
        }}
      />
      <ConfirmDialog
        isOpen={merging}
        onOpenChange={(o) => {
          setMerging(o)
          if (!o) setTarget(null)
        }}
        severity="default"
        title={current ? GAME_LABELS.mergeTitle(current.name) : ''}
        body={
          current ? (
            <div className="flex flex-col gap-3">
              <SelectField label={GROUPS_TAGS.mergeTarget} value={target} onChange={setTarget} options={tags.filter((t) => t.name !== current.name).map((t) => ({ value: t.name, label: t.name, description: GAME_LABELS.games(t.count) }))} />
              <Text variant="studio-caption" tone="muted">
                {GAME_LABELS.mergeBody(holders.length)}
              </Text>
            </div>
          ) : undefined
        }
        confirmLabel={GROUPS_TAGS.merge}
        onConfirm={async () => {
          // Judged on press: the select may commit on the blur this press caused.
          if (!current || !target) return false
          const ok = await write([{ op: 'untag', tag: current.name }, { op: 'tag', tag: target }])
          if (ok) {
            setPicked({ kind: 'tag', name: target })
            setTarget(null)
          }
          return ok
        }}
      />
    </>
  )
}

/** Each distinct value (case folded, its first spelling) with how many hold it, A–Z. */
function countBy(values: readonly string[]): { name: string; count: number }[] {
  const out = new Map<string, { name: string; count: number }>()
  for (const v of values) {
    const k = key(v)
    const at = out.get(k)
    if (at) at.count += 1
    else out.set(k, { name: v, count: 1 })
  }
  return [...out.values()].sort((a, b) => a.name.localeCompare(b.name))
}
