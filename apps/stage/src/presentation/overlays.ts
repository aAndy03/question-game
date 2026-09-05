/**
 * Overlay animations: how each `OverlayRequest` enters, holds, and leaves.
 *
 * The host owns the queue; Stage plays whatever is `active`, runs it to
 * completion (never killed mid-beat), and reports `overlay:<kind>` once.
 * The screen underneath is never touched: the sheet is a sibling layer, so a
 * revealed option keeps its DOM node and its state through any overlay
 * (spec §2.6).
 *
 * Every overlay is enter → hold → exit. The hold is what the audience reads;
 * the beats are short and decisive like everything else on Stage.
 *
 *   token-handoff     sheet fades in; old name strikes through and dims; the
 *                     arrow draws; NOW PLAYING and the new name rise
 *   round-advance     sheet fades in; the line settles
 *   multiple-answers  the word settles; the letter boxes pop in one by one
 *   outcome           the half sheet rises from the bottom edge; the verdict
 *                     word punches in; a burst of `+` or `-` particles flies
 *                     up and falls under gravity (Physics2DPlugin)
 */

import gsap from 'gsap'
import { Physics2DPlugin } from 'gsap/Physics2DPlugin'
import { animKey, type OverlayRequest } from '@questiongame/contract'
import { decorAsset } from '@/decor'
import { stageEvents } from '@/host/events'
import { D, EASE_IN, EASE_OUT, clearParts } from './beats'
import { motionConfig } from './presentation'

gsap.registerPlugin(Physics2DPlugin)

/** Overlay timing, seconds. One place, like the transition beats. */
export const OVERLAY_D = {
  in: 0.45,
  /** When each enter has finished arriving; the hold counts from here. */
  enterEnd: { 'token-handoff': 1.05, 'round-advance': 0.65, 'multiple-answers': 1.0, outcome: 0.7 } satisfies Record<OverlayRequest['kind'], number>,
  /** How long the audience reads it. */
  hold: { 'token-handoff': 1.4, 'round-advance': 1.0, 'multiple-answers': 1.2, outcome: 1.4 } satisfies Record<OverlayRequest['kind'], number>,
  out: 0.4,
  /** Outcome burst. */
  particles: 16,
  particleLife: 1.4,
} as const

export interface OverlayContext {
  readonly request: OverlayRequest
  /** The sheet element (`[data-overlay]`), already rendered with its content. */
  readonly sheet: HTMLElement
}

export interface RunningOverlay {
  readonly timeline: gsap.core.Timeline
  readonly kind: OverlayRequest['kind']
  readonly request: OverlayRequest
  /** Jump to the end and report now (tests, or a host that must not wait). */
  finish(): void
}

const q = (el: HTMLElement, s: string) => el.querySelectorAll<HTMLElement>(s)
const one = (el: HTMLElement, s: string) => el.querySelector<HTMLElement>(s)

function enterHandoff(tl: gsap.core.Timeline, sheet: HTMLElement) {
  tl.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: OVERLAY_D.in * 0.6, ease: EASE_OUT }, 0)
  const from = one(sheet, '[data-overlay-from]')
  const arrow = one(sheet, '[data-arrow]')
  const label = one(sheet, '[data-overlay-label]')
  const to = one(sheet, '[data-overlay-to]')
  if (from) tl.fromTo(from, { x: 40, opacity: 0 }, { x: 0, opacity: 1, duration: OVERLAY_D.in, ease: EASE_OUT }, 0.1)
  if (arrow) tl.fromTo(arrow, { scaleX: 0, transformOrigin: 'left center', opacity: 0 }, { scaleX: 1, opacity: 1, duration: OVERLAY_D.in, ease: EASE_OUT }, 0.3)
  if (label) tl.fromTo(label, { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: OVERLAY_D.in, ease: EASE_OUT }, 0.45)
  if (to) tl.fromTo(to, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: D.in, ease: EASE_OUT }, 0.5)
}

function enterRound(tl: gsap.core.Timeline, sheet: HTMLElement) {
  tl.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: OVERLAY_D.in * 0.6, ease: EASE_OUT }, 0)
  const word = one(sheet, '[data-overlay-word]')
  if (word) tl.fromTo(word, { scale: 1.04, opacity: 0 }, { scale: 1, opacity: 1, duration: D.in, ease: EASE_OUT }, 0.1)
}

function enterMultiple(tl: gsap.core.Timeline, sheet: HTMLElement) {
  tl.fromTo(sheet, { opacity: 0 }, { opacity: 1, duration: OVERLAY_D.in * 0.6, ease: EASE_OUT }, 0)
  const word = one(sheet, '[data-overlay-word]')
  const boxes = q(sheet, '[data-label-box]')
  if (word) tl.fromTo(word, { scale: 1.04, opacity: 0 }, { scale: 1, opacity: 1, duration: D.in, ease: EASE_OUT }, 0.1)
  if (boxes.length) tl.fromTo(boxes, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: 'back.out(2)', stagger: 0.08 }, 0.4)
}

