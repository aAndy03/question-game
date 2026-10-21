import { useState } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { ActionMenu, ConfirmDialog, NameDialog } from '@/molecules'
import { toast } from '@/chrome/toast'
import { GROUPS_TAGS } from '@/copy/groupsTags'
import { useHostCommand } from '@/host/commands'
import { command } from '@/host/host'
import { useTags } from '@/host/queries'
import type { BulkReport, TagCount } from '@/host/types'

export interface ManageTagsDialogProps {
  isOpen: boolean
  onClose: () => void
}

/**
 * *Manage tags* (P15): every tag on the questions in view, with how many
 * carry it. Rename (to an existing tag merges them) and Delete each confirm
 * with the count. Only this workspace's questions change.
 */
export function ManageTagsDialog({ isOpen, onClose }: ManageTagsDialogProps) {
  const tags = useTags()
  const run = useHostCommand()
  const [renaming, setRenaming] = useState<TagCount | null>(null)
  const [deleting, setDeleting] = useState<TagCount | null>(null)
  const list = tags.data ?? []

  return (
    <>
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={(o) => (o ? undefined : onClose())} isDismissable isKeyboardDismissDisabled={false}>
        <AlertDialog.Container size="md">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Heading>{GROUPS_TAGS.manageTitle}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>
              <div className="flex flex-col gap-3" data-manage-tags>
                <Text as="p" variant="studio-body" tone="muted">
                  {list.length === 0 ? GROUPS_TAGS.noTagsYet : GROUPS_TAGS.manageBody}
                </Text>
                <ul className="flex max-h-[50vh] flex-col gap-1 overflow-y-auto">
                  {list.map((t) => (
                    <li key={t.tag} className="flex items-center gap-2">
                      <Text variant="studio-body" className="flex-1" truncate>
                        {t.tag}
                      </Text>
                      <Text variant="studio-caption" tone="muted">
                        {GROUPS_TAGS.carried(t.questions)}
                      </Text>
                      <ActionMenu
                        label={`${GROUPS_TAGS.tag}: ${t.tag}`}
                        items={[
                          { id: 'rename', label: GROUPS_TAGS.rename },
                          { id: 'delete', label: GROUPS_TAGS.deleteTag, isDanger: true },
                        ]}
                        onAction={(a) => (a === 'rename' ? setRenaming(t) : setDeleting(t))}
                      />
                    </li>
                  ))}
                </ul>
              </div>
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={onClose}>
                {GROUPS_TAGS.close}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
      <NameDialog
        isOpen={renaming !== null}
        onOpenChange={(o) => (o ? undefined : setRenaming(null))}
        title={renaming ? GROUPS_TAGS.renameTitle(renaming.tag) : ''}
        label={GROUPS_TAGS.renameTo}
        initial={renaming?.tag ?? ''}
        confirmLabel={GROUPS_TAGS.save}
        onSubmit={async (to) => {
          if (!renaming) return
          const done = await command<BulkReport>('tag_rename', { from: renaming.tag, to, preview: false })
          const into = list.find((t) => t.tag.toLowerCase() === to.trim().toLowerCase() && t.tag !== renaming.tag)
          toast.success(into ? GROUPS_TAGS.mergeNote(into.tag, done.changed.length) : GROUPS_TAGS.done(done.changed.length))
        }}
      />
      <ConfirmDialog
        isOpen={deleting !== null}
        onOpenChange={(o) => (o ? undefined : setDeleting(null))}
        title={deleting ? GROUPS_TAGS.deleteTagTitle(deleting.tag) : ''}
        body={
          deleting
            ? GROUPS_TAGS.deleteTagBody(deleting.questions)
            : undefined
        }
        confirmLabel={GROUPS_TAGS.deleteTag}
        onConfirm={async () => {
          if (!deleting) return true
          return run.ok('tag_delete', { tag: deleting.tag, preview: false })
        }}
      />
    </>
  )
}
