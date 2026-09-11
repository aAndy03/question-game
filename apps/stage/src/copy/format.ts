/**
 * Formatters that turn derived values into Stage strings. Pure functions,
 * testable with no DOM. Each takes the resolved copy table it should read
 * from — explicitly, so nothing here can fall back to English behind the
 * operator's back — and a component gets that table from `useCopy()`.
 */

import { OPTION_LETTERS, type StageCopy } from './tables'

/** `DOMAIN // TECHNOLOGY`. With an empty value: `DOMAIN //`. */
export function hud(copy: StageCopy, label: string, value?: string | null): string {
  const v = value?.trim()
  return v ? `${label} ${copy.delimiter} ${v}` : `${label} ${copy.delimiter}`
}

/** `+500`, `+0`, `-50`. The unit is rendered separately so it can be styled. */
export function signedPoints(points: number): string {
  return points < 0 ? `${points}` : `+${points}`
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`
}

export type ClockHours = 'auto' | 'always' | 'never'

/**
 * `hh:mm:ss` / `mm:ss` from milliseconds. Never goes below zero and never
 * shows fractional seconds — the design system's clock is whole seconds.
 * `hours: 'auto'` shows the hour field only once it is non-zero.
 */
export function clock(ms: number, hours: ClockHours = 'auto'): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const showHours = hours === 'always' || (hours === 'auto' && h > 0)
  return showHours ? `${pad2(h)}:${pad2(m)}:${pad2(s)}` : `${pad2(m)}:${pad2(s)}`
}

/** `2,400` — digits grouped by the authored separator. */
export function grouped(copy: StageCopy, n: number): string {
  const sign = n < 0 ? '-' : ''
  const digits = String(Math.abs(Math.trunc(n)))
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, copy.thousandsSeparator)
}

/** `2,400 PTS`. */
export function scoreWithUnit(copy: StageCopy, n: number): string {
  return `${grouped(copy, n)} ${copy.pointsUnit}`
}

/** `PLACE_01` from a competition rank (ties share a rank, so also a label). */
export function placeLabel(copy: StageCopy, rank: number): string {
  return `${copy.placePrefix}${String(rank).padStart(copy.placeDigits, '0')}`
}

/** `[ 00:12:20 ]`. */
export function bracketed(copy: StageCopy, text: string): string {
  return `${copy.clockOpen}${text}${copy.clockClose}`
}

/** 1–100 → the authored band label. */
export function difficulty(copy: StageCopy, value: number): string {
  const bands = copy.difficultyBands
  const band = bands.find((b) => value <= b.max) ?? bands[bands.length - 1]
  return band?.label ?? `${value}`
}

/** 0-based option index → `A`, `B`, … */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? `${index + 1}`
}

/** 0-based sequence position → `01`, `02`, … (prefix and padding from copy). */
export function sequencePosition(copy: StageCopy, index: number): string {
  return `${copy.sequencePrefix}${String(index + 1).padStart(copy.sequenceDigits, '0')}`
}

/** What a domain card prints for the next question's difficulty. */
export function difficultyFigure(copy: StageCopy, value: number): string {
  return copy.difficultyDisplay === 'band' ? difficulty(copy, value) : `${value}`
}
