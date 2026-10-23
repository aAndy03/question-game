import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { BulkBar } from './BulkBar'
import { PageHeader } from './PageHeader'

/** P21: every page's chrome is at the Control strip's scale; rows, cards and dialogs are not. */
describe('compact page chrome', () => {
  it('a page header is compact', () => {
    const { container } = render(<PageHeader title="Teams" primaryAction={<button type="button">New team</button>} />)
    expect(container.querySelector('header')?.getAttribute('data-density')).toBe('compact')
  })

  it('the selection strip is compact and 36px (class is the rule)', () => {
    const { container } = render(<BulkBar count={0} onPage={0} onClear={vi.fn()} />)
    const strip = container.querySelector('[data-bulk-strip]') as HTMLElement
    expect(strip.getAttribute('data-density')).toBe('compact')
    expect(strip.className).toContain('h-9')
  })
})
