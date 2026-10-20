import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { nameWorkspace, onStudio, press, sees } from '../support/app'
import { stableFixtureDir } from '../support/folders'

/**
 * P13.1 (E2E04). While questiongame runs it holds its library; Beta says to
 * close it first, and copies once it is closed.
 */
describe('questiongame Beta while questiongame is running', () => {
  it('asks to close it first, then copies', async () => {
    await onStudio()
    await sees('Close questiongame first, then copy.', 30_000)
    // "Close questiongame": hold_lock lets go when this file appears.
    writeFileSync(path.join(stableFixtureDir(), 'release'), '')
    await new Promise((r) => setTimeout(r, 1000))
    await press('Try again')
    await press('Copy my stable library')
    // The copy is a 1.x library: it moves into a workspace that needs a name.
    await nameWorkspace()
    await sees('What’s new in questiongame', 30_000)
  })
})