function enterOutcome(tl: gsap.core.Timeline, sheet: HTMLElement, request: Extract<OverlayRequest, { kind: 'outcome' }>) {
  // The half sheet rises from the bottom edge over the question.
  tl.fromTo(sheet, { yPercent: 100 }, { yPercent: 0, duration: OVERLAY_D.in, ease: EASE_OUT }, 0)
  const word = one(sheet, '[data-overlay-word]')
  if (word) tl.fromTo(word, { scale: 1.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.4, ease: 'power4.out' }, 0.3)
  if (word) burst(tl, sheet, word, request.verdict === 'correct' ? 'plus' : 'minus', request.verdict === 'correct' ? 'var(--state-correct)' : 'var(--state-incorrect)', 0.35)
}

/**
 * A burst of small `+` or `-` pieces out of the verdict word: up and out at
 * seeded-looking but deterministic angles, then falling under gravity while
 * fading. Physics2DPlugin does the arcs; the pieces are removed at the end.
 */
function burst(tl: gsap.core.Timeline, sheet: HTMLElement, origin: HTMLElement, asset: 'plus' | 'minus', color: string, at: number) {
  const markup = decorAsset(asset).markup
  const sheetRect = sheet.getBoundingClientRect()
  const wordRect = origin.getBoundingClientRect()
  const cx = wordRect.left - sheetRect.left + wordRect.width / 2
  const cy = wordRect.top - sheetRect.top + wordRect.height / 2
  const pieces: HTMLElement[] = []
  const n = OVERLAY_D.particles
  for (let i = 0; i < n; i++) {
    const el = document.createElement('div')
    el.setAttribute('data-overlay-particle', asset)
    const size = 28 + ((i * 37) % 40)
    el.style.cssText = `position:absolute;left:${cx - size / 2}px;top:${cy - size / 2}px;width:${size}px;height:${size}px;color:${color};line-height:0;pointer-events:none;opacity:0`
    el.innerHTML = markup
    sheet.appendChild(el)
    pieces.push(el)
  }
  pieces.forEach((el, i) => {
    const t = i / n
    const angle = -160 + t * 140 // degrees: up-left to up-right
    const velocity = 520 + ((i * 53) % 260)
    tl.set(el, { opacity: 1, rotation: (i * 47) % 360 }, at)
    tl.to(el, { physics2D: { velocity, angle, gravity: 1100 }, rotation: `+=${(i % 2 ? 1 : -1) * 180}`, duration: OVERLAY_D.particleLife, ease: 'none' }, at)
    tl.to(el, { opacity: 0, duration: 0.4, ease: EASE_IN }, at + OVERLAY_D.particleLife - 0.4)
  })
  tl.call(() => pieces.forEach((p) => p.remove()), [], at + OVERLAY_D.particleLife + 0.05)
}

function exit(tl: gsap.core.Timeline, sheet: HTMLElement, request: OverlayRequest, at: number) {
  if (request.kind === 'outcome') tl.to(sheet, { yPercent: 100, duration: OVERLAY_D.out, ease: EASE_IN }, at)
  else tl.to(sheet, { opacity: 0, duration: OVERLAY_D.out, ease: EASE_IN }, at)
}

export function buildOverlay(ctx: OverlayContext): gsap.core.Timeline {
  const tl = gsap.timeline()
  const { request, sheet } = ctx
  switch (request.kind) {
    case 'token-handoff':
      enterHandoff(tl, sheet)
      break
    case 'round-advance':
      enterRound(tl, sheet)
      break
    case 'multiple-answers':
      enterMultiple(tl, sheet)
      break
    case 'outcome':
      enterOutcome(tl, sheet, request)
      break
  }
  // The burst may still be falling while the sheet leaves; that is the intent.
  const holdUntil = OVERLAY_D.enterEnd[request.kind] + OVERLAY_D.hold[request.kind]
  exit(tl, sheet, request, holdUntil)
  return tl
}

export function runOverlay(ctx: OverlayContext, onComplete: () => void): RunningOverlay {
  const key = animKey.overlay(ctx.request.kind)
  let done = false
  const complete = () => {
    if (done) return
    done = true
    clearParts(ctx.sheet, ...ctx.sheet.querySelectorAll<HTMLElement>('[data-overlay-from],[data-overlay-to],[data-overlay-label],[data-overlay-word],[data-arrow],[data-label-box]'))
    for (const p of ctx.sheet.querySelectorAll('[data-overlay-particle]')) p.remove()
    onComplete()
    stageEvents.emit('anim-complete', { key })
  }
  const tl = buildOverlay(ctx)
  tl.eventCallback('onComplete', complete)
  if (motionConfig.immediate) tl.progress(1, false)
  return {
    timeline: tl,
    kind: ctx.request.kind,
    request: ctx.request,
    finish() {
      if (done) return
      tl.progress(1, false)
      complete()
      tl.kill()
    },
  }
}
