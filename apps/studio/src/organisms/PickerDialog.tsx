import { useEffect, useMemo, useState } from 'react'
import { Modal } from '@heroui/react'
import { Button, IconButton, Text } from '@/atoms'
import { PICKER } from '@/copy'
import { useChromeStore, EMPTY_LIST_STATE } from '@/chrome/chrome'
import type { ListItem, ListSpec } from '@/host/listView'
import { PickList, type PickerRow } from './PickList'

export type { PickerRow } from './PickList'

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
  /** `false`: the host refused; the dialog stays open with the ticks. */
  onApply(chosen: readonly string[]): Promise<boolean>
  isPending?: boolean | undefined
  /**
   * How the Chosen pane orders what is ticked (P20): as ticked by default —
   * the roster's play order; questions pass their easy→hard walk.
   */
  chosenOrder?: ((ids: readonly string[]) => readonly string[]) | undefined
  /** Short rows (teams, domains) run in two columns where there is room. */
  columns?: 1 | 2 | undefined
}

const CHOSEN_SHOWN = 100

/**
 * A choice of rows (beta.4: *Add teams…*, *Add domains…*, *Choose
 * questions…*), the window's width (P20): `PickList` — search, filters, sort,
 * groups, a checkbox per row, per group and per page — beside a **Chosen**
 * pane that lists what is ticked in its order, each with a remove button. What
 * is ticked is the dialog's own — it starts as the game's membership and
 * survives every filter, search and page; *Apply* writes it once.
 *
 * Order: the rows already chosen keep their place, new ones follow in the
 * order they were ticked — the roster's play order is that list.
 */
export function PickerDialog<T>({ isOpen, onClose, title, spec, items, initial, disabledReason, onApply, isPending, chosenOrder, columns }: PickerDialogProps<T>) {
  const [chosen, setChosen] = useState<readonly string[]>(initial)
  const [wasOpen, setWasOpen] = useState(isOpen)
  const setListState = useChromeStore((s) => s.setListState)

  // Each opening starts from the game, set while rendering the opening so
  // the last opening's ticks never show for a frame (review). `initial` is
  // read at opening only: a write while open must not reset the ticks.
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen)
    if (isOpen) setChosen(initial)
  }
  // And from a clean view: a search left from the last time would hide rows.
  useEffect(() => {
    if (isOpen) setListState(spec.tab, EMPTY_LIST_STATE)
  }, [isOpen, spec.tab, setListState])

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i.view])), [items])
  const ordered = chosenOrder ? chosenOrder(chosen) : chosen
  const changed = chosen.length !== initial.length || chosen.some((id, i) => initial[i] !== id)
  const apply = async () => {
    if (await onApply(chosen)) onClose()
  }

  return (
    // Ticks are not lost to a stray click outside or Esc: only Cancel drops them (review).
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()} isDismissable={!changed} isKeyboardDismissDisabled={changed}>
      <Modal.Container size="lg">
        {/* The window's width and a fixed height (P20): filtering never makes the frame jump. */}
        <Modal.Dialog className="h-[min(52rem,calc(100vh-4rem))] w-full max-w-[min(72rem,calc(100vw-4rem))]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
          </Modal.Header>
          <Modal.Body className="@container/pickdialog flex min-h-0 flex-1 overflow-hidden">
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-4 @[52rem]/pickdialog:grid-cols-[minmax(0,1fr)_18rem]">
              <PickList spec={spec} items={items} chosen={chosen} onChosen={setChosen} disabledReason={disabledReason} count={PICKER.chosen(chosen.length)} columns={columns} />
              <aside aria-label={PICKER.chosenTitle} className="hidden min-h-0 flex-col gap-2 border-l border-[var(--separator)] pl-4 @[52rem]/pickdialog:flex" data-chosen-pane>
                <Text as="h3" variant="studio-subheading">
                  {`${PICKER.chosenTitle} · ${chosen.length}`}
                </Text>
                {chosen.length === 0 ? (
                  <Text variant="studio-caption" tone="muted">
                    {PICKER.noneChosen}
                  </Text>
                ) : (
                  <ol className="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
                    {ordered.slice(0, CHOSEN_SHOWN).map((id, i) => {
                      const row = byId.get(id)
                      return (
                        <li key={id} className="flex min-h-9 items-center gap-2 rounded px-1.5 hover:bg-[var(--surface-secondary)]">
                          <Text variant="studio-mono" tone="muted" className="w-6 shrink-0 text-right" tabular>
                            {i + 1}
                          </Text>
                          <Text variant="studio-body" truncate className="min-w-0 flex-1" title={row?.title ?? id}>
                            {row?.title ?? id}
                          </Text>
                          {row?.chips}
                          <IconButton icon="close" size="sm" label={PICKER.unchoose(row?.title ?? id)} onPress={() => setChosen((now) => now.filter((x) => x !== id))} />
                        </li>
                      )
                    })}
                    {ordered.length > CHOSEN_SHOWN ? (
                      <li className="px-1.5 py-1">
                        <Text variant="studio-caption" tone="muted">
                          {PICKER.moreChosen(ordered.length - CHOSEN_SHOWN)}
                        </Text>
                      </li>
                    ) : null}
                  </ol>
                )}
              </aside>
            </div>
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
