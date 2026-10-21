import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog, Dropdown, Label } from '@heroui/react'
import { Button, CheckboxField, SelectField, Text, TextField } from '@/atoms'
import { DifficultyField } from '@/molecules'
import { toast } from '@/chrome/toast'
import { CONFIRM } from '@/copy'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useHostCommand } from '@/host/commands'
import { command, type HostError } from '@/host/host'
import { useCatalogList } from '@/host/queries'
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
 * many it changes, how many are already so, how many are shared — before the
 * one-transaction write. Copies in other workspaces are not touched.
 */
export function useBulkEdit(): BulkEditController {
  const run = useHostCommand()
  const domains = useCatalogList('domain', 'active')
  const [open, setOpen] = useState<Open | null>(null)
  const [ctx, setCtx] = useState<BulkEditContext>({ domain: null, questions: [] })
  const [tag, setTag] = useState('')
  const [choice, setChoice] = useState<string | null>(null)
  const [difficulty, setDifficulty] = useState<number | null>(50)
  const [unset, setUnset] = useState(false)
  const [preview, setPreview] = useState<BulkReport | null>(null)
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
    setPreview(null)
    setRefusal(null)
    if (!open || !edit) return
    let live = true
    command<BulkReport>('catalog_bulk_edit', { ids: open.ids, edit, preview: true })
      .then((r) => live && setPreview(r))
      .catch((e: HostError) => live && setRefusal(e.message.replace(/^[^:]*:\s*/, '')))
    return () => {
      live = false
    }
    // `key` stands for `edit`, which is rebuilt on every render.
  }, [open, key])

  const start = (op: Op, ids: readonly string[], context: BulkEditContext) => {
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
    const done = await run<BulkReport>('catalog_bulk_edit', { ids: open.ids, edit, preview: false })
    setPending(false)
    if (done === null) return
    toast.success(GROUPS_TAGS.done(done.changed.length))
    close()
  }

  const carried = [...new Set(ctx.questions.flatMap((q) => q.tags ?? []))].sort()
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
              {open?.op === 'tag' ? <TextField label={GROUPS_TAGS.pickTag} value={tag} onChange={setTag} autoFocus maxLength={40} /> : null}
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
                {preview ? (
                  <>
                    <Text as="p" variant="studio-body">
                      {GROUPS_TAGS.applyTo(preview.changed.length)}
                    </Text>
                    {already(preview.unchanged.length) ? (
                      <Text as="p" variant="studio-body" tone="muted">
                        {already(preview.unchanged.length)}
                      </Text>
                    ) : null}
                    {preview.shared > 0 ? (
                      <Text as="p" variant="studio-body" tone="warning">
                        {GROUPS_TAGS.sharedReach(preview.shared)}
                      </Text>
                    ) : null}
                    {(open?.op === 'remove_from_domain' || open?.op === 'group') && ctx.domain?.shared ? (
                      <Text as="p" variant="studio-body" tone="warning">
                        {GROUPS_TAGS.sharedDomainReach}
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
            <Button variant="primary" onPress={() => void apply()} isPending={pending} isDisabled={!preview || preview.changed.length === 0 || refusal !== null}>
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
