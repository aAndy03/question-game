import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MeterBar } from './MeterBar'

/** P20 (Task 10): the bar under a Statistics tile. */

function fill(meter: HTMLElement): HTMLElement {
  const el = meter.querySelector<HTMLElement>('[data-meter-fill]')
  if (!el) throw new Error('no fill')
  return el
}

describe('MeterBar', () => {
  it('T10-C1 a labelled meter that never overflows', () => {
    const { rerender } = render(<MeterBar value={1} max={4} label="Questions" />)
    const meter = screen.getByRole('meter', { name: 'Questions' })
    expect(meter.getAttribute('aria-valuemin')).toBe('0')
    expect(meter.getAttribute('aria-valuemax')).toBe('4')
    expect(meter.getAttribute('aria-valuenow')).toBe('1')
    expect(fill(meter).style.width).toBe('25%')

    rerender(<MeterBar value={9} max={4} label="Questions" />)
    expect(fill(screen.getByRole('meter', { name: 'Questions' })).style.width).toBe('100%')

    rerender(<MeterBar value={3} max={0} label="Questions" />)
    const empty = screen.getByRole('meter', { name: 'Questions' })
    expect(fill(empty).style.width).toBe('0%')
    expect(empty.outerHTML).not.toContain('NaN')
  })
})
