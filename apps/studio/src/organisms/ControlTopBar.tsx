import { useState } from 'react'
import { Button, IconButton, MeaningChip, Text } from '@/atoms'
import { ConfirmDialog, DisplayPicker } from '@/molecules'
import { useControlLayoutStore } from '@/chrome/control'
import { useStatsWindowOpen } from '@/chrome/windows'
import { CHROME, CONTROL, UNLOAD } from '@/copy'
import { STATS } from '@/copy/stats'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { useMonitors, useSettings } from '@/host/queries'
import { isPlayOpen, usePlayState } from '@/host/playState'
import { SettingsFloat } from './SettingsFloat'

/** Stage / Statistics display pickers, unload, the settings float, Reset layout (spec §11.H). */
export function ControlTopBar() {
  const monitors = useMonitors()
  const settings = useSettings()
  const run = useHostCommand()
  const play = usePlayState()
  const mirrorCount = settings.data?.control.stage_mirror_ids.length ?? 0
  const resetLayout = useControlLayoutStore((s) => s.resetLayout)
  const list = monitors.data ?? []
  const statsOpen = useStatsWindowOpen()
  const [confirmUnload, setConfirmUnload] = useState(false)
  const [unloading, setUnloading] = useState(false)
  // Keep is the default answer, and the one that needs no thought.
  const [discard, setDiscard] = useState(false)

  const unload = async (discardPlay: boolean) => {
    setUnloading(true)
    const ok = await run.ok('play_unload', { discard: discardPlay })
    setUnloading(false)
    setConfirmUnload(false)
    setDiscard(false)
    if (ok) toast.info(discardPlay ? UNLOAD.doneDiscarded : UNLOAD.done)
  }

  // A Play that never started has no record worth the question: it was loaded
  // and put down again, and keeping a row for it only clutters the Plays list
  // and Statistics. Anything that was played is asked about.
  const neverStarted = play !== null && play.status === 'loaded'

  return (
    // Compact (P20): set once per show, so it should not outweigh the mosaic under it.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5" data-control-top data-density="compact">
      <div className="flex items-center gap-2">
        <Text variant="studio-caption" tone="muted">
          {CONTROL.stageDisplay}
        </Text>
        <DisplayPicker label={CONTROL.stageDisplay} monitors={list} value={settings.data?.control.stage_monitor_id ?? null} onChange={(monitorId) => void run('stage_set_monitor', { monitorId })} />
        {/* The picker is the *pacer's* display. Mirrors are added in
          * Settings ▸ Monitors; this says how many are on air, so the operator
          * can see it from where they work (§9, P11.11). */}
        {mirrorCount > 0 ? <MeaningChip meaning="stage">{CONTROL.stageDisplayCount(mirrorCount + 1)}</MeaningChip> : null}
        <Button size="sm" variant="ghost" icon="displays" onPress={() => void run('stage_open')}>
          {CONTROL.openStage}
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Text variant="studio-caption" tone="muted">
          {CONTROL.statsDisplay}
        </Text>
        <DisplayPicker label={CONTROL.statsDisplay} monitors={list} value={settings.data?.control.stats_monitor_id ?? null} onChange={(value) => void run('settings_set_global', { setting: { key: 'stats_monitor_id', value } })} />
        {/* The picker remembers where; this shows it. Mid-show the operator
          * should be able to put the numbers up and take them down without
          * leaving Control (§13.3). */}
        <Button
          size="sm"
          variant={statsOpen ? 'ghost' : 'secondary'}
          icon="statistics"
          onPress={() => void run('stats_window', { open: !statsOpen })}
        >
          {statsOpen ? STATS.window.close : STATS.window.show}
        </Button>
      </div>
      <div className="flex-1" />
      {/* The way back out of a loaded game, and the only one: it is here
        * rather than in a panel because it is about what is *in* Control, and
        * because the operator must be able to reach it whatever the mosaic
        * looks like. Available from the moment a recipe is loaded — before
        * the start, mid-show and after the end. */}
      {play ? (
        <Button
          size="sm"
          variant="ghost"
          icon="close"
          onPress={() => (neverStarted ? void unload(true) : setConfirmUnload(true))}
        >
          {UNLOAD.action}
        </Button>
      ) : null}
      <IconButton
        icon={settings.data?.control.audio.muted ? 'volumeMuted' : 'volume'}
        label={settings.data?.control.audio.muted ? CHROME.unmute : CHROME.mute}
        size="sm"
        onPress={() => void run('settings_set_global', { setting: { key: 'audio_muted', value: !(settings.data?.control.audio.muted ?? false) } })}
      />
      <IconButton
        icon="layout"
        label={CONTROL.resetLayout}
        size="sm"
        onPress={() => {
          resetLayout()
          toast.info(CONTROL.resetLayout)
        }}
      />
      <SettingsFloat />
      {/* Two questions in one dialog: *is this the end of the Play* (an open
        * one is abandoned on the way out) and *is it worth keeping*. Discard
        * is a hard delete — the only one in v1 outside Wipe Plays — so it is
        * chosen deliberately, never assumed, and the confirm button says which
        * of the two it is about to do. */}
      <ConfirmDialog
        isOpen={confirmUnload}
        onOpenChange={(o) => {
          if (!o) {
            setConfirmUnload(false)
            setDiscard(false)
          }
        }}
        title={UNLOAD.title}
        body={
          <div className="flex flex-col gap-3">
            <Text variant="studio-body" tone="muted">
              {play !== null && isPlayOpen(play) ? UNLOAD.bodyOpen : UNLOAD.bodyClosed}
            </Text>
            {/* Two short choices and one line about the one that is chosen —
              * the same shape as the restart dialog's, so a destructive fork
              * reads the same wherever the operator meets it. */}
            <div className="flex gap-2">
              <Button size="sm" variant={discard ? 'outline' : 'primary'} onPress={() => setDiscard(false)}>
                {UNLOAD.keep}
              </Button>
              <Button size="sm" variant={discard ? 'danger' : 'outline'} onPress={() => setDiscard(true)}>
                {UNLOAD.discard}
              </Button>
            </div>
            <Text variant="studio-caption" tone={discard ? 'danger' : 'muted'}>
              {discard ? UNLOAD.discardHint : UNLOAD.keepHint}
            </Text>
          </div>
        }
        severity={discard ? 'danger' : 'warning'}
        confirmLabel={discard ? UNLOAD.confirmDiscard : UNLOAD.confirm}
        arm={discard}
        isPending={unloading}
        onConfirm={() => unload(discard)}
      />
    </div>
  )
}
