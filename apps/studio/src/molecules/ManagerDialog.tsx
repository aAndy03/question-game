import type { ReactNode } from 'react'
import { Modal } from '@heroui/react'

export interface ManagerDialogProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description?: string | undefined
  /** The entries (`PaneList`). */
  list: ReactNode
  /** The chosen entry: its name, counts, actions and members. */
  detail: ReactNode
  /** Close, and the one primary action (New …). */
  footer: ReactNode
  /** A test hook on the body, e.g. `data-groups-dialog`. */
  hook?: string | undefined
}

/**
 * The managers' frame (P20): question tags, domain groups, folders and game
 * tags. A wide dialog with the entries on the left and the chosen one on the
 * right — its name, how many it holds, what can be done to it, and its
 * members — where a narrow list of names with a menu per row used to be.
 * Stacks in a narrow window. Its height is fixed, so choosing an entry never
 * moves the frame; each pane scrolls on its own.
 */
export function ManagerDialog({ isOpen, onClose, title, description, list, detail, footer, hook }: ManagerDialogProps) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={(open) => !open && onClose()}>
      <Modal.Container size="lg">
        <Modal.Dialog className="h-[min(40rem,calc(100vh-4rem))] w-full max-w-[min(56rem,calc(100vw-4rem))]">
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>{title}</Modal.Heading>
            {description ? <p className="text-sm text-[var(--muted)]">{description}</p> : null}
          </Modal.Header>
          <Modal.Body className="@container/manager flex min-h-0 flex-1 overflow-hidden" {...(hook ? { [hook]: '' } : {})}>
            <div className="grid min-h-0 w-full flex-1 grid-cols-1 gap-4 @[36rem]/manager:grid-cols-[minmax(12rem,16rem)_minmax(0,1fr)]">
              <div className="flex min-h-0 flex-col gap-2 overflow-y-auto">{list}</div>
              <div className="flex min-h-0 flex-col gap-3 overflow-y-auto border-t border-[var(--separator)] pt-3 @[36rem]/manager:border-l @[36rem]/manager:border-t-0 @[36rem]/manager:pl-4 @[36rem]/manager:pt-0">
                {detail}
              </div>
            </div>
          </Modal.Body>
          <Modal.Footer>{footer}</Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  )
}
