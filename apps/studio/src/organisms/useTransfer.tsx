import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog, Dropdown, Label } from '@heroui/react'
import { Button, SelectField, SwitchField, Text } from '@/atoms'
import { toast } from '@/chrome/toast'
import { CONFIRM } from '@/copy'
import { TRANSFER } from '@/copy/workspaces'
import { useHostCommand } from '@/host/commands'
import { command, type HostError } from '@/host/host'
import { useCatalogList, useWorkspaces } from '@/host/queries'
import type { Selection, TransferOp, TransferReport } from '@/host/types'
import { workspaceName } from './WorkspaceSwitcher'

interface Open {
  readonly op: TransferOp
  readonly selection: Selection
}

export interface TransferController {
  /** Ask about a copy or a move; the dialog previews before it writes. */
  open(op: TransferOp, selection: Selection): void
  /** The two verbs as one menu button, for a bulk bar. */
  menu(selection: Selection): ReactNode
  dialog: ReactNode
}

const COMMAND: Record<TransferOp, 'catalog_copy_to' | 'catalog_move_to'> = {
  copy: 'catalog_copy_to',
  move: 'catalog_move_to',
}
const TITLE: Record<TransferOp, string> = {
  copy: TRANSFER.copyTitle,
  move: TRANSFER.moveTitle,
}
const CONFIRM_LABEL: Record<TransferOp, string> = {
  copy: TRANSFER.confirmCopy,
  move: TRANSFER.confirmMove,
}

const picked = (s: Selection) => (s.teams?.length ?? 0) + (s.domains?.length ?? 0) + (s.questions?.length ?? 0) + (s.recipes?.length ?? 0)

/**
 * Copy to… · Move to… (Beta 2.0, 05_STUDIO_DESIGN.md §21; the shared library
 * went in beta.2). Both preview first — what comes along, what is reused,
 * which domains a copied question joins or arrives in, what refuses and who
 * still uses it — through `transfer_preview`, which is the host's own write
 * rolled back, so the confirm cannot promise what the write will not do. A
 * refused move offers *Copy instead*. Copying questions offers *Bring their
 * domains*, on by default, so a question does not arrive in no domain.
 */
