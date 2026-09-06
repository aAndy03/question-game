import { useState, type ReactNode } from 'react'
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
  const [referenced, setReferenced] = useState<string | null>(null)

  const archive = (req: ArchiveRequest) => {
    setReferenced(null)
    setRequest(req)
    if (req.kind !== 'recipe' && req.ids.length === 1) {
      const id = req.ids[0]
      if (id) {
        command<string | null>('referenced_by', { kind: req.kind, id })
          .then((by) => setReferenced(by))
          .catch(() => setReferenced(null))
      }
    }
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
      body={referenced ? `${CONFIRM.referencedBy(referenced)} ${CONFIRM.archiveBody}` : CONFIRM.archiveBody}
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
