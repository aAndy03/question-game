/**
 * Per-screen motion: how each screen enters and how it leaves. A transition
 * between any two screens composes `exit(from)` + decor handover +
 * `enter(to)` (see transitions/index.ts), so every one of the 42 pairs has a
 * specific shape from 7 enters and 7 exits, and a bespoke pair can still
 * override the composition.
 *
 * Enters animate the *parts* of the incoming page (title, rows, cards) with
 * opacity and position only — never `visibility`, which React owns for
 * hidden-but-mounted nodes (unrevealed options, an unrevealed champion).
 * Exits animate the whole outgoing layer.
 */

import gsap from 'gsap'
import type { StageScreen } from '@questiongame/contract'
import { D, EASE_IN, EASE_OUT, fadeOut, riseIn, slideOutLeft } from './beats'

export interface ScreenMotion {
  /** Bring the incoming layer's parts in, starting at `at`. */
  enter(tl: gsap.core.Timeline, layer: HTMLElement, at: number): void
  /** Take the outgoing layer away, starting at `at`. */
  exit(tl: gsap.core.Timeline, layer: HTMLElement, at: number): void
}

const q = (layer: HTMLElement, selector: string) => layer.querySelectorAll<HTMLElement>(selector)
const one = (layer: HTMLElement, selector: string) => layer.querySelector<HTMLElement>(selector)

/** A title slides in from the left. */
function titleIn(tl: gsap.core.Timeline, el: HTMLElement | null, at: number) {
  if (el) tl.fromTo(el, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: D.in, ease: EASE_OUT }, at)
}

/** A block fades up from slightly below. */
function blockIn(tl: gsap.core.Timeline, el: HTMLElement | null, at: number, distance = 24) {
  if (el) tl.fromTo(el, { y: distance, opacity: 0 }, { y: 0, opacity: 1, duration: D.in, ease: EASE_OUT }, at)
}

/** A block settles from a hair larger, for the interstitials. */
function settleIn(tl: gsap.core.Timeline, el: HTMLElement | null, at: number) {
  if (el) tl.fromTo(el, { scale: 1.04, opacity: 0 }, { scale: 1, opacity: 1, duration: D.in, ease: EASE_OUT }, at)
}

const fadeExit: ScreenMotion['exit'] = (tl, layer, at) => fadeOut(tl, layer, at)

export const SCREEN_MOTION: Record<StageScreen, ScreenMotion> = {
  idle: {
    enter(tl, layer, at) {
      const column = one(layer, '[data-page="idle"]')
      if (column) tl.fromTo(column, { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: D.in, ease: EASE_OUT }, at)
    },
    exit: (tl, layer, at) => slideOutLeft(tl, layer, at),
  },
  teamOrder: {
    enter(tl, layer, at) {
      titleIn(tl, one(layer, '[data-node-id="teamOrder.title"]'), at)
      riseIn(tl, q(layer, '[data-node-id^="teamOrder.row."]'), at + 0.1)
    },
    exit: fadeExit,
  },
  chooseDomain: {
    enter(tl, layer, at) {
      titleIn(tl, one(layer, '[data-node-id="chooseDomain.title"]'), at)
      riseIn(tl, q(layer, '[data-node-id^="chooseDomain.card."]'), at + 0.1)
    },
    exit: fadeExit,
  },
  question: {
    enter(tl, layer, at) {
      blockIn(tl, one(layer, '[data-node-id="question.category"]'), at, 12)
      blockIn(tl, one(layer, '[data-node-id="question.stem"]')?.parentElement ?? null, at + 0.05)
      blockIn(tl, one(layer, '[data-node-id="question.timer"]')?.parentElement ?? null, at + 0.1)
      const rule = one(layer, '[role="separator"]')
      if (rule) tl.fromTo(rule, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: D.in, ease: EASE_OUT }, at + 0.15)
      riseIn(tl, q(layer, '[data-node-id^="question.option."]'), at + 0.25)
    },
    exit: fadeExit,
  },
  scoreboard: {
    enter(tl, layer, at) {
      titleIn(tl, one(layer, '[data-node-id="scoreboard.title"]'), at)
      riseIn(tl, q(layer, '[data-node-id^="scoreboard.row."]'), at + 0.1)
    },
    exit: fadeExit,
  },
  finalLeaderboard: {
    enter(tl, layer, at) {
      blockIn(tl, one(layer, '[data-node-id="finalLeaderboard.title"]'), at, 12)
      blockIn(tl, one(layer, '[data-node-id="finalLeaderboard.champion"]'), at + 0.05)
      const rule = one(layer, '[role="separator"]')
      if (rule) tl.fromTo(rule, { scaleX: 0, transformOrigin: 'left center' }, { scaleX: 1, duration: D.in, ease: EASE_OUT }, at + 0.1)
      riseIn(tl, q(layer, '[data-node-id^="finalLeaderboard.row."]'), at + 0.2)
    },
    exit: fadeExit,
  },
  currentTeam: {
    enter(tl, layer, at) {
      settleIn(tl, one(layer, '[data-decor-solid]'), at)
    },
    exit(tl, layer, at) {
      tl.to(layer, { scale: 0.98, autoAlpha: 0, duration: D.out, ease: EASE_IN }, at)
    },
  },
}
