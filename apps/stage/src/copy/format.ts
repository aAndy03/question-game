/**
 * Formatters that turn derived values into Stage strings. Pure functions,
 * testable with no DOM. They read `STAGE_COPY` so an authored change flows
 * through without touching a component.
 */

import { DIFFICULTY_BANDS, OPTION_LETTERS, STAGE_COPY } from './index'

/** `DOMAIN // TECHNOLOGY`. With an empty value: `DOMAIN //`. */
export function hud(label: string, value?: string | null): string {
  const v = value?.trim()
  return v ? `${label} ${STAGE_COPY.delimiter} ${v}` : `${label} ${STAGE_COPY.delimiter}`
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
export function grouped(n: number): string {
  const sign = n < 0 ? '-' : ''
  const digits = String(Math.abs(Math.trunc(n)))
  return sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, STAGE_COPY.thousandsSeparator)
}

/** `2,400 PTS`. */
export function scoreWithUnit(n: number): string {
  return `${grouped(n)} ${STAGE_COPY.pointsUnit}`
}

/** `PLACE_01` from a competition rank (ties share a rank, so also a label). */
export function placeLabel(rank: number): string {
  return `${STAGE_COPY.placePrefix}${String(rank).padStart(STAGE_COPY.placeDigits, '0')}`
}

/** `[ 00:12:20 ]`. */
export function bracketed(text: string): string {
  return `${STAGE_COPY.clockOpen}${text}${STAGE_COPY.clockClose}`
}

/** 1–100 → the authored band label. */
export function difficulty(value: number): string {
  const band = DIFFICULTY_BANDS.find((b) => value <= b.max) ?? DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1]
  return band?.label ?? `${value}`
}

/** 0-based option index → `A`, `B`, … */
export function optionLetter(index: number): string {
  return OPTION_LETTERS[index] ?? `${index + 1}`
}

/** 0-based sequence position → `01`, `02`, … (prefix and padding from copy). */
export function sequencePosition(index: number): string {
  return `${STAGE_COPY.sequencePrefix}${String(index + 1).padStart(STAGE_COPY.sequenceDigits, '0')}`
}

/** What a domain card prints for the next question's difficulty. */
export function difficultyFigure(value: number): string {
  return STAGE_COPY.difficultyDisplay === 'band' ? difficulty(value) : `${value}`
}
