/**
 * The Stage implementation of `Text` transitions (spec §2.29).
 *
 *   swap   the change should be seen: the old value drops and fades, the
 *          new one rises in (team name, domain, stem)
 *   count  a numeric roll: the number in the string tweens from the old
 *          value to the new one, the rest of the string is kept as-is
 *          (`2,400 PTS` → `2,650 PTS`, `00:29` → `00:28`)
 *
 * Both are GSAP tweens on the node React already updated, so the DOM ends at
 * the truth React rendered; the tween only shapes the way there. Neither
 * touches `visibility`. With `motionConfig.immediate` they finish at once.
 */

import gsap from 'gsap'
import { D, EASE_OUT } from './beats'
import { motionConfig } from './presentation'

const NUMBERS = /-?\d[\d,]*(?:\.\d+)?/g

/** Grouping separator used in a rendered number, if any. */
function separatorOf(text: string): string {
  return /\d,\d/.test(text) ? ',' : ''
}

function group(n: number, sep: string): string {
  const s = String(Math.round(n))
  return sep ? s.replace(/\B(?=(\d{3})+(?!\d))/g, sep) : s
}

export function swapText(el: HTMLElement): gsap.core.Tween {
  const tween = gsap.fromTo(el, { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: D.item, ease: EASE_OUT, clearProps: 'opacity,transform' })
  if (motionConfig.immediate) tween.progress(1, false)
  return tween
}

/**
 * Roll the first number in `el` from the number in `previous` to the one in
 * the current text. Zero-padding and grouping follow the current text.
 */
export function countText(el: HTMLElement, previous: string): gsap.core.Tween | null {
  const target = el.textContent ?? ''
  // Pair the numbers in both strings by position and roll the first that
  // differs: `00:29` → `00:28` rolls the seconds, `2,400 PTS` the score.
  const tos = [...target.matchAll(NUMBERS)]
  const froms = [...previous.matchAll(NUMBERS)]
  let to: RegExpMatchArray | undefined
  let fromNum = NaN
  for (let i = 0; i < Math.min(tos.length, froms.length); i++) {
    const a = Number(froms[i]![0].replace(/,/g, ''))
    const b = Number(tos[i]![0].replace(/,/g, ''))
    if (Number.isFinite(a) && Number.isFinite(b) && a !== b) {
      to = tos[i]
      fromNum = a
      break
    }
  }
  if (!to || to.index === undefined) return null
  const toNum = Number(to[0].replace(/,/g, ''))

  const sep = separatorOf(to[0])
  const width = to[0].replace(/,/g, '').replace('-', '').length
  const pad = /^0\d/.test(to[0])
  const before = target.slice(0, to.index)
  const after = target.slice(to.index + to[0].length)
  const proxy = { n: fromNum }
  const write = () => {
    let digits = group(proxy.n, sep)
    if (pad) digits = digits.padStart(width, '0')
    el.textContent = `${before}${digits}${after}`
  }
  const tween = gsap.to(proxy, {
    n: toNum,
    duration: D.in,
    ease: 'power2.out',
    onUpdate: write,
    onComplete: () => {
      el.textContent = target
    },
  })
  if (motionConfig.immediate) tween.progress(1, false)
  return tween
}
