import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface ConfirmDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: ReactNode
  severity?: 'default' | 'warning' | 'danger'
  /** Label of the confirming button. */
  confirmLabel: string
  /** Two-click destructive confirm: first press arms, second runs (spec §14). */
  arm?: boolean | undefined
  armedLabel?: string | undefined
  cancelLabel?: string | undefined
  isPending?: boolean | undefined
  onConfirm: () => void | Promise<void>
}

/** One block the operator must face now: HeroUI `AlertDialog`. */
export function ConfirmDialog({
  isOpen,
  onOpenChange,
  title,
  body,
  severity = 'danger',
  confirmLabel,
  arm,
  armedLabel,
  cancelLabel = CONFIRM.cancel,
  isPending,
  onConfirm,
}: ConfirmDialogProps) {
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!isOpen) setArmed(false)
  }, [isOpen])

  const confirm = async () => {
    if (arm && !armed) {
      setArmed(true)
      return
    }
    await onConfirm()
    onOpenChange(false)
  }

  return (
    <AlertDialog>
      <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false} isKeyboardDismissDisabled={false}>
        <AlertDialog.Container size="sm">
          <AlertDialog.Dialog>
            <AlertDialog.Header>
              <AlertDialog.Icon status={severity === 'default' ? 'accent' : severity} />
              <AlertDialog.Heading>{title}</AlertDialog.Heading>
            </AlertDialog.Header>
            {body ? <AlertDialog.Body>{body}</AlertDialog.Body> : null}
            <AlertDialog.Footer>
              <Button variant="tertiary" onPress={() => onOpenChange(false)} isDisabled={isPending}>
                {cancelLabel}
              </Button>
              <Button
                variant={severity === 'danger' ? 'danger' : 'primary'}
                onPress={() => void confirm()}
                isPending={isPending}
                autoFocus
              >
                {arm && armed ? (armedLabel ?? CONFIRM.confirm) : confirmLabel}
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  )
}
