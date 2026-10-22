import { useMemo, useState, type ReactNode } from 'react'
import { AlertDialog, Dropdown } from '@heroui/react'
import { Button, ComboField, SelectField, Text } from '@/atoms'
import { renderMenuSections, TagField, type ActionSection } from '@/molecules'
import { toast } from '@/chrome/toast'
import { CONFIRM, GAME, GAME_LABELS, GAME_TAG_WORDS, MENU } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { useRecipeList } from '@/host/queries'
import type { BulkReport, Recipe, RecipeEdit } from '@/host/types'

/** Which label dialog is open, and on which games. */
type Op = 'set_folder' | 'clear_folder' | 'tag' | 'untag' | 'tags'

export interface GameLabels {
  /** The workspace's folders and game tags, distinct, A–Z — what the fields offer. */
  readonly folders: readonly string[]
  readonly tags: readonly string[]
  /** One `recipe_bulk_edit`; `false` when the host refused (a notice says why). */
  write(ids: readonly string[], edits: readonly RecipeEdit[]): Promise<boolean>
  /** The bulk *Edit…* menu for a selection of games: *Folder* · *Game tags*. */
  menu(ids: readonly string[]): ReactNode
  /** Open a label dialog for these games (the row menu's *Folder…*, *Game tags…*). */
  open(op: 'set_folder' | 'tags', ids: readonly string[]): void
  dialog: ReactNode
}

