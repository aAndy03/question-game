/**
 * The sequencer: who may animate right now.
 *
 * Spec §2.6 / §5.6: only one overlay plays at a time, and no base transition
 * plays under a running overlay. The host owns the *queue* (`active`,
 * `pending`); this owns the *moment*: a transition asks to start and is held
 * until any running overlay finishes; an overlay asks to start and is held
 * until any running transition finishes. Nothing is ever killed mid-beat.
 *
 * Tiny by design: two flags and a wait list.
 */

export type Lane = 'transition' | 'overlay'

const busy: Record<Lane, boolean> = { transition: false, overlay: false }
const waiters: (() => void)[] = []

export const sequencer = {
  isBusy(lane: Lane): boolean {
    return busy[lane]
  },
  /** Mark a lane busy; returns the release function. */
  acquire(lane: Lane): () => void {
    busy[lane] = true
    let released = false
    return () => {
      if (released) return
      released = true
      busy[lane] = false
      const pending = waiters.splice(0)
      for (const w of pending) w()
    }
  },
  /**
   * Run `start` once `lane` is free of `other`. Returns a cancel: if the
   * caller changes its mind before the slot opens, nothing runs.
   */
  whenFree(other: Lane, start: () => void): () => void {
    if (!busy[other]) {
      start()
      return () => {}
    }
    let cancelled = false
    const w = () => {
      if (cancelled) return
      if (busy[other]) {
        waiters.push(w)
        return
      }
      start()
    }
    waiters.push(w)
    return () => {
      cancelled = true
    }
  },
  /** Tests only. */
  reset(): void {
    busy.transition = false
    busy.overlay = false
    waiters.length = 0
  },
}
