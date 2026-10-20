import { $ } from '@wdio/globals'
import { onStudio, sees } from '../support/app'

/** P13.1 (E2E01). With no stable library there is nothing to copy. */
describe('questiongame Beta without a stable library', () => {
  it('offers only Start empty', async () => {
    await onStudio()
    await sees('This is questiongame Beta.', 30_000)
    await sees('Start empty')
    expect(await $('button=Copy my stable library').isExisting()).toBe(false)
  })
})
