import { AlertDialog } from '@heroui/react'
import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface DirtyGuardProps {
  isOpen: boolean
  isSaving?: boolean | undefined
  onSave: () => void | Promise<void>
  onDiscard: () => void
  onKeepEditing: () => void
}

/** Save / Discard / Keep editing, on every editor (spec §11.A). */
export function DirtyGuard({ isOpen, isSaving, onSave, onDiscard, onKeepEditing }: DirtyGuardProps) {
  // No `<AlertDialog>` root: the root exists to wire a trigger, and a
  // controlled dialog has none — it then mounts a PressResponder with no
  // pressable child and warns on every render. HeroUI v3's controlled example
  // starts at `AlertDialog.Backdrop` (docs: alert-dialog, "Controlled State").
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={(open) => (open ? undefined : onKeepEditing())} isDismissable={false}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status="warning" />
            <AlertDialog.Heading>{CONFIRM.dirtyTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>{CONFIRM.dirtyBody}</AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={onKeepEditing} isDisabled={isSaving}>
              {CONFIRM.keepEditing}
            </Button>
            <Button variant="danger" onPress={onDiscard} isDisabled={isSaving}>
              {CONFIRM.discard}
            </Button>
            <Button variant="primary" onPress={() => void onSave()} isPending={isSaving} autoFocus>
              {CONFIRM.save}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  
  )
}
