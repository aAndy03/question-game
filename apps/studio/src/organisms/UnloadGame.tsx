import { useState } from 'react'
import { Button, IconButton, Text } from '@/atoms'
import { ConfirmDialog } from '@/molecules'
import { UNLOAD } from '@/copy'
import { useHostCommand } from '@/host/commands'
import { toast } from '@/chrome/toast'
import { isPlayOpen, usePlayState } from '@/host/playState'

/**
 * *Unload game*, an ✕ beside the play pill in the top bar while a game is
 * loaded (spec §11.H; P21.5 — until then Control's own strip, a row of height
 * the mosaic now has). Nothing without a game.
 */
export function UnloadGame() {
  const run = useHostCommand()
  const play = usePlayState()
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
  if (play === null) return null

  return (
    <>
      {/* The way back out of a loaded game, and the only one: in the shell
        * rather than in a panel because it is about what is *in* Control, and
        * because the operator must be able to reach it whatever the mosaic
        * looks like. Available from the moment a recipe is loaded — before
        * the start, mid-show and after the end. */}
      <IconButton
        icon="close"
        label={UNLOAD.action}
        size="sm"
        onPress={() => (neverStarted ? void unload(true) : setConfirmUnload(true))}
      />
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
    </>
  )
}
