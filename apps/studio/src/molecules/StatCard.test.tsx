import { describe, expect, it } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { StatCard } from './StatCard'

/** P20 (Task 10): a Statistics tile says what its number means. */

describe('StatCard', () => {
  it('T10-C2 a card is a group named by its label, with a value, an optional detail and an optional meter', () => {
    const { rerender } = render(<StatCard label="Accuracy" value="57%" detail="Beta" meter={{ value: 5, max: 12 }} />)
    const card = screen.getByRole('group', { name: 'Accuracy' })
    const value = within(card).getByText('57%')
    const detail = within(card).getByText('Beta')
    // Under the value, in reading order.
    expect(value.compareDocumentPosition(detail) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const meter = within(card).getByRole('meter', { name: 'Accuracy' })
    expect(meter.getAttribute('aria-valuenow')).toBe('5')
    expect(meter.getAttribute('aria-valuemax')).toBe('12')

    rerender(<StatCard label="Accuracy" value="57%" />)
    expect(screen.queryByRole('meter')).toBeNull()
    expect(screen.queryByText('Beta')).toBeNull()

    rerender(<StatCard label="Score" value={90} animate />)
    expect(screen.getByRole('group', { name: 'Score' }).textContent).toContain('90')
  })
})
