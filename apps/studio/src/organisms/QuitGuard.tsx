import { useEffect, useRef, useState } from 'react'
import { ConfirmDialog } from '@/molecules'
import { QUIT } from '@/copy'
import { useNavStore } from '@/chrome/nav'
import { useQuitStore } from '@/chrome/quit'
import { useHostCommand } from '@/host/commands'
import { peekPlayState } from '@/host/playState'

/**
 * The close guard (P12.2, `05_STUDIO_DESIGN.md` §18.1). The host holds
 * Studio's window open on the first close and asks; this answers.
 *
 * 1. An editor with unsaved changes asks first, through the ordinary nav
 *    guard (`askLeave`). *Keep editing* cancels the close.
 * 2. A loaded game asks once more, because quitting also closes Stage.
 * 3. Otherwise the app quits.
 *
 * A second press of the close button while any of this is open exits
 * regardless — that is the host's rule, so a wedged Studio cannot keep the
 * operator in.
 */
export function QuitGuard() {
  const requested = useQuitStore((s) => s.requested)
  const askLeave = useNavStore((s) => s.askLeave)
  const run = useHostCommand()
  const handled = useRef(requested)
  const quitting = useRef(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (requested === handled.current) return
    handled.current = requested
    void (async () => {
      if (!(await askLeave())) {
        await run.ok('app_close_cancelled')
        return
      }
      if (peekPlayState() !== null) {
        quitting.current = false
        setOpen(true)
        return
      }
      await run.ok('app_quit')
    })()
  }, [requested, askLeave, run])

  return (
    <ConfirmDialog
      isOpen={open}
      severity="warning"
      title={QUIT.title}
      body={QUIT.playLoaded}
      confirmLabel={QUIT.quit}
      cancelLabel={QUIT.keepWorking}
      onConfirm={async () => {
        quitting.current = true
        await run.ok('app_quit')
      }}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next && !quitting.current) void run.ok('app_close_cancelled')
      }}
    />
  )
}
