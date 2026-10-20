import { nameWorkspace, onStudio, press, sees } from '../support/app'

/** P13.1 (E2E02). *Start empty* leads into first run, on Beta's own library. */
describe('questiongame Beta, started empty', () => {
  it('goes to first run', async () => {
    await onStudio()
    await sees('This is questiongame Beta.', 30_000)
    await press('Start empty')
    // Beta 2.0: the welcome, then the first workspace by name, then first run.
    await sees('Create your first workspace')
    await nameWorkspace('Beta trial')
    await sees('Where things live')
  })
})
