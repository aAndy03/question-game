import { useEffect, useRef, useState, type ReactNode } from 'react'
import { AlertDialog } from '@heroui/react'
import { Button, Text, TextField } from '@/atoms'
import { CONFIRM } from '@/copy'

export interface NameDialogProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: ReactNode
  label: string
  /** What the field starts with: the current name on a rename, empty otherwise. Never a suggestion. */
  initial?: string | undefined
  confirmLabel: string
  /**
   * The write. A refusal is thrown and lands on the field as its message; the
   * dialog stays open so the operator can fix the name.
   */
  onSubmit: (name: string) => Promise<void>
  /** Extra controls under the field (a group picker). */
  children?: ReactNode
}

/**
 * One name, typed by the operator (Beta 2.0): the workspace and group dialogs.
 * The field starts empty or with the name being changed, has no placeholder,
 * and *Confirm* waits for a name — nothing here offers one.
 */
export function NameDialog({ isOpen, onOpenChange, title, body, label, initial = '', confirmLabel, onSubmit, children }: NameDialogProps) {
  const [name, setName] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const busy = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setName(initial)
      setError(null)
      setPending(false)
      busy.current = false
    }
  }, [isOpen, initial])

  const submit = async () => {
    if (busy.current || !name.trim()) return
    busy.current = true
    setPending(true)
    try {
      await onSubmit(name)
      onOpenChange(false)
    } catch (e) {
      const message = (e as { message?: string }).message ?? String(e)
      // `workspace/new/name: another workspace has this name` → the reason.
      setError(message.replace(/^[^:]*:\s*/, ''))
    } finally {
      busy.current = false
      setPending(false)
    }
  }

  return (
    <AlertDialog.Backdrop isOpen={isOpen} onOpenChange={onOpenChange} isDismissable={false} isKeyboardDismissDisabled={false}>
      <AlertDialog.Container size="sm">
        <AlertDialog.Dialog>
          <AlertDialog.Header>
            <AlertDialog.Heading>{title}</AlertDialog.Heading>
          </AlertDialog.Header>
          <AlertDialog.Body>
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault()
                void submit()
              }}
            >
              {body ? (
                <Text as="p" variant="studio-body" tone="muted">
                  {body}
                </Text>
              ) : null}
              <TextField label={label} value={name} onChange={(v) => { setName(v); setError(null) }} error={error} autoFocus maxLength={60} isRequired />
              {children}
            </form>
          </AlertDialog.Body>
          <AlertDialog.Footer>
            <Button variant="tertiary" onPress={() => onOpenChange(false)} isDisabled={pending}>
              {CONFIRM.cancel}
            </Button>
            <Button variant="primary" onPress={() => void submit()} isPending={pending} isDisabled={!name.trim()}>
              {confirmLabel}
            </Button>
          </AlertDialog.Footer>
        </AlertDialog.Dialog>
      </AlertDialog.Container>
    </AlertDialog.Backdrop>
  )
}
