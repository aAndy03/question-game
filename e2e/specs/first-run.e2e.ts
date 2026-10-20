import { browser } from '@wdio/globals'
import { named, nameWorkspace, onStudio, press, sees } from '../support/app'

/**
 * A new install, end to end: an empty library opens on first run, which
 * creates the operator and loads the Demo, and lands on a shell that lists
 * what it loaded.
 */
describe('first run', () => {
  it('sets up an operator and the Demo', async () => {
    await onStudio()
    await sees('Create your first workspace', 30_000)
    await nameWorkspace('Classroom')
    await sees('Where things live', 30_000)
    await press('Next')

    await sees('Who runs the studio?')
    const name = await named('Display name')
    await name.setValue('E2E Operator')
    // Creating the operator moves on by itself.
    await press('Create operator')

    await sees('Load the sample games?')
    await press('Load Demo')
    // Loading the Demo moves on by itself.

    await sees('Defaults for new games')
    await press('Finish')

    await press('Teams')
    await sees('Red')
    await sees('Blue')
    expect(await browser.getTitle()).toContain('Studio')
  })
})
