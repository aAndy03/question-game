import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Modal } from '@heroui/react'
import { Button, CheckboxField, Text } from '@/atoms'
import { EmptyState, GroupHeader, PageFooter } from '@/molecules'
import { LIST, PICKER } from '@/copy'
import { useChromeStore, EMPTY_LIST_STATE, useListState } from '@/chrome/chrome'
import { footerText, listView, type ListItem, type ListSpec } from '@/host/listView'
import { useListView } from '@/host/useListView'
import { ListToolbar } from './ListToolbar'

/** What a picker row shows. */
export interface PickerRow {
  readonly title: string
  readonly subtitle?: string | undefined
  readonly chips?: ReactNode
}

export interface PickerDialogProps<T> {
  isOpen: boolean
  onClose(): void
  title: string
  /** A picker spec (`tab: 'pick…'`): its own filters, groups and session view. */
  spec: ListSpec<T>
  items: readonly ListItem<T, PickerRow>[]
  /** The game's membership now, in its order: what the dialog starts from. */
  initial: readonly string[]
  /**
   * Why a row cannot be ticked, given what is chosen so far — `null` when it
   * can. A chosen row is never disabled, so it can always come off.
   */
  disabledReason?: ((id: string, chosen: ReadonlySet<string>) => string | null) | undefined
  onApply(chosen: readonly string[]): Promise<void>
  isPending?: boolean | undefined
}

const fold = (s: string) => s.trim().toLowerCase()

/**
 * A choice of rows on the list-view model (beta.4: *Add teams…*, *Add
 * domains…*, *Choose questions…*): the library toolbar's search, filters,
 * sort and grouping, pages of 100, a checkbox per row, per group and per
 * page. What is ticked is the dialog's own — it starts as the game's
 * membership and survives every filter, search and page, unlike a library
 * selection, which a filter clears; *Apply* writes it once.
 *
 * Order: the rows already chosen keep their place, new ones follow in the
 * order they were ticked — the roster's play order is that list.
 */
