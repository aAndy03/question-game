import { useState, type ReactNode } from 'react'
import { ConfirmDialog } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { noticesAt, useNoticeStore, noticeText } from '@/chrome/notices'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import type { Operator } from '@/host/types'

export interface ActivateOperator {
  /** Switch to `operator`; a pinned one asks for its pin first. */
  activate(operator: Operator): void
  /** Render once where the switch was pressed. */
  readonly prompt: ReactNode
}

/**
 * One switch path for the top bar, the Operators list and the detail view
 * (§2.15): `operator_activate`, with the pin as a frame when the target has
 * one. The digits go to the host and nowhere else; a wrong pin lands on the
 * field from the host's own refusal.
 *
 * The frame lives in a `ConfirmDialog` rather than a popover: the press comes
 * from a menu item or a list action that has closed by the time the pin is
 * asked for, so there is nothing to anchor to.
 */
export function useActivateOperator(): ActivateOperator {
  const run = useHostCommand()
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [target, setTarget] = useState<Operator | null>(null)
  const [pending, setPending] = useState(false)
  const path = target ? `operator.${target.id}.pin` : ''
  const pinError = path ? noticeText(noticesAt(notices, path)[0]) : null

  const close = () => {
    notices.filter((n) => n.targetPath === path).forEach((n) => dismiss(n.id))
    setTarget(null)
  }

  const send = async (operator: Operator, pin: string | null) => {
    setPending(true)
    const ok = await run.ok('operator_activate', { id: operator.id, pin }, { targetPath: `operator.${operator.id}.pin` })
    setPending(false)
    if (!ok) return
    toast.success(operator.displayName)
    close()
  }

  const activate = (operator: Operator) => {
    if (operator.pinHash) setTarget(operator)
    else void send(operator, null)
  }

  const prompt = (
    <ConfirmDialog
      isOpen={target !== null}
      onOpenChange={(o) => {
        if (!o) close()
      }}
      severity="default"
      title={SETTINGS.pin.promptTitle}
      confirmLabel={SETTINGS.pin.unlock}
      isPending={pending}
      onConfirm={() => {}}
      frames={target ? [{ variant: 'pin', title: SETTINGS.pin.promptTitle, body: SETTINGS.pin.promptBody(target.displayName), confirmLabel: SETTINGS.pin.unlock }] : []}
      onCancelFrame={close}
      onConfirmPin={(pin) => (target ? send(target, pin) : undefined)}
      pinError={pinError}
    />
  )

  return { activate, prompt }
}
