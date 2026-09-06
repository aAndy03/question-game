import { useEffect, useState, type ReactNode } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button, Text } from '@/atoms'
import { CONFIRM } from '@/copy'
import { PinPrompt } from './PinPrompt'

/** A stacked confirm inside the one dialog (spec §14, 05_STUDIO_DESIGN.md §12.4). */
export interface ConfirmFrame {
  readonly title: string
  readonly body?: ReactNode
  readonly confirmLabel: string
  /** `pin` renders `PinPrompt variant="frame"` and confirms through `onConfirmPin`. */
  readonly variant?: 'confirm' | 'pin' | undefined
}

/** The dialog itself is depth 1; the third frame may be the pin (§14). */
export const CONFIRM_MAX_DEPTH = 3

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
  /**
   * Stacked frames, innermost last: arm → confirm → pin inside one dialog.
   * When non-empty the last frame's title, body and button are shown.
   */
  frames?: readonly ConfirmFrame[] | undefined
  /** Cancel on a frame pops it (the owner drops the last frame). */
  onCancelFrame?: (() => void) | undefined
  /** The pin frame's submit: the digits, as typed (§2.15). */
  onConfirmPin?: ((pin: string) => void | Promise<void>) | undefined
  /** The host's refusal for the pin, landed on the field. */
  pinError?: string | null | undefined
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
  frames = [],
  onCancelFrame,
  onConfirmPin,
  pinError,
}: ConfirmDialogProps) {
  if (frames.length + 1 > CONFIRM_MAX_DEPTH) throw new Error(`ConfirmDialog: depth ${frames.length + 1}, §14 allows ${CONFIRM_MAX_DEPTH}`)
  const [armed, setArmed] = useState(false)
  useEffect(() => {
    if (!isOpen) setArmed(false)
  }, [isOpen])

  const frame = frames[frames.length - 1]
  const shownTitle = frame ? frame.title : title
  const shownBody = frame ? frame.body : body
  const isPin = frame?.variant === 'pin'

  const confirm = async () => {
    if (!frame && arm && !armed) {
      setArmed(true)
      return
    }
    await onConfirm()
    if (!frame) onOpenChange(false)
  }
  const cancel = () => {
    if (frame && onCancelFrame) onCancelFrame()
    else onOpenChange(false)
  }

  // No `<AlertDialog>` root: the root exists to wire a trigger, and a
  // controlled dialog has none — it then mounts a PressResponder with no
  // pressable child and warns on every render. HeroUI v3's controlled example
  // starts at `AlertDialog.Backdrop` (docs: alert-dialog, "Controlled State").
  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false} isKeyboardDismissDisabled={false}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Icon status={severity === 'default' ? 'accent' : severity} />
            <AlertDialog.Heading>{shownTitle}</AlertDialog.Heading>
          </AlertDialog.Header>
          {shownBody || isPin ? (
            <AlertDialog.Body>
              {shownBody}
              {isPin ? (
                <div className="pt-2">
                  <PinPrompt
                    variant="frame"
                    isOpen
                    onOpenChange={() => cancel()}
                    title={frame.title}
                    error={pinError ?? null}
                    isPending={isPending}
                    submitLabel={frame.confirmLabel}
                    onSubmit={(pin) => void (onConfirmPin ?? (() => onConfirm()))(pin)}
                    onCancel={cancel}
                  />
                </div>
              ) : null}
            </AlertDialog.Body>
          ) : null}
          {isPin ? (
            frames.length > 0 ? (
              <AlertDialog.Footer>
                <Text variant="studio-caption" tone="muted">{`${frames.length + 1}/${CONFIRM_MAX_DEPTH}`}</Text>
              </AlertDialog.Footer>
            ) : null
          ) : (
            <AlertDialog.Footer>
              {frames.length > 0 ? <Text variant="studio-caption" tone="muted" className="mr-auto">{`${frames.length + 1}/${CONFIRM_MAX_DEPTH}`}</Text> : null}
              <Button variant="tertiary" onPress={cancel} isDisabled={isPending}>
                {cancelLabel}
              </Button>
              <Button
                variant={severity === 'danger' ? 'danger' : 'primary'}
                onPress={() => void confirm()}
                isPending={isPending}
                autoFocus
              >
                {frame ? frame.confirmLabel : arm && armed ? (armedLabel ?? CONFIRM.confirm) : confirmLabel}
              </Button>
            </AlertDialog.Footer>
          )}
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  
  )
}
