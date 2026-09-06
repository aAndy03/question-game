import { useState } from 'react'
import { Button } from '@/atoms'
import { ConfirmDialog, SettingRow, type ConfirmFrame } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { usePlayState } from '@/host/playState'
import { useCatalogItem, usePaths, usePlays, useSettings } from '@/host/queries'
import { useNoticeStore, noticesAt } from '@/chrome/notices'

type Action = 'wipe' | 'uninstall'

/**
 * Wipe Plays · Remove generated data (05_STUDIO_DESIGN.md §12.3). Each is one
 * `ConfirmDialog`: arm → confirm, then a pin frame when the active operator
 * has one — three frames at most, in the same component (§14). Both buttons
 * are disabled with a reason whenever a Play is loaded; the host refuses
 * regardless, before it looks at any pin.
 */
export function DataActions() {
  const play = usePlayState()
  const run = useHostCommand()
  const settings = useSettings()
  const plays = usePlays()
  const paths = usePaths()
  const activeId = settings.data?.globals.active_operator_id ?? null
  const active = useCatalogItem('operator', activeId)
  const pinned = Boolean(active.data?.pinHash)
  const notices = useNoticeStore((s) => s.notices)
  const dismiss = useNoticeStore((s) => s.dismiss)
  const [open, setOpen] = useState<Action | null>(null)
  const [frames, setFrames] = useState<ConfirmFrame[]>([])
  const [pending, setPending] = useState(false)

  const playOpen = play !== null
  const blocked = playOpen ? SETTINGS.data.playOpen : null
  const pinPath = activeId ? `operator.${activeId}.pin` : ''
  const pinError = pinPath ? (noticesAt(notices, pinPath)[0]?.detail.message ?? null) : null

  const close = () => {
    setOpen(null)
    setFrames([])
    notices.filter((n) => n.targetPath === pinPath).forEach((n) => dismiss(n.id))
  }

  const execute = async (action: Action, pin: string | null) => {
    setPending(true)
    const target = { targetPath: pinPath || null }
    // Wipe answers with a count; uninstall answers `()`, so it asks for the
    // verdict rather than reading a payload that is null either way.
    if (action === 'wipe') {
      const result = await run<{ removed: number }>('wipe_plays', { pin }, target)
      setPending(false)
      if (result === null) return
      toast.success(SETTINGS.data.wiped(result.removed))
    } else {
      const ok = await run.ok('uninstall_data', { pin }, target)
      setPending(false)
      if (!ok) return
    }
    close()
  }

  const confirm = async () => {
    if (!open) return
    if (pinned) {
      // The pin is the last frame, never a second dialog (§14).
      setFrames([{ variant: 'pin', title: SETTINGS.pin.promptTitle, body: SETTINGS.data.pinFrame, confirmLabel: open === 'wipe' ? SETTINGS.data.wipeArmed : SETTINGS.data.uninstallArmed }])
      return
    }
    await execute(open, null)
  }

  const count = plays.data?.length ?? 0
  const pathList = paths.data ? [paths.data.userData, paths.data.catalog].join('\n') : ''

  return (
    <>
      <SettingRow label={SETTINGS.rows['data.wipe_plays'].label} description={SETTINGS.rows['data.wipe_plays'].description}>
        <Button variant="danger" icon="wipe" onPress={() => setOpen('wipe')} isDisabled={playOpen || count === 0} disabledReason={blocked ?? (count === 0 ? SETTINGS.data.wiped(0) : null)}>
          {SETTINGS.data.wipePlays}
        </Button>
      </SettingRow>
      <SettingRow label={SETTINGS.rows['data.uninstall'].label} description={SETTINGS.rows['data.uninstall'].description}>
        <Button variant="danger" icon="trash" onPress={() => setOpen('uninstall')} isDisabled={playOpen} disabledReason={blocked}>
          {SETTINGS.data.uninstall}
        </Button>
      </SettingRow>
      <ConfirmDialog
        isOpen={open !== null}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        title={open === 'uninstall' ? SETTINGS.data.uninstallTitle : SETTINGS.data.wipeTitle(count)}
        body={open === 'uninstall' ? `${SETTINGS.data.uninstallBody}\n${pathList}` : SETTINGS.data.wipeBody}
        confirmLabel={open === 'uninstall' ? SETTINGS.data.uninstallArm : SETTINGS.data.wipeArm}
        arm
        armedLabel={open === 'uninstall' ? SETTINGS.data.uninstallArmed : SETTINGS.data.wipeArmed}
        isPending={pending}
        onConfirm={confirm}
        frames={frames}
        onCancelFrame={() => setFrames((f) => f.slice(0, -1))}
        onConfirmPin={(pin) => (open ? execute(open, pin) : undefined)}
        pinError={pinError}
      />
    </>
  )
}
