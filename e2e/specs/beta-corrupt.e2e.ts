import { nameWorkspace, onStudio, press, sees } from '../support/app'

/** P13.1 (E2E05). A stable library that will not read is said so, and Start empty still works. */
describe('questiongame Beta with an unreadable stable library', () => {
  it('says the copy failed and still starts empty', async () => {
    await onStudio()
    await sees('This is questiongame Beta.', 30_000)
    await press('Copy my stable library')
    await sees('Your stable library could not be copied')
    await press('Start empty')
    await nameWorkspace()
    await sees('Where things live')
  })
})
