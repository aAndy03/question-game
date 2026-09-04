import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { CategoryCode, ClockDigits, LabelBox, PointsFigure, Rule, Tag, Text, insetBorder, insetHeaderRule } from './index'

describe('atoms', () => {
  it('Text resolves a variant to tokens, never raw values', () => {
    render(<Text variant="stage-hud">DOMAIN</Text>)
    const el = screen.getByText('DOMAIN')
    expect(el.style.fontSize).toMatch(/^var\(--/)
    expect(el.style.fontFamily).toMatch(/^var\(--/)
    expect(el.style.textTransform).toMatch(/^var\(--/)
    expect(el.dataset.textTransition).toBe('none')
  })

  it('Text carries a node id when given one', () => {
    render(
      <Text variant="stage-question" nodeId="question.stem">
        Stem
      </Text>,
    )
    expect(screen.getByText('Stem').dataset.nodeId).toBe('question.stem')
  })

  it('Tag has no radius and no border', () => {
    render(<Tag tone="leader">LEADER</Tag>)
    const el = screen.getByText('LEADER')
    expect(el.style.borderRadius).toBe('var(--radius-none)')
    expect(el.style.boxShadow).toBe('')
  })

  it('LabelBox is the only 4px surface', () => {
    const { container } = render(<LabelBox>A</LabelBox>)
    const box = container.querySelector('[data-label-box]') as HTMLElement
    expect(box.style.borderRadius).toBe('var(--radius-sm)')
    expect(box.style.boxShadow).toContain('inset')
  })

  it('PointsFigure derives the sign and reads the unit from copy', () => {
    render(<PointsFigure points={0} />)
    expect(screen.getByText('+0')).toBeTruthy()
    expect(screen.getByText('PTS')).toBeTruthy()
  })

  it('ClockDigits formats the given milliseconds and does not tick', () => {
    render(<ClockDigits ms={740_000} hours="always" />)
    expect(screen.getByText('[ 00:12:20 ]')).toBeTruthy()
  })

  it('CategoryCode renders whatever code it is given', () => {
    render(<CategoryCode code="GEO_105" />)
    expect(screen.getByText('GEO_105')).toBeTruthy()
  })

  it('Rule uses a sanctioned weight token', () => {
    const { container } = render(<Rule weight="heavy" />)
    const el = container.querySelector('[data-rule]') as HTMLElement
    expect(el.style.height).toBe('var(--border-heavy)')
  })

  it('inset borders are box-shadows, and the header rule is asymmetric', () => {
    expect(insetBorder({ top: 'thin' })).toBe('inset 0 var(--border-thin) 0 0 var(--border-default)')
    const header = insetHeaderRule()
    expect(header).toContain('calc(-1 * var(--border-thick))')
    expect(header.split(',').length).toBe(4)
  })
})
