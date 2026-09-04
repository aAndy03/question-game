import { describe, expect, it } from 'vitest'
import { bracketed, clock, difficulty, grouped, hud, optionLetter, placeLabel, scoreWithUnit, sequencePosition, signedPoints } from './format'

describe('stage copy formatters', () => {
  it('joins label and value with the delimiter', () => {
    expect(hud('DOMAIN', 'Technology')).toBe('DOMAIN // Technology')
    expect(hud('CURRENT STANDINGS')).toBe('CURRENT STANDINGS //')
    expect(hud('DOMAIN', '  ')).toBe('DOMAIN //')
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
    expect(bracketed(clock(740_000, 'always'))).toBe('[ 00:12:20 ]')
  })

  it('maps difficulty to authored bands', () => {
    expect(difficulty(1)).toBe('EASY')
    expect(difficulty(50)).toBe('MEDIUM')
    expect(difficulty(100)).toBe('HARD')
  })

  it('groups thousands and labels places', () => {
    expect(grouped(0)).toBe('0')
    expect(grouped(600)).toBe('600')
    expect(grouped(2400)).toBe('2,400')
    expect(grouped(1234567)).toBe('1,234,567')
    expect(scoreWithUnit(4200)).toBe('4,200 PTS')
    expect(placeLabel(1)).toBe('PLACE_01')
    expect(placeLabel(12)).toBe('PLACE_12')
  })

  it('derives letters and sequence positions from index', () => {
    expect(optionLetter(0)).toBe('A')
    expect(optionLetter(3)).toBe('D')
    expect(sequencePosition(0)).toBe('01')
    expect(sequencePosition(11)).toBe('12')
  })
})
