import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AnswerOption, DomainCard, ResultWidget, ScoreRow, SequenceRow, TeamChip, TimerPanel } from './index'

describe('molecules', () => {
  it('TeamChip derives its mark from the short code', () => {
    render(<TeamChip name="TEAM ALPHA" shortCode="ALPHA" />)
    expect(screen.getByText('A')).toBeTruthy()
    expect(screen.getByText('TEAM ALPHA')).toBeTruthy()
  })

  it('SequenceRow derives the position from the index', () => {
    render(<SequenceRow nodeId="teamOrder.row.t1" index={2} name="TEAM GAMMA" detail="Ardeal" score={250} />)
    expect(screen.getByText('03')).toBeTruthy()
    expect(screen.getByText('Ardeal')).toBeTruthy()
    expect(screen.getByText('CURRENT POINTS')).toBeTruthy()
    expect(document.querySelector('[data-node-id="teamOrder.row.t1"]')).toBeTruthy()
  })

  it('ScoreRow stays mounted when not revealed', () => {
    const { container } = render(
      <ScoreRow nodeId="finalLeaderboard.row.2" rank={2} name="TEAM BETA" shortCode="BETA" score={250} revealed={false} />,
    )
    const row = container.querySelector('[data-node-id="finalLeaderboard.row.2"]') as HTMLElement
    expect(row).toBeTruthy()
    expect(row.style.visibility).toBe('hidden')
  })

  it('DomainCard shows difficulty, name and selected state', () => {
    const { container } = render(
      <DomainCard nodeId="chooseDomain.card.d1" name="Technology" code="TEC_881" difficulty="10" selected />,
    )
    expect(screen.getByText('10')).toBeTruthy()
    expect(screen.getByText('TEC_881')).toBeTruthy()
    expect(screen.getByText('SELECTED')).toBeTruthy()
    expect(screen.getByText('Technology')).toBeTruthy()
    expect((container.querySelector('[data-node-id="chooseDomain.card.d1"]') as HTMLElement).dataset.selected).toBe('true')
  })

  it('AnswerOption is the 8px surface and hides without unmounting', () => {
    const { container } = render(<AnswerOption nodeId="question.option.o1" letter="B" text="Everest" state="correct" revealed={false} />)
    const card = container.querySelector('[data-node-id="question.option.o1"]') as HTMLElement
    expect(card.style.borderRadius).toBe('var(--radius-md)')
    expect(card.style.visibility).toBe('hidden')
    expect(card.dataset.state).toBe('correct')
  })

  it('TimerPanel formats whatever label and milliseconds it is given', () => {
    render(<TimerPanel label="TIMER" value="ELAPSED" ms={740_000} hours="always" />)
    expect(screen.getByText('TIMER // ELAPSED')).toBeTruthy()
    expect(screen.getByText('[ 00:12:20 ]')).toBeTruthy()
  })

  it('ResultWidget names the verdict from copy and shows the awarded points', () => {
    render(<ResultWidget nodeId="question.result" verdict="partial" points={0} />)
    expect(screen.getByText('RESULT // EXTRA SELECTION')).toBeTruthy()
    expect(screen.getByText('+0')).toBeTruthy()
  })
})
