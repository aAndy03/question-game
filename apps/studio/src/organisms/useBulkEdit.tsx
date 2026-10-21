import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog, Dropdown, Label } from '@heroui/react'
import { Button, CheckboxField, SelectField, Text, TextField } from '@/atoms'
import { DifficultyField } from '@/molecules'
import { toast } from '@/chrome/toast'
import { CONFIRM } from '@/copy'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useHostCommand } from '@/host/commands'
import { command, type HostError } from '@/host/host'
import { useCatalogList, useTags } from '@/host/queries'
import type { BulkEdit, BulkReport, Domain, Question } from '@/host/types'

type Op = BulkEdit['op']

interface Open {
  readonly op: Op
  readonly ids: readonly string[]
}

export interface BulkEditContext {
  /** The domain the list is inside, or null under All questions. */
  readonly domain: Domain | null
  /** The selected questions, for the tags Untag can offer. */
  readonly questions: readonly Question[]
}

export interface BulkEditController {
  menu(ids: readonly string[], ctx: BulkEditContext): ReactNode
  dialog: ReactNode
}

const TITLE: Record<Op, string> = {
  tag: GROUPS_TAGS.bulkTag,
  untag: GROUPS_TAGS.bulkUntag,
  group: GROUPS_TAGS.bulkGroup,
  add_to_domain: GROUPS_TAGS.bulkAdd,
  remove_from_domain: GROUPS_TAGS.bulkRemove,
  set_difficulty: GROUPS_TAGS.bulkDifficulty,
}

/**
 * The bulk bar's *Edit…* (P15): Tag… · Untag… · Group… · Add to domain… ·
 * Remove from domain · Set difficulty…. Each is previewed by the host — how
 * many it changes and how many are already so — before the
 * one-transaction write. Copies in other workspaces are not touched.
 */
