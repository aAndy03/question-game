import gsap from 'gsap'
import { decorSwap, fadeIn, fadeOut, headerIn } from '../beats'
import type { TransitionFactory } from '../types'

/**
 * The default transition: a plain crossfade with a decor handover. Every
 * pair the registry has no authored timeline for resolves to this, so the
 * operator can jump anywhere from day one and nothing ever snaps.
 */
export const crossfade: TransitionFactory = (ctx) => {
  const tl = gsap.timeline()
  if (ctx.outgoing) fadeOut(tl, ctx.outgoing, 0)
  decorSwap(tl, ctx.decor, ctx.swapDecor, 0)
  fadeIn(tl, ctx.incoming, 0.2)
  if (ctx.from === 'idle') headerIn(tl, ctx.header, 0.2)
  return tl
}
