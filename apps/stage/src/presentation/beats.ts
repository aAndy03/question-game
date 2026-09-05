/**
 * Shared beats: the few moves every transition is composed from, authored
 * once. A pair's timeline is a sequence of these plus its own accents.
 *
 * Durations and eases are the motion vocabulary of the design system: short,
 * decisive, no bounce. They are constants here until a motion token file
 * exists; nothing outside this module writes a duration.
 */

import gsap from 'gsap'

export const EASE_OUT = 'power3.out'
export const EASE_IN = 'power2.in'

export const D = {
  /** A page leaving. */
  out: 0.35,
  /** A page arriving. */
  in: 0.55,
  /** One row or card in a stagger. */
  item: 0.45,
  /** Between staggered items. */
  stagger: 0.06,
  /** Decor fading out or in around a swap. */
  decor: 0.4,
  /** The header appearing or vanishing. */
  header: 0.35,
} as const

type Target = gsap.TweenTarget

/** Fade a layer out and let it go. */
export function fadeOut(tl: gsap.core.Timeline, target: Target, at: gsap.Position = 0, duration = D.out) {
  tl.to(target, { autoAlpha: 0, duration, ease: EASE_IN }, at)
}

/** Slide a layer out to the left while fading. */
export function slideOutLeft(tl: gsap.core.Timeline, target: Target, at: gsap.Position = 0, distance = 80) {
  tl.to(target, { x: -distance, autoAlpha: 0, duration: D.out, ease: EASE_IN }, at)
}

/** Fade a layer in from nothing. */
export function fadeIn(tl: gsap.core.Timeline, target: Target, at: gsap.Position = 0, duration = D.in) {
  tl.fromTo(target, { autoAlpha: 0 }, { autoAlpha: 1, duration, ease: EASE_OUT }, at)
}

/** Items rise into place one after another (rows, cards, options). */
export function riseIn(tl: gsap.core.Timeline, targets: Target, at: gsap.Position = 0, distance = 32) {
  tl.fromTo(
    targets,
    { y: distance, autoAlpha: 0 },
    { y: 0, autoAlpha: 1, duration: D.item, ease: EASE_OUT, stagger: D.stagger },
    at,
  )
}

/** The header drops in from above the rule. */
export function headerIn(tl: gsap.core.Timeline, header: HTMLElement | null, at: gsap.Position = 0) {
  if (!header) return
  tl.fromTo(header, { y: -16, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: D.header, ease: EASE_OUT }, at)
}

/**
 * Decor hands over: fade the layer out, rebuild the world for the incoming
 * screen while nothing is visible, fade back in. The swap happens exactly
 * once, at the mid-point.
 */
export function decorSwap(tl: gsap.core.Timeline, decor: HTMLElement | null, swap: () => void, at: gsap.Position = 0) {
  if (!decor) {
    tl.call(swap, [], at)
    return
  }
  tl.to(decor, { autoAlpha: 0, duration: D.decor, ease: EASE_IN }, at)
  tl.call(swap, [], `>`)
  tl.to(decor, { autoAlpha: 1, duration: D.decor, ease: EASE_OUT }, `>`)
}

/**
 * Clear what a timeline animated, so a layer is clean for the next one.
 * Only the animated properties: React owns the rest of the inline style
 * (layout), and `clearProps: 'all'` would wipe that too.
 */
export const ANIMATED_PROPS = 'opacity,visibility,transform,translate,rotate,scale'

export function clearInline(...targets: (Target | null)[]) {
  for (const t of targets) if (t) gsap.set(t, { clearProps: ANIMATED_PROPS })
}
