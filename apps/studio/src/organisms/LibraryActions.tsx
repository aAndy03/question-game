import { useState } from 'react'
import { Button, Text } from '@/atoms'
import { ConfirmDialog, SettingRow } from '@/molecules'
import { SETTINGS } from '@/copy/settings'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { useSeedStatus } from '@/host/queries'
import type { SeedDemo, SeedResult } from '@/host/types'

/**
 * One Restore row per Demo (§2.28, 05_STUDIO_DESIGN.md §12.1, §17.5). The two
 * share no row, so each confirm counts only its own edits.
 */
export function LibraryActions() {
  return (
    <>
      <DemoRestore demo="en" />
      <DemoRestore demo="ro" />
    </>
  )
}

/**
 * Restore one Demo: `missing` outright; when its seed rows were edited, a
 * confirm names the count and offers `overwrite`. The host decides what is
 * missing or edited (`catalog_seed_status`); this only asks the question.
 */
function DemoRestore({ demo }: { demo: SeedDemo }) {
  const status = useSeedStatus(demo)
  const run = useHostCommand()
  const [asking, setAsking] = useState(false)
  const [pending, setPending] = useState(false)
  const edited = status.data?.edited ?? 0
  const missing = status.data?.missing ?? 0
  const row = SETTINGS.rows[demo === 'en' ? 'library.restore_demo' : 'library.restore_demo_ro']

  const seed = async (mode: 'missing' | 'overwrite') => {
    setPending(true)
    const result = await run<SeedResult>('catalog_seed_demo', { demo, mode })
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
  const nothingToDo = status.data !== undefined && missing === 0 && edited === 0

  return (
    <>
      <SettingRow label={row.label} description={row.description}>
        <div className="flex flex-col items-start gap-1.5">
          <Button variant="secondary" icon="restore" onPress={restore} isPending={pending} isDisabled={nothingToDo} disabledReason={nothingToDo ? SETTINGS.library.restored(0) : null}>
            {SETTINGS.library.restore[demo]}
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
