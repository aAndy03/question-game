import { readdirSync } from 'node:fs'
import path from 'node:path'
import { browser } from '@wdio/globals'
import { nameWorkspace, onStudio, press, sees } from '../support/app'
import { e2eFolders } from '../support/folders'

/**
 * P12.6 and P12.10, on the real app. The library on disk is one 1.0.1 would
 * have left — the Demo, an operator, and no version stamp — so this build's
 * first boot must copy it before touching it, keep every row, and say what is
 * new, once.
 */
describe('an update', () => {
  it('backs the library up, keeps it, and shows what is new', async () => {
    await onStudio()
    // Beta 2.0: the library moved into one unnamed workspace; the operator names it.
    await nameWorkspace('Quiz club')
    await sees('What’s new in questiongame', 30_000)
    await sees('More than one question at the same difficulty')

    const backups = readdirSync(path.join(e2eFolders()[0], 'backups'))
    // The copy before the workspaces migration is pinned outside the rotation.
    expect(backups.some((name) => /^questiongame-pre-workspaces-\d{8}-\d{6}\.sqlite3$/.test(name))).toBe(true)

    await press('Got it')
    await browser.waitUntil(async () => !(await (await browser.$('body')).getText()).includes('What’s new in questiongame'), {
      timeoutMsg: 'What’s new did not close',
    })

    await press('Teams')
    await sees('Red')
    await sees('Blue')
  })
})