export function PickerDialog<T>({ isOpen, onClose, title, spec, items, initial, disabledReason, onApply, isPending }: PickerDialogProps<T>) {
  const [chosen, setChosen] = useState<readonly string[]>(initial)
  const setListState = useChromeStore((s) => s.setListState)
  const session = useListState(spec.tab)

  // Each opening starts from the game and from a clean view: a search left
  // from the last time would hide rows the operator expects to see.
  useEffect(() => {
    if (!isOpen) return
    setChosen(initial)
    setListState(spec.tab, EMPTY_LIST_STATE)
    // `initial` is read at opening only: a write while open must not reset the ticks.
  }, [isOpen, spec.tab, setListState])

  // Search here is the row's own words, folded — the catalog's index is not
  // asked about a list the dialog already holds.
  const hits = useMemo(() => {
    const needle = fold(session.search)
    if (!needle) return null
    return new Map(items.filter((i) => fold(`${i.view.title} ${i.view.subtitle ?? ''}`).includes(needle)).map((i) => [i.id, 1]))
  }, [items, session.search])
  const view = useListView(spec, items, hits)
  const { page } = view

  const set = useMemo(() => new Set(chosen), [chosen])
  const reason = (id: string, within: ReadonlySet<string> = set) => (within.has(id) ? null : (disabledReason?.(id, within) ?? null))

  // Every row of every group, on every page: *select all in this group* means the whole group.
  const groupIds = useMemo(() => {
    const all = listView(items, spec, { ...view.state, page: 1, pageSize: 'all', collapsed: new Set() })
    const out = new Map<string, string[]>()
    for (const e of all.entries) if (e.kind === 'row') out.set(e.row.groupKey ?? '', [...(out.get(e.row.groupKey ?? '') ?? []), e.row.item.id])
    return out
  }, [items, spec, view.state])

  const toggle = (id: string, on: boolean) => setChosen((now) => (on ? (now.includes(id) ? now : [...now, id]) : now.filter((x) => x !== id)))
  /** Tick what can be ticked, in list order — each pick may close a difficulty for the next. */
  const tickAll = (ids: readonly string[]) =>
    setChosen((now) => {
      const next = [...now]
      const within = new Set(now)
      for (const id of ids) {
        if (within.has(id) || reason(id, within) !== null) continue
        next.push(id)
        within.add(id)
      }
      return next
    })
  const untickAll = (ids: readonly string[]) => setChosen((now) => now.filter((x) => !ids.includes(x)))
  /** Checked when nothing more in it can be ticked; mixed when some is. */
  const stateOf = (ids: readonly string[]) => {
    const some = ids.some((id) => set.has(id))
    const full = some && ids.every((id) => set.has(id) || reason(id) !== null)
    return { some, full }
  }
  const groupCheckbox = (ids: readonly string[], label: string) => {
    const { some, full } = stateOf(ids)
    return (
      <CheckboxField
        label={label}
        hideLabel
        isSelected={full}
        isIndeterminate={some && !full}
        onChange={(on) => (on ? tickAll(ids) : untickAll(ids))}
        isDisabled={ids.length === 0}
      />
    )
  }

  const changed = chosen.length !== initial.length || chosen.some((id, i) => initial[i] !== id)
  const apply = async () => {
    await onApply(chosen)
    onClose()
  }

  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg">
        <Modal.Dialog>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="flex flex-col gap-3">
            <ListToolbar view={view as never} what={spec.noun.many} />
            <div className="flex items-center gap-2 px-2">
              {groupCheckbox(page.pageIds, LIST.selectAll)}
              <Text variant="studio-caption" tone="muted">
                {PICKER.chosen(chosen.length)}
              </Text>
            </div>
            {page.entries.length === 0 ? (
              <EmptyState kind={items.length === 0 ? 'empty' : 'noResults'} what={spec.noun.many} compact />
            ) : (
              <ul className="flex flex-col">
                {page.entries.map((e) =>
                  e.kind === 'header' ? (
                    <li key={`h:${e.group.key}`} className="flex items-center gap-1">
                      <span className="pl-2">{groupCheckbox(groupIds.get(e.group.key) ?? [], PICKER.selectGroup(e.group.label))}</span>
                      <div className="min-w-0 flex-1">
                        <GroupHeader
                          label={e.group.label}
                          count={e.group.count}
                          continued={e.group.continued}
                          collapsed={e.group.collapsed}
                          onToggle={() => view.toggleCollapsed(e.group.key)}
                        />
                      </div>
                    </li>
                  ) : (
                    <li key={e.row.key} className="flex min-h-10 items-center gap-3 rounded px-2 hover:bg-[var(--surface-secondary)]" data-blocked={reason(e.row.item.id) ? '' : undefined}>
                      <CheckboxField
                        label={e.row.item.view.title}
                        hideLabel
                        isSelected={set.has(e.row.item.id)}
                        onChange={(on) => toggle(e.row.item.id, on)}
                        disabledReason={reason(e.row.item.id)}
                      />
                      <div className="flex min-w-0 flex-1 flex-col">
                        <Text variant="studio-body" truncate>
                          {e.row.item.view.title}
                        </Text>
                        {e.row.item.view.subtitle ? (
                          <Text variant="studio-caption" tone="muted" truncate>
                            {e.row.item.view.subtitle}
                          </Text>
                        ) : null}
                      </div>
                      {e.row.item.view.chips}
                    </li>
                  ),
                )}
              </ul>
            )}
            <PageFooter
              page={page.page}
              pageCount={page.pageCount}
              text={footerText(page, spec.noun)}
              pageSize={view.state.pageSize}
              onPage={view.setPage}
              onPageSize={view.setPageSize}
            />
          </Modal.Body>
          <Modal.Footer>
            <Button variant="tertiary" onPress={onClose} isDisabled={isPending}>
              {PICKER.cancel}
            </Button>
            <Button variant="primary" onPress={() => void apply()} isPending={isPending} isDisabled={!changed}>
              {PICKER.apply}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
