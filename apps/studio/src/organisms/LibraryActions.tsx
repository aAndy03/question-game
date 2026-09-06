import { useState } from 'react'
import { Button, Text } from '@/atoms'
import { ConfirmDialog, SettingRow } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { useSeedStatus } from '@/host/queries'
import type { SeedResult } from '@/host/types'

/**
 * Restore Demo (§2.28, 05_STUDIO_DESIGN.md §12.1): `missing` outright; when
 * seed rows were edited, a confirm names the count and offers `overwrite`.
 * The host decides what is missing or edited (`catalog_seed_status`); this
 * only asks the question.
 */
export function LibraryActions() {
  const status = useSeedStatus()
  const run = useHostCommand()
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const edited = status.data?.edited ?? 0
  const missing = status.data?.missing ?? 0

  const seed = async (mode: 'missing' | 'overwrite') => {
    setPending(true)
    const result = await run<SeedResult>('catalog_seed_demo', { mode })
    setPending(false)
    setAsking(false)
    if (result) toast.success(SETTINGS.library.restored(result.inserted + result.overwritten))
  }

  const restore = () => {
    if (edited > 0) setAsking(true)
    else void seed('missing')
  }

  const summary = status.data
    ? `${status.data.present} present · ${missing} missing · ${edited} edited`
    : null

  return (
    <>
      <SettingRow label={SETTINGS.rows['library.restore_demo'].label} description={SETTINGS.rows['library.restore_demo'].description}>
        <div className="flex flex-col items-start gap-1.5">
          <Button variant="secondary" icon="restore" onPress={restore} isPending={pending} isDisabled={status.data !== undefined && missing === 0 && edited === 0} disabledReason={status.data && missing === 0 && edited === 0 ? SETTINGS.library.restored(0) : null}>
            {SETTINGS.library.restoreDemo}
          </Button>
          <Text variant="studio-caption" tone="muted">
            {summary ?? SETTINGS.library.restoreDemoHint}
          </Text>
        </div>
      </SettingRow>
      <ConfirmDialog
        isOpen={asking}
        onOpenChange={setAsking}
        severity="warning"
        title={SETTINGS.library.editedTitle(edited)}
        body={SETTINGS.library.editedBody}
        confirmLabel={SETTINGS.library.overwrite}
        cancelLabel={SETTINGS.library.keepEdits}
        isPending={pending}
        onConfirm={() => seed('overwrite')}
      />
    </>
  )
}
