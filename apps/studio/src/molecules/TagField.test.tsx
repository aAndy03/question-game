import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { TagField } from './TagField'
import { GROUPS_TAGS } from '@/copy/groupsTags'

function Harness({ initial = [], known = [] }: { initial?: string[]; known?: string[] }) {
  const [tags, setTags] = useState<string[]>(initial)
  return (
    <>
      <TagField value={tags} onChange={setTags} known={known} />
      <output data-testid="tags">{tags.join('|')}</output>
      <span data-keep-draft>
        <button type="button">Cancel</button>
      </span>
      <button type="button">Elsewhere</button>
    </>
  )
}
const field = () => screen.getByRole('textbox', { name: new RegExp(GROUPS_TAGS.tagsLabel) })
const tags = () => screen.getByTestId('tags').textContent

describe('TagField', () => {
  it('a suggestion picked with the mouse is the tag added, not the half-typed text', async () => {
    const user = userEvent.setup()
    render(<Harness known={['Christmas']} />)
    await user.type(field(), 'chr')
    await user.click(screen.getByRole('button', { name: 'Christmas' }))
    expect(tags()).toBe('Christmas')
  })

  it('a pasted list with commas is several tags', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(field())
    await user.paste('Romans, Wars,Ancient')
    expect(tags()).toBe('Romans|Wars')
    expect((field() as HTMLInputElement).value).toBe('Ancient')
  })

  it('leaving for Cancel does not commit the typed text; leaving elsewhere does', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(field(), 'draft')
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(tags()).toBe('')
    await user.click(field())
    await user.click(screen.getByRole('button', { name: 'Elsewhere' }))
    expect(tags()).toBe('draft')
  })

  it('at 20 tags the field keeps focus and says why', async () => {
    const user = userEvent.setup()
    render(<Harness initial={Array.from({ length: 20 }, (_, i) => `t${i}`)} />)
    expect((field() as HTMLInputElement).disabled).toBe(false)
    await user.type(field(), 'one more{Enter}')
    expect(screen.getByText(GROUPS_TAGS.tagsFull)).toBeTruthy()
    expect(document.activeElement).toBe(field())
  })

  it('names the chip list and the offers apart, and says a removal aloud', async () => {
    const user = userEvent.setup()
    render(<Harness initial={['Romans']} known={['Rome']} />)
    expect(screen.getByRole('list', { name: GROUPS_TAGS.tagsOnQuestion })).toBeTruthy()
    await user.type(field(), 'ro')
    expect(screen.getByRole('group', { name: GROUPS_TAGS.tagsOffered })).toBeTruthy()
    await user.clear(field())
    await user.type(field(), '{Backspace}')
    expect(tags()).toBe('')
    expect(screen.getByText(GROUPS_TAGS.tagRemoved('Romans'))).toBeTruthy()
  })
})
