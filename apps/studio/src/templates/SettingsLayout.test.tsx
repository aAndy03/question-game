import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { SettingsLayout } from './SettingsLayout'

/**
 * P20 (Task 10): the Statistics window on its own display takes the room.
 * Class is the rule here — the cap *is* the class, and jsdom applies no CSS.
 */

function column(): HTMLElement {
  const el = document.querySelector<HTMLElement>('.\\@container\\/settings')
  if (!el) throw new Error('no column')
  return el
}

const maxWidths = (el: HTMLElement) => [...el.classList].filter((c) => c.startsWith('max-w-'))

describe('SettingsLayout', () => {
  it('T10-C8 `width="full"` puts no maximum on the column; `wide` and `form` keep theirs', () => {
    const { rerender } = render(
      <SettingsLayout header={null} tabs={null} width="full">
        body
      </SettingsLayout>,
    )
    expect(maxWidths(column())).toEqual([])

    rerender(
      <SettingsLayout header={null} tabs={null} width="wide">
        body
      </SettingsLayout>,
    )
    expect(maxWidths(column())).toEqual(['max-w-6xl'])

    rerender(
      <SettingsLayout header={null} tabs={null} width="form">
        body
      </SettingsLayout>,
    )
    expect(maxWidths(column())).toEqual(['max-w-3xl'])

    rerender(
      <SettingsLayout header={null} tabs={null}>
        body
      </SettingsLayout>,
    )
    expect(maxWidths(column())).toEqual(['max-w-3xl'])
  })
})