export function useTransfer(): TransferController {
  const run = useHostCommand()
  const workspaces = useWorkspaces()
  const domains = useCatalogList('domain', 'all')
  const [state, setState] = useState<Open | null>(null)
  const [target, setTarget] = useState<string | null>(null)
  const [withDomains, setWithDomains] = useState(true)
  const [preview, setPreview] = useState<TransferReport | null>(null)
  const [previewError, setPreviewError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const others = (workspaces.data?.workspaces ?? []).filter((w) => w.archivedAt === null && w.id !== workspaces.data?.current)
  // The list may arrive after the dialog opened: fall back to the first other workspace.
  const chosen = target ?? others[0]?.id ?? null
  const hasQuestions = (state?.selection.questions?.length ?? 0) > 0
  const askDomains = state?.op === 'copy' && hasQuestions

  useEffect(() => {
    setPreview(null)
    setPreviewError(null)
    if (!state || !chosen) return
    let live = true
    command<TransferReport>('transfer_preview', { op: state.op, selection: state.selection, target: chosen, withDomains })
      .then((r) => live && setPreview(r))
      .catch((e: HostError) => live && setPreviewError(e.message))
    return () => {
      live = false
    }
  }, [state, chosen, withDomains])

  const open = (op: TransferOp, selection: Selection) => {
    setState({ op, selection })
    setTarget(others[0]?.id ?? null)
    setWithDomains(true)
  }
  const close = () => {
    setState(null)
    setPending(false)
  }

  const confirm = async () => {
    if (!state) return
    setPending(true)
    const args = state.op === 'copy' ? { selection: state.selection, target: chosen, withDomains } : { selection: state.selection, target: chosen }
    const done = await run<TransferReport>(COMMAND[state.op], args)
    setPending(false)
    if (done === null) return
    toast.success(TRANSFER.done(picked(state.selection)))
    close()
  }

  const total = state ? picked(state.selection) : 0
  // A domain made to hold the copied questions is listed by name, not counted
  // as "came along"; the host says which those are (review: a domain a game
  // brought whole is not one).
  const homes = preview && askDomains ? (preview.homes ?? []) : []
  const homeIds = new Set(homes.map((t) => t.id))
  const came = preview ? [...preview.created, ...preview.moved].filter((t) => !t.picked && !homeIds.has(t.id)).length : 0
  const nameOf = (id: string) => domains.data?.find((d) => d.id === id)?.name ?? id
  const joined = (preview?.joined ?? []).map((t) => nameOf(t.from))
  const created = homes.map((t) => nameOf(t.from))
  const refused = preview?.refused ?? []
  const refusedLines = [...new Set(refused.map((r) => r.usedBy))]

  const dialog = (
    <AlertDialog.Backdrop isOpen={state !== null} onOpenChange={(o) => (o ? undefined : close())} isDismissable={false} isKeyboardDismissDisabled={false}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{state ? TITLE[state.op] : ''}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="flex flex-col gap-3" data-transfer-dialog={state?.op}>
              {others.length === 0 ? (
                <Text as="p" variant="studio-body" tone="muted">
                  {TRANSFER.noOther}
                </Text>
              ) : (
                <SelectField
                  label={TRANSFER.target}
                  value={chosen}
                  onChange={(v) => setTarget(v)}
                  options={others.map((w) => ({ value: w.id, label: workspaceName(w) }))}
                />
              )}
              {askDomains ? (
                <SwitchField label={TRANSFER.withDomains} description={TRANSFER.withDomainsHint} isSelected={withDomains} onChange={setWithDomains} />
              ) : null}
              <Text as="p" variant="studio-body">
                {TRANSFER.picked(total)}
              </Text>
              {came > 0 ? (
                <Text as="p" variant="studio-body" tone="muted">
                  {TRANSFER.comesAlong(came)}
                </Text>
              ) : null}
              {preview && preview.reused.length > 0 ? (
                <Text as="p" variant="studio-body" tone="muted">
                  {TRANSFER.reused(preview.reused.length)}
                </Text>
              ) : null}
              {preview && askDomains ? (
                <>
                  {joined.length > 0 ? (
                    <Text as="p" variant="studio-body" tone="muted">
                      {TRANSFER.joins(joined.join(', '))}
                    </Text>
                  ) : null}
                  {created.length > 0 ? (
                    <Text as="p" variant="studio-body" tone="muted">
                      {TRANSFER.creates(created.join(', '))}
                    </Text>
                  ) : null}
                  {!withDomains ? (
                    <Text as="p" variant="studio-body" tone="muted">
                      {TRANSFER.noDomain}
                    </Text>
                  ) : null}
                </>
              ) : null}
              <div role="status" aria-live="polite">
                {refusedLines.length > 0 ? (
                  <div className="flex flex-col gap-1">
                    <Text as="p" variant="studio-body" tone="danger">
                      {TRANSFER.refused}
                    </Text>
                    <ul className="list-disc pl-5">
                      {refusedLines.map((line) => (
                        <li key={line}>
                          <Text variant="studio-body">{line}</Text>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {previewError ? (
                  <Text as="p" variant="studio-body" tone="danger">
                    {previewError.replace(/^[^:]*:\s*/, '')}
                  </Text>
                ) : null}
              </div>
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={close} isDisabled={pending}>
              {CONFIRM.cancel}
            </Button>
            {state?.op === 'move' && refused.length > 0 ? (
              <Button variant="secondary" onPress={() => setState({ op: 'copy', selection: state.selection })}>
                {TRANSFER.copyInstead}
              </Button>
            ) : null}
            <Button
              variant="primary"
              onPress={() => void confirm()}
              isPending={pending}
              isDisabled={!preview || refused.length > 0 || previewError !== null || !chosen}
            >
              {state ? CONFIRM_LABEL[state.op] : ''}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )

  const menu: TransferController['menu'] = (selection) => (
    <Dropdown>
      <Button size="sm" variant="secondary" icon="transfer">
        {TRANSFER.menu}
      </Button>
      <Dropdown.Popover placement="bottom start">
        <Dropdown.Menu aria-label={TRANSFER.menu} onAction={(key) => open(String(key) as TransferOp, selection)}>
          <Dropdown.Item id="copy" textValue={TRANSFER.copyTo}>
            <Label>{TRANSFER.copyTo}</Label>
          </Dropdown.Item>
          <Dropdown.Item id="move" textValue={TRANSFER.moveTo}>
            <Label>{TRANSFER.moveTo}</Label>
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  )

  return { open, menu, dialog }
}