const key = (t: string) => t.trim().toLowerCase()
const distinct = (values: readonly string[]) => {
  const seen = new Map<string, string>()
  for (const v of values) if (!seen.has(key(v))) seen.set(key(v), v)
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/** What `edits` would change: the games it touches, as the host counts them. */
export function wouldChange(games: readonly Recipe[], edit: RecipeEdit): number {
  return games.filter((g) =>
    edit.op === 'set_folder' ? (g.folder ?? null) !== edit.folder : edit.op === 'tag' ? !g.tags.some((t) => key(t) === key(edit.tag)) : g.tags.some((t) => key(t) === key(edit.tag)),
  ).length
}

/**
 * Folders and game tags (P20): the one write (`recipe_bulk_edit`), the bulk
 * *Edit…* menu of the Games tab and the dialogs behind it and the row menu.
 * Labels are organisation, not the show, so the game in Control is included
 * and nothing is frozen. A dialog's value is judged when *Apply* is pressed —
 * a field commits on blur, and the press that blurs it must not be eaten.
 */
export function useGameLabels(): GameLabels {
  const run = useHostCommand()
  const all = useRecipeList('all')
  const games = all.data ?? []
  const folders = useMemo(() => distinct(games.flatMap((g) => (g.folder ? [g.folder] : []))), [games])
  const tags = useMemo(() => distinct(games.flatMap((g) => g.tags)), [games])
  const [open, setOpen] = useState<{ op: Op; ids: readonly string[] } | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const write = async (ids: readonly string[], edits: readonly RecipeEdit[]) => {
    if (ids.length === 0 || edits.length === 0) return true
    return (await run<BulkReport>('recipe_bulk_edit', { ids, edits, preview: false })) !== null
  }

  const picked = games.filter((g) => open?.ids.includes(g.id))
  const carried = distinct(picked.flatMap((g) => g.tags))
  const close = () => {
    setOpen(null)
    setText(null)
  }
  const edit = (): RecipeEdit | null => {
    if (!open) return null
    const value = text?.trim() ?? ''
    if (open.op === 'clear_folder') return { op: 'set_folder', folder: null }
    if (!value) return null
    if (open.op === 'set_folder') return { op: 'set_folder', folder: value }
    if (open.op === 'tag') return { op: 'tag', tag: value }
    if (open.op === 'untag') return { op: 'untag', tag: value }
    return null
  }
  const apply = async () => {
    const e = edit()
    if (!open || !e) return
    setPending(true)
    const report = await run<BulkReport>('recipe_bulk_edit', { ids: open.ids, edits: [e], preview: false })
    setPending(false)
    if (report === null) return
    toast.success(GAME_LABELS.done(report.changed.length))
    close()
  }

  const titles: Record<Op, string> = {
    set_folder: GAME_LABELS.setFolder,
    clear_folder: GAME_LABELS.clearFolder,
    tag: GAME_LABELS.addTag,
    untag: GAME_LABELS.removeTag,
    tags: GAME_TAG_WORDS.label,
  }
  const e = edit()
  const one = picked.length === 1 ? picked[0] : undefined
  const dialog = (
    <AlertDialog.Backdrop isOpen={open !== null} onOpenChange={(o) => (o ? undefined : close())} isDismissable>
      <AlertDialog.Container size="md">
        <AlertDialog.Dialog data-game-labels>
          <AlertDialog.Header>
            <AlertDialog.Heading>{open ? titles[open.op] : ''}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body className="flex flex-col gap-3">
            {open?.op === 'tags' && one ? (
              // One game's tags, written as they change: each add or remove is one write.
              <TagField
                words={GAME_TAG_WORDS}
                value={one.tags}
                known={tags}
                onChange={(next) => {
                  const added = next.filter((t) => !one.tags.some((x) => key(x) === key(t))).map((t): RecipeEdit => ({ op: 'tag', tag: t }))
                  const removed = one.tags.filter((t) => !next.some((x) => key(x) === key(t))).map((t): RecipeEdit => ({ op: 'untag', tag: t }))
                  void write([one.id], [...removed, ...added])
                }}
              />
            ) : null}
            {open?.op === 'set_folder' ? (
              <ComboField label={GAME.folder} description={GAME.folderHint} value={text} options={folders} onCommit={setText} onInputChange={setText} maxLength={60} />
            ) : null}
            {open?.op === 'tag' ? <ComboField label={GAME_LABELS.tagField} value={text} options={tags} onCommit={setText} onInputChange={setText} maxLength={40} /> : null}
            {open?.op === 'untag' ? (
              <SelectField label={GAME_LABELS.tagField} value={text} onChange={setText} options={carried.map((t) => ({ value: t, label: t }))} />
            ) : null}
            {open && open.op !== 'tags' ? (
              <Text variant="studio-caption" tone="muted">
                {e ? GAME_LABELS.appliesTo(wouldChange(picked, e), picked.length) : GAME_LABELS.selected(picked.length)}
              </Text>
            ) : null}
          </AlertDialog.Body>
          <AlertDialog.Footer>
            {open?.op === 'tags' ? (
              <Button variant="primary" onPress={close}>
                {CONFIRM.done}
              </Button>
            ) : (
              <>
                <span className="contents" data-keep-draft>
                  <Button variant="tertiary" onPress={close} isDisabled={pending}>
                    {CONFIRM.cancel}
                  </Button>
                </span>
                <span className="contents" data-keep-draft>
                  <Button variant="primary" onPress={() => void apply()} isPending={pending}>
                    {GAME_LABELS.apply}
                  </Button>
                </span>
              </>
            )}
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )

  const menu = (ids: readonly string[]) => {
    const selected = games.filter((g) => ids.includes(g.id))
    const sections: ActionSection[] = [
      {
        id: 'folder',
        title: MENU.folder,
        items: [
          { id: 'set_folder', label: GAME_LABELS.setFolder, icon: 'folder' },
          { id: 'clear_folder', label: GAME_LABELS.clearFolder, icon: 'remove', disabledReason: selected.some((g) => g.folder) ? null : GAME_LABELS.noFolderHere },
        ],
      },
      {
        id: 'tags',
        title: MENU.gameTags,
        items: [
          { id: 'tag', label: GAME_LABELS.addTag, icon: 'tag' },
          { id: 'untag', label: GAME_LABELS.removeTag, icon: 'tag', disabledReason: selected.some((g) => g.tags.length > 0) ? null : GAME_LABELS.noTagHere },
        ],
      },
    ]
    return (
      <Dropdown>
        <Button size="sm" variant="secondary" icon="edit">
          {GAME_LABELS.edit}
        </Button>
        <Dropdown.Popover placement="bottom start" className="min-w-[14rem]">
          <Dropdown.Menu
            aria-label={GAME_LABELS.edit}
            disabledKeys={sections.flatMap((s) => s.items.filter((i) => i.disabledReason).map((i) => i.id))}
            onAction={(k) => {
              setText(null)
              setOpen({ op: String(k) as Op, ids })
            }}
          >
            {renderMenuSections(sections)}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    )
  }

  return {
    folders,
    tags,
    write,
    menu,
    open: (op, ids) => {
      setText(op === 'set_folder' ? (games.find((g) => g.id === ids[0])?.folder ?? null) : null)
      setOpen({ op, ids })
    },
    dialog,
  }
}
