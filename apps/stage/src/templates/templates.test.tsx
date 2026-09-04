import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SplitFrame, StageFrame } from './index'

describe('templates', () => {
  it('StageFrame is the fixed canvas with header, body and decor slots', () => {
    const { container } = render(
      <StageFrame screen="idle" header={<b>H</b>} decor={<i>D</i>}>
        body
      </StageFrame>,
    )
    const frame = container.querySelector('[data-stage-frame]') as HTMLElement
    expect(frame.style.width).toBe('var(--stage-width)')
    expect(frame.style.height).toBe('var(--stage-height)')
    expect(frame.dataset.screen).toBe('idle')
    expect(container.querySelector('[data-stage-header-slot] b')).toBeTruthy()
    expect(container.querySelector('[data-stage-decor] i')).toBeTruthy()
    expect((container.querySelector('[data-stage-content]') as HTMLElement).style.padding).toBe('var(--stage-padding)')
  })

  it('SplitFrame sizes the aside from the layout tokens', () => {
    const { container } = render(
      <SplitFrame aside={<span>aside</span>} asideWidth="max">
        content
      </SplitFrame>,
    )
    const aside = container.querySelector('[data-split-aside]') as HTMLElement
    expect(aside.style.width).toBe('var(--stage-decor-column-max)')
  })
})
