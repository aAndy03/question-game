import { useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog } from '@/molecules'
import { CONFIRM } from '@/copy'
import { command } from '@/host/host'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import type { LibraryKind } from '@/host/types'

export interface ArchiveRequest {
  readonly kind: LibraryKind | 'recipe'
  readonly ids: readonly string[]
  readonly what: string
}

export interface ArchiveController {
  /** Ask, then archive. Bulk is one confirm for the batch (spec §2.19). */
  archive(request: ArchiveRequest): void
  /** Restore needs no confirm: it undoes an archive. */
  restore(request: ArchiveRequest): Promise<void>
  readonly isPending: boolean
  /** Mount once on the page. */
  readonly dialog: ReactNode
}

/**
 * Archive with the §4.1 courtesy: `referenced_by` first, so the confirm can
 * say what still uses the row; arm→confirm when it is used. Recipes have
 * their own verbs, so the kind decides the command.
 */
export function useArchive(): ArchiveController {
  const run = useHostCommand()
  const [pending, setPending] = useState(false)
  const [request, setRequest] = useState<ArchiveRequest | null>(null)
  // What uses the rows, as the host says it in one sentence; `undefined`
  // while it is asked, and the confirm stays armed until it knows.
  const [referenced, setReferenced] = useState<string | null | undefined>(null)
  const asked = useRef<ArchiveRequest | null>(null)

  // What uses the rows, by name — for one row or all of a selection (beta.3:
  // a bulk archive said nothing about the games it would leave holding an
  // archived row). Only the newest request's answer is kept.
  const archive = (req: ArchiveRequest) => {
    asked.current = req
    setRequest(req)
    if (req.kind === 'recipe') return setReferenced(null)
    setReferenced(undefined)
    void command<string | null>('referenced_by', { kind: req.kind, ids: req.ids })
      .catch(() => null)
      .then((by) => {
        if (asked.current === req) setReferenced(by)
      })
  }

  const confirm = async () => {
    if (!request) return
    setPending(true)
    if (request.kind === 'recipe') {
      for (const id of request.ids) await run('recipe_archive', { id })
    } else if (request.ids.length === 1) {
      await run('catalog_archive', { kind: request.kind, id: request.ids[0] })
    } else {
      await run('catalog_archive_many', { kind: request.kind, ids: request.ids })
    }
    setPending(false)
    setRequest(null)
    toast.info(n === 1 ? `Archived 1 ${request.what}` : `Archived ${n} ${request.what}`)
  }

  const restore = async (req: ArchiveRequest) => {
    setPending(true)
    if (req.kind === 'recipe') {
      for (const id of req.ids) await run('recipe_restore', { id })
    } else if (req.ids.length === 1) {
      await run('catalog_restore', { kind: req.kind, id: req.ids[0] })
    } else {
      await run('catalog_restore_many', { kind: req.kind, ids: req.ids })
    }
    setPending(false)
    toast.info(req.ids.length === 1 ? `Restored 1 ${req.what}` : `Restored ${req.ids.length} ${req.what}`)
  }

  const n = request?.ids.length ?? 0
  const dialog = request ? (
    <ConfirmDialog
      isOpen
      onOpenChange={(open) => !open && setRequest(null)}
      title={n === 1 ? CONFIRM.archiveOne(request.what) : CONFIRM.archiveMany(n, request.what)}
      body={
        referenced
          ? `${n === 1 ? CONFIRM.referencedBy(referenced) : CONFIRM.referencedByMany(referenced)} ${CONFIRM.archiveBody}`
          : CONFIRM.archiveBody
      }
      severity="danger"
      confirmLabel={CONFIRM.arm}
      arm={referenced !== null}
      armedLabel={CONFIRM.armed}
      isPending={pending}
      onConfirm={confirm}
    />
  ) : null

  return { archive, restore, isPending: pending, dialog }
}
