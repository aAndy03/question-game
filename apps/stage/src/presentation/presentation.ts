/**
 * The Stage runner for `PresentationService`: play one transition, report
 * `anim-complete` exactly once.
 *
 * Tests and the Viewer's static preview set `motionConfig.immediate`, which
 * jumps every timeline to its end synchronously: the same code path, the
 * same single completion event, no clock.
 */

import gsap from 'gsap'
import { animKey, type StageScreen } from '@questiongame/contract'
import { stageEvents } from '@/host/events'
import { clearLayer, clearParts, headerAcross } from './beats'
import { transitionFor } from './transitions'
import type { TransitionContext } from './types'

export const motionConfig = {
  /** Finish every timeline synchronously. Tests; reduced-motion later. */
  immediate: false,
}

export interface RunningTransition {
  readonly timeline: gsap.core.Timeline
  readonly from: StageScreen
  readonly to: StageScreen
  /** Stop early and report completion now (the operator jumped again). */
  finish(): void
}

export function runTransition(ctx: TransitionContext, onComplete: () => void): RunningTransition {
  const key = animKey.transition(ctx.from, ctx.to)
  let done = false
  const complete = () => {
    if (done) return
    done = true
    // The layers are reused by the next timeline; leave no animated residue.
    clearLayer(ctx.incoming)
    clearParts(ctx.header, ctx.decor, ...ctx.incoming.querySelectorAll<HTMLElement>('[data-node-id], [data-decor-solid], [role="separator"]'))
    // Report before handing on: releasing the lane may start (and report) the next timeline synchronously.
    stageEvents.emit('anim-complete', { key })
    onComplete()
  }

  const tl = transitionFor(ctx.from, ctx.to)(ctx)
  // The header's show/hide belongs to the runner, not to a pair.
  headerAcross(tl, ctx.header, ctx.from, ctx.to)
  tl.eventCallback('onComplete', complete)
  if (motionConfig.immediate) tl.progress(1, false)

  return {
    timeline: tl,
    from: ctx.from,
    to: ctx.to,
    finish() {
      if (done) return
      tl.progress(1, false)
      complete()
      tl.kill()
    },
  }
}
