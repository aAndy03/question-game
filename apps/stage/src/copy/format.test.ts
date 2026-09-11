import { describe, expect, it } from 'vitest'
import { STAGE_COPY, STAGE_COPY_RO } from './tables'
import { bracketed, clock, difficulty, grouped, hud, optionLetter, placeLabel, scoreWithUnit, sequencePosition, signedPoints } from './format'

const en = STAGE_COPY
const ro = STAGE_COPY_RO

describe('stage copy formatters', () => {
  it('joins label and value with the delimiter', () => {
    expect(hud(en, 'DOMAIN', 'Technology')).toBe('DOMAIN // Technology')
    expect(hud(en, 'CURRENT STANDINGS')).toBe('CURRENT STANDINGS //')
    expect(hud(en, 'DOMAIN', '  ')).toBe('DOMAIN //')
  })

  it('signs points, including zero', () => {
    expect(signedPoints(500)).toBe('+500')
    expect(signedPoints(0)).toBe('+0')
    expect(signedPoints(-50)).toBe('-50')
  })

  it('formats a clock in whole seconds and never below zero', () => {
    expect(clock(740_000)).toBe('12:20')
    expect(clock(740_000, 'always')).toBe('00:12:20')
    expect(clock(3_600_000 + 740_000)).toBe('01:12:20')
    expect(clock(-5_000)).toBe('00:00')
    expect(clock(999)).toBe('00:00')
    expect(bracketed(en, clock(740_000, 'always'))).toBe('[ 00:12:20 ]')
  })

  it('maps difficulty to authored bands', () => {
    expect(difficulty(en, 1)).toBe('EASY')
    expect(difficulty(en, 50)).toBe('MEDIUM')
    expect(difficulty(en, 100)).toBe('HARD')
  })

  it('groups thousands and labels places', () => {
    expect(grouped(en, 0)).toBe('0')
    expect(grouped(en, 600)).toBe('600')
    expect(grouped(en, 2400)).toBe('2,400')
    expect(grouped(en, 1234567)).toBe('1,234,567')
    expect(scoreWithUnit(en, 4200)).toBe('4,200 PTS')
    expect(placeLabel(en, 1)).toBe('PLACE_01')
    expect(placeLabel(en, 12)).toBe('PLACE_12')
  })

  it('derives letters and sequence positions from index', () => {
    expect(optionLetter(0)).toBe('A')
    expect(optionLetter(3)).toBe('D')
    expect(sequencePosition(en, 0)).toBe('01')
    expect(sequencePosition(en, 11)).toBe('12')
  })

  it('reads the table it is handed, never a module-level default', () => {
    expect(hud(ro, ro.domainLabel, 'Istorie')).toBe('DOMENIU // Istorie')
    expect(scoreWithUnit(ro, 4200)).toBe('4.200 PCT')
    expect(placeLabel(ro, 1)).toBe('LOCUL_01')
    expect(difficulty(ro, 50)).toBe('MEDIU')
    expect(sequencePosition(ro, 0)).toBe('01')
  })
})
