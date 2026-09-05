import gsap from 'gsap'
import { D, EASE_OUT, decorSwap, headerIn, riseIn, slideOutLeft } from '../beats'
import type { TransitionFactory } from '../types'

/**
 * Idle → TeamOrder: the show begins.
 *
 *   0.00  the idle column slides off to the left and fades
 *   0.00  the decor fades out; the world rebuilds for TeamOrder; it fades in
 *   0.25  the header drops in from above its rule
 *   0.35  the title arrives, then the sequence rows rise one after another
 *
 * Everything the incoming page shows is already in the DOM (play-state drew
 * it); the timeline only decides when each part becomes visible.
 */
export const idleToTeamOrder: TransitionFactory = (ctx) => {
  const tl = gsap.timeline()

  if (ctx.outgoing) slideOutLeft(tl, ctx.outgoing, 0)
  decorSwap(tl, ctx.decor, ctx.swapDecor, 0)
  headerIn(tl, ctx.header, 0.25)

  const title = ctx.incoming.querySelector('[data-node-id="teamOrder.title"]')
  const rows = ctx.incoming.querySelectorAll('[data-node-id^="teamOrder.row."]')
  // The incoming layer itself is visible from the start; its parts arrive.
  gsap.set(ctx.incoming, { autoAlpha: 1 })
  if (title) tl.fromTo(title, { x: -24, autoAlpha: 0 }, { x: 0, autoAlpha: 1, duration: D.in, ease: EASE_OUT }, 0.35)
  if (rows.length) riseIn(tl, rows, 0.45)

  return tl
}
