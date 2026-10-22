import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { WizardLayout } from './WizardLayout'

/** P20: first run, the Beta welcome and Name your workspace draw no lines and no bar at the foot. */
describe('WizardLayout', () => {
  it('ends the step with its actions, inside the body, with no footer bar', () => {
    render(
      <WizardLayout brand="questiongame" steps={<ol aria-label="Steps" />} footer={<button type="button">Next</button>}>
        <p>Step body</p>
      </WizardLayout>,
    )
    const next = screen.getByRole('button', { name: 'Next' })
    const main = screen.getByRole('main')
    expect(main.contains(next)).toBe(true)
    // After the step's own content, in the same column.
    expect(screen.getByText('Step body').compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(document.querySelector('footer')).toBeNull()
    // No rule under the step rail (class is the rule).
    expect(document.querySelector('[class*="border-b"]')).toBeNull()
  })
})
