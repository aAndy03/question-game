import { AlertDialog } from '@heroui/react'
import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'
import type { EditScope } from '@/host/types'

export interface ScopeConfirmProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  /** What is being changed, for the body: "the stem of this question". */
  subject?: string | undefined
  isPending?: boolean | undefined
  onChoose: (scope: EditScope) => void | Promise<void>
}

/** Cancel · This game only · Apply to original (spec §2.17). */
export function ScopeConfirm({ isOpen, onOpenChange, subject, isPending, onChoose }: ScopeConfirmProps) {
  const choose = async (scope: EditScope) => {
    await onChoose(scope)
    onOpenChange(false)
  }
  return (
    <AlertDialog>
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false} isKeyboardDismissDisabled={false}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status="accent" />
              <AlertDialog.Heading>{CONFIRM.scopeTitle}</AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body>{subject ? `${CONFIRM.scopeBody} (${subject})` : CONFIRM.scopeBody}</AlertDialog.Body>
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => onOpenChange(false)} isDisabled={isPending}>
                {CONFIRM.cancel}
              </Button>
              <Button variant="secondary" onPress={() => void choose('original')} isPending={isPending}>
                {CONFIRM.original}
              </Button>
              <Button variant="primary" onPress={() => void choose('this_game')} isPending={isPending} autoFocus>
                {CONFIRM.thisGame}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
