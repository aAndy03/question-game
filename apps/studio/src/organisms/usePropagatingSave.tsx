import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { CONFIRM } from '@/copy'
import { PROPAGATE } from '@/copy/workspaces'
import { useHostCommand, type RunOptions } from '@/host/commands'
import { command } from '@/host/host'
import type { CatalogItem, FamilyCopy, PropagationPreview } from '@/host/types'

type Choice = 'here' | 'also' | 'cancel'

export interface PropagatingSave {
  /**
   * \`catalog_upsert\`, unless the row has copies: then the operator chooses
   * *Save here only* or *Also update {n} copies* first. \`null\` when the host
   * refused or the operator cancelled — the row was not saved either way.
   */
  upsert(item: CatalogItem, options?: RunOptions): Promise<unknown>
  /**
   * Only the question, without the write (beta.3, the question editor): `none`
   * when the row has no copies to ask about, else what the operator chose.
   */
  decide(item: CatalogItem, options?: RunOptions): Promise<'none' | Choice>
  dialog: ReactNode
}

const where = (c: FamilyCopy) => c.workspaceName ?? c.workspace

/**
 * The editors' save when a row is in a family (Beta 2.0): the confirm sits in
 * the editor's own frame, names where the copies live, and says which would
 * be skipped and why. A row that was never copied saves as it always did.
 */
export function usePropagatingSave(): PropagatingSave {
  const run = useHostCommand()
  const [preview, setPreview] = useState<PropagationPreview | null>(null)
  const answer = useRef<((choice: Choice) => void) | null>(null)

  // An editor that unmounts with the question open has its save cancelled, not left hanging.
  useEffect(() => () => answer.current?.('cancel'), [])

  const choose = (choice: Choice) => {
    answer.current?.(choice)
    answer.current = null
    setPreview(null)
  }

  const decide: PropagatingSave['decide'] = async (item, options) => {
    if (answer.current) return 'cancel'
    if (item.item.familyId == null) return 'none'
    // A preview the host refused is said, and nothing is written: saving
    // without the question would leave the copies behind unasked (review).
    const plan = await run<PropagationPreview>('catalog_propagation_preview', { item }, options)
    if (plan === null) return 'cancel'
    if (plan.update.length === 0 && plan.skipped.length === 0) return 'none'
    return new Promise<Choice>((resolve) => {
      answer.current = resolve
      setPreview(plan)
    })
  }

  const upsert: PropagatingSave['upsert'] = async (item, options) => {
    // A second save while the question is open is not a second question.
    if (answer.current) return null
    if (item.item.familyId == null) return run('catalog_upsert', { item }, options)
    let plan: PropagationPreview
    try {
      plan = await command<PropagationPreview>('catalog_propagation_preview', { item })
    } catch {
      // The save itself will say what is wrong with the row.
      return run('catalog_upsert', { item }, options)
    }
    if (plan.update.length === 0 && plan.skipped.length === 0) return run('catalog_upsert', { item }, options)
    const choice = await new Promise<Choice>((resolve) => {
      answer.current = resolve
      setPreview(plan)
    })
    if (choice === 'cancel') return null
    return choice === 'here' ? run('catalog_upsert', { item }, options) : run('catalog_upsert_propagating', { item }, options)
  }

  const names = preview ? [...new Set([...preview.update.map(where), ...preview.skipped.map((s) => where(s.copy))])].join(', ') : ''
  const dialog = (
    <AlertDialog.Backdrop isOpen={preview !== null} onOpenChange={(o) => (o ? undefined : choose('cancel'))} isDismissable={false} isKeyboardDismissDisabled={false}>
      <AlertDialog.Container size="md">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{PROPAGATE.title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <div className="flex flex-col gap-2" data-propagate-dialog>
              <Text as="p" variant="studio-body">
                {PROPAGATE.body(names)}
              </Text>
              {preview?.skipped.map((s) => (
                <Text key={s.copy.id} as="p" variant="studio-body" tone="warning">
                  {PROPAGATE.skipped(where(s.copy), s.reason)}
                </Text>
              ))}
            </div>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={() => choose('cancel')}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="secondary" onPress={() => choose('here')}>
              {PROPAGATE.hereOnly}
            </Button>
            <Button variant="primary" onPress={() => choose('also')} isDisabled={(preview?.update.length ?? 0) === 0} autoFocus>
              {PROPAGATE.alsoCopies(preview?.update.length ?? 0, preview?.skipped.length ?? 0)}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )

  return { upsert, decide, dialog }
}
