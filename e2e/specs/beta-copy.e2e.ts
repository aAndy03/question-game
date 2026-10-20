import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { browser } from '@wdio/globals'
import { closeWhatsNew, named, onStudio, press, sees } from '../support/app'
import { e2eFolders, stableFixtureDir } from '../support/folders'

/**
 * P13.1 (E2E03). questiongame Beta copies the stable library and leaves it
 * exactly as it was: the copy opens on the shell with the stable operator,
 * is backed up and shown what is new like any update, and the stable folder
 * holds the same files, byte for byte, afterwards.
 */
function snapshot(dir: string): Record<string, string> {
  return Object.fromEntries(readdirSync(dir).sort().map((n) => [n, readFileSync(path.join(dir, n)).toString('base64')]))
}

describe('questiongame Beta copies the stable library', () => {
  it('copies it, opens on it, and leaves the original untouched', async () => {
    const before = snapshot(stableFixtureDir())
    await onStudio()
    await sees('This is questiongame Beta. It keeps its own library, separate from questiongame.', 30_000)
    await press('Copy my stable library')

    await closeWhatsNew()
    expect(await (await named('questiongame Beta')).isExisting()).toBe(true)
    await press('Teams')
    await sees('Red')
    await sees('Blue')
    expect(await browser.getTitle()).toContain('Studio')

    const backups = readdirSync(path.join(e2eFolders()[0], 'backups'))
    expect(backups.some((name) => /^questiongame-1\.0\.1-\d{8}-\d{6}\.sqlite3$/.test(name))).toBe(true)
    expect(readdirSync(e2eFolders()[0]).some((n) => n.startsWith('stable-copy-'))).toBe(false)
    expect(snapshot(stableFixtureDir())).toEqual(before)
  })
})
