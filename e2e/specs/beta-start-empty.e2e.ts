import { onStudio, press, sees } from '../support/app'

/** P13.1 (E2E02). *Start empty* leads into first run, on Beta's own library. */
describe('questiongame Beta, started empty', () => {
  it('goes to first run', async () => {
    await onStudio()
    await sees('This is questiongame Beta.', 30_000)
    await press('Start empty')
    await sees('Where things live')
  })
})
