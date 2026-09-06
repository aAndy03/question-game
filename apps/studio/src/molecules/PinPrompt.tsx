import { useEffect, useState, type ReactNode } from 'react'
import { Popover } from '@heroui/react'
import { Button, PinField, Text } from '@/atoms'
import { CONFIRM } from '@/copy'
import { SETTINGS } from '@/copy/settings'

export interface PinPromptProps {
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  title: string
  body?: string | undefined
  /** The host's refusal for this pin (`operator.<id>.pin: wrong pin`), landed inline. */
  error: string | null
  isPending?: boolean | undefined
  /** The digits, as typed. Only the host hashes or verifies (§2.15). */
  onSubmit: (pin: string) => void
  onCancel: () => void
  /** The trigger the popover anchors to (`popover` only). */
  anchor?: ReactNode
  /** `popover`: a small HeroUI Popover · `frame`: the same body inline, as the last frame of a notice or dialog. */
  variant: 'popover' | 'frame'
  /** Label of the confirming button; defaults to *Unlock*. */
  submitLabel?: string | undefined
}

/**
 * A confirm frame, not a dialog (05_STUDIO_DESIGN.md §12.3): where the gated
 * action was a plain press, a popover on the trigger; where it was already
 * inside an `InlineNotice` or `ConfirmDialog`, the pin is that component's
 * last frame. Enter submits. The pin resets whenever the prompt opens.
 */
export function PinPrompt({ isOpen, onOpenChange, title, body, error, isPending, onSubmit, onCancel, anchor, variant, submitLabel }: PinPromptProps) {
  const [pin, setPin] = useState('')
  useEffect(() => {
    if (isOpen) setPin('')
  }, [isOpen])

  const submit = () => {
    if (pin === '' || isPending) return
    onSubmit(pin)
  }

  const form = (
    <form
      className="flex w-64 max-w-full flex-col gap-3"
      aria-label={title}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {variant === 'popover' ? (
        <div className="flex flex-col gap-0.5">
          <Text as="h3" variant="studio-heading">
            {title}
          </Text>
          {body ? (
            <Text as="p" variant="studio-caption" tone="muted">
              {body}
            </Text>
          ) : null}
        </div>
      ) : body ? (
        <Text as="p" variant="studio-caption" tone="muted">
          {body}
        </Text>
      ) : null}
      <PinField label={SETTINGS.pin.label} value={pin} onChange={setPin} error={error} autoFocus isDisabled={isPending} />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" size="sm" onPress={onCancel} isDisabled={isPending}>
          {CONFIRM.cancel}
        </Button>
        <Button variant="primary" size="sm" type="submit" isPending={isPending} isDisabled={pin === ''}>
          {submitLabel ?? SETTINGS.pin.unlock}
        </Button>
      </div>
    </form>
  )

  if (variant === 'frame') return isOpen ? form : null

  return (
    <Popover isOpen={isOpen} onOpenChange={onOpenChange}>
      {anchor ? <Popover.Trigger>{anchor}</Popover.Trigger> : null}
      <Popover.Content placement="bottom" className="p-3">
        <Popover.Dialog aria-label={title}>{form}</Popover.Dialog>
      </Popover.Content>
    </Popover>
  )
}
