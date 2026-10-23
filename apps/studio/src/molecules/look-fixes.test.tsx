import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SliderField } from '@/atoms'
import { BulkBar } from './BulkBar'
import { DifficultyMapField } from './DifficultyMapField'
import { ManagerDialog } from './ManagerDialog'
import { StatsChart } from './StatsChart'
import { formatMetric } from './StatsTable'
import type { StatsResult } from '@/host/types'

/**
 * P20.14: what the look spec showed over the maintainer's Beta library
 * (1,022 questions, 15 domains, a 569-question game, six Plays).
 */
describe('over a real library', () => {
  it('writes big numbers grouped, as the Board writes points', () => {
    expect(formatMetric(81550, 'points')).toBe('81,550')
    expect(formatMetric(12_000, 'turns')).toBe('12,000')
    expect(formatMetric(468, 'turns')).toBe('468')
    expect(formatMetric(12.5, 'avg_points')).toBe('12.5')
    expect(formatMetric(0.67, 'accuracy')).toBe('67%')
  })

  it('draws no outline round an idle selection strip (class is the rule)', () => {
    const { container } = render(<BulkBar count={0} onPage={0} onClear={vi.fn()} />)
    const strip = container.querySelector('[data-bulk-strip]') as HTMLElement
    expect(strip.className).toContain('border-transparent')
    expect(strip.className).not.toContain('border-dashed')
  })

  it('collapses a chart with nothing to draw to its note', () => {
    const empty: StatsResult = { groupBy: 'team', metrics: ['turns'], rows: [], totals: { key: '', label: '', values: [null], turns: 0, plays: 0 }, playCount: 0, turnCount: 0 }
    render(<StatsChart result={empty} />)
    expect(screen.getByText('Nothing to chart yet.')).toBeTruthy()
    expect((screen.getByRole('img', { name: 'Statistics chart' }) as HTMLElement).style.height).toBe('0px')
  })

  it('keeps a number to a number’s width in a wide setting row (class is the rule)', () => {
    render(<DifficultyMapField value={{ kind: 'linear', factor: 10 }} onChange={vi.fn()} />)
    const field = screen.getByRole('textbox', { name: /points per difficulty point/i })
    expect(field.closest('.max-w-xs')).not.toBeNull()
  })

  it('shows a manager with nothing in it as its empty state alone, without an empty list beside it', () => {
    render(
      <ManagerDialog isOpen onClose={vi.fn()} title="Question tags" list={<p>the list</p>} detail={<p>the detail</p>} footer={null} empty={<p>No question tags yet</p>} />,
    )
    expect(screen.getByText('No question tags yet')).toBeTruthy()
    expect(screen.queryByText('the list')).toBeNull()
    expect(screen.queryByText('the detail')).toBeNull()
  })
  it('keeps a disabled slider at its width: every wrapper round it is a block (class is the rule)', () => {
    const { container } = render(<SliderField label="Speed weight" value={0.5} onChange={vi.fn()} minValue={0} maxValue={1} step={0.1} disabledReason="Has no effect" />)
    const trigger = container.querySelector('.tooltip__trigger') as HTMLElement
    expect(trigger.className).toContain('block')
    expect(trigger.className).toContain('w-full')
    expect((container.querySelector('[role="group"][aria-label="Has no effect"]') as HTMLElement).className).toContain('block w-full')
  })
})