export function useBulkEdit(): BulkEditController {
  const run = useHostCommand()
  const domains = useCatalogList('domain', 'active')
  const tags = useTags()
  const [open, setOpen] = useState<Open | null>(null)
  const [ctx, setCtx] = useState<BulkEditContext>({ domain: null, questions: [] })
  const [tag, setTag] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<number | null>(50)
  const [unset, setUnset] = useState(false)
  const [preview, setPreview] = useState<{ key: string; report: BulkReport } | null>(null)
  const [refusal, setRefusal] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const edit = ((): BulkEdit | null => {
    if (!open) return null
    switch (open.op) {
      case 'tag':
      case 'untag':
        return (open.op === 'tag' ? tag.trim() : choice) ? { op: open.op, tag: open.op === 'tag' ? tag.trim() : (choice as string) } : null
      case 'group':
        return ctx.domain && choice !== null ? { op: 'group', domainId: ctx.domain.id, groupId: choice === '~none' ? null : choice } : null
      case 'add_to_domain':
        return choice ? { op: 'add_to_domain', domainId: choice } : null
      case 'remove_from_domain':
        return ctx.domain ? { op: 'remove_from_domain', domainId: ctx.domain.id } : null
      case 'set_difficulty':
        return { op: 'set_difficulty', difficulty: unset ? null : difficulty }
    }
  })()
  const key = JSON.stringify(edit)

  useEffect(() => {
    // The last answer stands while the next one is asked: a field that commits
    // its value on blur would otherwise disable Apply under the click (e2e).
    // Apply checks the answer is current before it writes. A typed tag is
    // asked once typing pauses.
    setRefusal(null)
    if (!open || !edit) return setPreview(null)
    let live = true
    const ask = () =>
      command<BulkReport>('catalog_bulk_edit', { ids: open.ids, edit, preview: true })
        .then((r) => live && setPreview({ key, report: r }))
        .catch((e: HostError) => live && setRefusal(e.message.replace(/^[^:]*:\s*/, '')))
    const timer = open.op === 'tag' ? setTimeout(() => void ask(), 200) : (void ask(), undefined)
    return () => {
      live = false
      if (timer !== undefined) clearTimeout(timer)
    }
    // `key` stands for `edit`, which is rebuilt on every render.
  }, [open, key])

  const start = (op: Op, ids: readonly string[], context: BulkEditContext) => {
    setPreview(null)
    setCtx(context)
    setTag('')
    setChoice(op === 'group' ? '~none' : null)
    setDifficulty(50)
    setUnset(false)
    setOpen({ op, ids })
  }
  const close = () => {
    setOpen(null)
    setPending(false)
  }
  const apply = async () => {
    if (!open || !edit) return
    setPending(true)
    // The value changed under the click (a field commits on blur): ask again
    // first, and write only if it still changes something — the toast then
    // says what was really written.
    if (!current) {
      const fresh = await run<BulkReport>('catalog_bulk_edit', { ids: open.ids, edit, preview: true })
      if (fresh === null || fresh.changed.length === 0) {
        if (fresh) setPreview({ key, report: fresh })
        return setPending(false)
      }
    }
    const done = await run<BulkReport>('catalog_bulk_edit', { ids: open.ids, edit, preview: false })
    setPending(false)
    if (done === null) return
    toast.success(GROUPS_TAGS.done(done.changed.length))
    close()
  }

  const fold = (t: string) => t.trim().toLowerCase()
  const offered = tag.trim() ? (tags.data ?? []).map((t) => t.tag).filter((t) => fold(t).startsWith(fold(tag)) && fold(t) !== fold(tag)).slice(0, 8) : []
  const report = preview?.report ?? null
  const current = preview !== null && preview.key === key
  const carried = [...new Set(ctx.questions.flatMap((q) => q.tags ?? []))].sort()
  // Group…: an unchanged question is either in that group already or not in this domain at all.
  const outside = open?.op === 'group' && report ? report.unchanged.filter((id) => !ctx.domain?.questions.some((m) => m.questionId === id)).length : 0
  const already = (n: number) => {
    if (!open || n === 0) return null
    const what = {
      tag: GROUPS_TAGS.alreadyTagged(tag.trim()),
      untag: GROUPS_TAGS.alreadyUntagged(choice ?? ''),
      group: GROUPS_TAGS.alreadyGrouped,
      add_to_domain: GROUPS_TAGS.alreadyInDomain,
      remove_from_domain: GROUPS_TAGS.alreadyOut,
      set_difficulty: GROUPS_TAGS.alreadyDifficulty,
    }[open.op]
    return GROUPS_TAGS.already(n, what)
  }

  const dialog = (
    <AlertDialog.Backdrop isOpen={open !== null} onOpenChange={(o) => (o ? undefined : close())} isDismissable={false} isKeyboardDismissDisabled={false}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{open ? TITLE[open.op] : ''}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="flex flex-col gap-3" data-bulk-edit={open?.op}>
              {open?.op === 'tag' ? (
                <>
                  <TextField label={GROUPS_TAGS.pickTag} description={GROUPS_TAGS.pickTagHint} value={tag} onChange={setTag} autoFocus maxLength={40} />
                  {offered.length > 0 ? (
                    <div className="flex flex-wrap gap-1.5" role="group" aria-label={GROUPS_TAGS.tagsOffered}>
                      {offered.map((k) => (
                        <button
                          key={k}
                          type="button"
                          className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--surface-secondary)] focus-visible:outline-2 focus-visible:outline-[var(--focus)]"
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={() => setTag(k)}
                        >
                          <Text variant="studio-caption">{k}</Text>
                        </button>
                      ))}
                    </div>
                  ) : null}
                </>
              ) : null}
              {open?.op === 'untag' ? (
                <SelectField label={GROUPS_TAGS.pickTag} value={choice} onChange={setChoice} options={carried.map((t) => ({ value: t, label: t }))} />
              ) : null}
              {open?.op === 'group' ? (
                <SelectField
                  label={GROUPS_TAGS.pickGroup}
                  value={choice}
                  onChange={setChoice}
                  options={[{ value: '~none', label: GROUPS_TAGS.noGroup }, ...(ctx.domain?.groups ?? []).map((g) => ({ value: g.id, label: g.name }))]}
                />
              ) : null}
              {open?.op === 'add_to_domain' ? (
                <SelectField
                  label={GROUPS_TAGS.pickDomain}
                  value={choice}
                  onChange={setChoice}
                  options={(domains.data ?? []).filter((d) => d.id !== ctx.domain?.id).map((d) => ({ value: d.id, label: d.name }))}
                />
              ) : null}
              {open?.op === 'remove_from_domain' ? (
                <Text as="p" variant="studio-body" tone="muted">
                  {GROUPS_TAGS.removeBody}
                </Text>
              ) : null}
              {open?.op === 'set_difficulty' ? (
                <>
                  <DifficultyField value={unset ? null : difficulty} onChange={setDifficulty} isDisabled={unset} />
                  <CheckboxField label={GROUPS_TAGS.notSet} isSelected={unset} onChange={setUnset} />
                  <Text as="p" variant="studio-caption" tone="muted">
                    {GROUPS_TAGS.difficultyNote}
                  </Text>
                </>
              ) : null}
              <div role="status" aria-live="polite" className="flex flex-col gap-1">
                {report ? (
                  <>
                    <Text as="p" variant="studio-body">
                      {GROUPS_TAGS.applyTo(report.changed.length)}
                    </Text>
                    {already(report.unchanged.length - outside) ? (
                      <Text as="p" variant="studio-body" tone="muted">
                        {already(report.unchanged.length - outside)}
                      </Text>
                    ) : null}
                    {outside > 0 ? (
                      <Text as="p" variant="studio-body" tone="muted">
                        {GROUPS_TAGS.notInDomain(outside)}
                      </Text>
                    ) : null}
                  </>
                ) : null}
                {refusal ? (
                  <Text as="p" variant="studio-body" tone="danger">
                    {refusal}
                  </Text>
                ) : null}
              </div>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={close} isDisabled={pending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="primary" onPress={() => void apply()} isPending={pending} isDisabled={!report || report.changed.length === 0 || refusal !== null}>
              {GROUPS_TAGS.apply}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )

  const menu: BulkEditController['menu'] = (ids, context) => {
    const inside = context.domain !== null
    const items: { id: Op; label: string }[] = [
      { id: 'tag', label: GROUPS_TAGS.bulkTag },
      { id: 'untag', label: GROUPS_TAGS.bulkUntag },
      ...(inside ? [{ id: 'group' as const, label: GROUPS_TAGS.bulkGroup }] : []),
      { id: 'add_to_domain', label: GROUPS_TAGS.bulkAdd },
      ...(inside ? [{ id: 'remove_from_domain' as const, label: GROUPS_TAGS.bulkRemove }] : []),
      { id: 'set_difficulty', label: GROUPS_TAGS.bulkDifficulty },
    ]
    return (
      <Dropdown>
        <Button size="sm" variant="secondary" icon="edit">
          {GROUPS_TAGS.edit}
        </Button>
        <Dropdown.Popover placement="bottom start">
          <Dropdown.Menu aria-label={GROUPS_TAGS.edit} onAction={(k) => start(String(k) as Op, ids, context)}>
            {items.map((i) => (
              <Dropdown.Item key={i.id} id={i.id} textValue={i.label}>
                <Label>{i.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>
    )
  }

  return { menu, dialog }
}
