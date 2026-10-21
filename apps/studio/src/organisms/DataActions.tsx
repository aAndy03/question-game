import { useState } from 'react'
import { Button } from '@/atoms'
import { ConfirmDialog, PathRow, SettingRow, type ConfirmFrame } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { usePlayState } from '@/host/playState'
import { useCatalogItem, usePaths, usePlays, useSettings } from '@/host/queries'
import { useNoticeStore, noticesAt, noticeText } from '@/chrome/notices'

type Action = 'wipe' | 'uninstall' | 'app'

/** One dialog, three actions: what each one says (P12.2). */
const DIALOG: Record<Action, { arm: string; armed: string }> = {
  wipe: { arm: SETTINGS.data.wipeArm, armed: SETTINGS.data.wipeArmed },
  uninstall: { arm: SETTINGS.data.uninstallArm, armed: SETTINGS.data.uninstallArmed },
  app: { arm: SETTINGS.data.uninstallAppArm, armed: SETTINGS.data.uninstallAppArmed },
}

/**
 * Wipe Plays · Remove generated data · Uninstall questiongame
 * (05_STUDIO_DESIGN.md §12.3, §18.2). Each is one
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
  const pinError = pinPath ? noticeText(noticesAt(notices, pinPath)[0]) : null

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
      const ok = await run.ok(action === 'app' ? 'app_uninstall' : 'uninstall_data', { pin }, target)
      setPending(false)
      if (!ok) return
    }
    close()
  }

  const confirm = async () => {
    if (!open) return
    if (pinned) {
      // The pin is the last frame, never a second dialog (§14).
      setFrames([{ variant: 'pin', title: SETTINGS.pin.promptTitle, body: SETTINGS.data.pinFrame, confirmLabel: DIALOG[open].armed }])
      return
    }
    await execute(open, null)
  }

  const count = plays.data?.length ?? 0
  const pathList = paths.data ? [paths.data.userData, paths.data.catalog].join('\n') : ''
  const title = open === 'uninstall' ? SETTINGS.data.uninstallTitle : open === 'app' ? SETTINGS.data.uninstallAppTitle : SETTINGS.data.wipeTitle(count)
  const body = open === 'uninstall' ? `${SETTINGS.data.uninstallBody}\n${pathList}` : open === 'app' ? SETTINGS.data.uninstallAppBody : SETTINGS.data.wipeBody

  return (
    <>
      {paths.data ? (
        // Where the generated files are (P12.1): the log and the performance
        // log live beside the library, and so do the backups an update takes
        // (P12.6), so one Reveal shows all four.
        <div data-data-paths className="pb-2">
          <PathRow label={SETTINGS.paths.userData} path={paths.data.userData} onReveal={() => void run('paths_reveal', { which: 'userData' })} />
          <PathRow label={SETTINGS.paths.logFile} path={paths.data.logFile} />
          <PathRow label={SETTINGS.paths.perfDir} path={paths.data.perfDir} />
          <PathRow label={SETTINGS.paths.backups} path={paths.data.backups} />
        </div>
      ) : null}
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
      {paths.data?.uninstaller ? (
        // Only a copy the Windows installer put there has one (P12.2).
        <SettingRow label={SETTINGS.rows['data.uninstall_app'].label} description={SETTINGS.rows['data.uninstall_app'].description}>
          <Button variant="danger" icon="trash" onPress={() => setOpen('app')} isDisabled={playOpen} disabledReason={blocked}>
            {SETTINGS.data.uninstallApp}
          </Button>
        </SettingRow>
      ) : null}
      <ConfirmDialog
        isOpen={open !== null}
        onOpenChange={(o) => {
          if (!o) close()
        }}
        title={title}
        body={body}
        confirmLabel={DIALOG[open ?? 'wipe'].arm}
        arm
        armedLabel={DIALOG[open ?? 'wipe'].armed}
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
